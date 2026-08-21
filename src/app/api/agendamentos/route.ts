import { NextRequest, NextResponse } from "next/server";
import { Prisma, StatusAgendamento } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";
import { buscarAgendamentosOcupados, calcularHorariosLivres, conflitaComOcupados } from "@/lib/horarios";
import { notificarNovoAgendamento } from "@/lib/whatsapp";
import { criarTokenAgendamentoConvidado, pegarSessao } from "@/lib/auth";

const schema = z.object({
  barbeiroId: z.string(),
  // Um agendamento pode ter mais de um corte (ex.: cabelo + barba) — ver
  // AgendamentoServico no schema. Limite de 10 é só uma guarda contra
  // payload abusivo, não uma regra de negócio real.
  servicoIds: z
    .array(z.string())
    .min(1, "Escolha pelo menos um corte")
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, "Corte repetido na lista"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "2026-08-20"
  hora: z.string().regex(/^\d{2}:\d{2}$/), // "14:30"
  // Só usados por quem NÃO está logado (regra de negócio 15) — cliente
  // "convidado", sem conta. Ignorados quando existe sessão de CLIENTE.
  nomeCliente: z.string().min(2).optional(),
  whatsapp: z.string().optional(),
});

// Usado só pra sinalizar, de dentro da transação abaixo, que o horário foi
// tomado por outra requisição — nunca chega a sair da função POST.
class HorarioIndisponivelError extends Error {}

// POST: cliente solicita um agendamento (um ou mais cortes de uma vez).
// Fica como PENDENTE até o barbeiro aceitar ou recusar — ninguém mais
// consegue pegar o mesmo horário enquanto ele está pendente (ver
// calcularHorariosLivres). Funciona logado (CLIENTE) OU sem conta —
// nesse caso nomeCliente+whatsapp identificam quem é (regra de negócio 15).
export async function POST(req: NextRequest) {
  const sessaoBruta = await pegarSessao();
  // Só CLIENTE ou "ninguém" (convidado) podem pedir agendamento — um
  // BARBEIRO/DONO/ADMIN logado tentando isso é rejeitado, nunca vira
  // convidado sem querer.
  if (sessaoBruta && sessaoBruta.papel !== "CLIENTE") {
    return NextResponse.json({ erro: "Essa conta não é de cliente" }, { status: 403 });
  }

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  const { barbeiroId, servicoIds, data, hora } = dados.data;

  // Resolve quem é o cliente: sessão existente, ou acha/cria um "convidado"
  // pelo WhatsApp normalizado (mesmo WhatsApp = mesmo cliente por baixo dos
  // panos, mesmo sem conta — assim um relatório futuro de clientes
  // inativos consegue agrupar certinho). Feito ANTES da transação de
  // horário, de propósito — não é uma operação crítica de concorrência
  // como reservar o horário é, então não precisa competir pelo lock dela.
  let clienteId: string;
  if (sessaoBruta) {
    clienteId = sessaoBruta.usuarioId;
  } else {
    const whatsappNormalizado = (dados.data.whatsapp || "").replace(/\D/g, "");
    if (whatsappNormalizado.length < 8) {
      return NextResponse.json({ erro: "Informe um WhatsApp válido" }, { status: 400 });
    }
    if (!dados.data.nomeCliente) {
      return NextResponse.json({ erro: "Informe seu nome" }, { status: 400 });
    }
    const existente = await db.usuario.findFirst({ where: { papel: "CLIENTE", whatsapp: whatsappNormalizado } });
    if (existente) {
      clienteId = existente.id;
      if (existente.nome !== dados.data.nomeCliente) {
        await db.usuario.update({ where: { id: existente.id }, data: { nome: dados.data.nomeCliente } });
      }
    } else {
      const novo = await db.usuario.create({
        data: { nome: dados.data.nomeCliente, whatsapp: whatsappNormalizado, papel: "CLIENTE" },
      });
      clienteId = novo.id;
    }
  }

  // servicos, barbeiro e cliente não dependem um do outro — buscar os três
  // em paralelo. `barbeiros` sem filtro (todos os preços customizados de
  // cada serviço, não só o desse barbeiro) deixa derivar, pra cada corte,
  // se esse barbeiro específico tem preço próprio ou usa o preço base, sem
  // precisar de uma query por corte.
  const [servicos, barbeiro, cliente] = await Promise.all([
    db.servico.findMany({ where: { id: { in: servicoIds } }, include: { barbeiros: true } }),
    db.usuario.findUnique({
      where: { id: barbeiroId },
      select: { id: true, nome: true, papel: true, barbeariaId: true, whatsapp: true, callmebotApiKey: true, atendeComoBarbeiro: true },
    }),
    db.usuario.findUnique({ where: { id: clienteId }, select: { nome: true } }),
  ]);

  if (servicos.length !== servicoIds.length || servicos.some((s) => !s.ativo || !s.aprovado)) {
    return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });
  }
  // barbeariaId nunca vem do cliente — é sempre derivado dos serviços, pra
  // não deixar misturar servicoId de uma barbearia com barbeiroId de
  // outra. Todos os cortes escolhidos precisam ser da mesma barbearia
  // (não dá pra combinar corte de uma barbearia com outra).
  const barbeariaId = servicos[0].barbeariaId;
  if (servicos.some((s) => s.barbeariaId !== barbeariaId)) {
    return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });
  }
  // "barbeiro" pode ser um BARBEIRO de verdade, ou o DONO que ativou
  // "também corto cabelo" (ver regra de negócio 10).
  const ehBarbeiroValido = barbeiro?.papel === "BARBEIRO" || (barbeiro?.papel === "DONO" && barbeiro.atendeComoBarbeiro);
  if (!barbeiro || !ehBarbeiroValido || barbeiro.barbeariaId !== barbeariaId) {
    return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
  }

  // Pra cada corte escolhido, esse barbeiro precisa estar entre os
  // vinculados a ele — desde a revisão da regra de negócio 5, todo corte
  // exige vínculo explícito (ServicoBarbeiro), não existe mais "sem
  // vínculo = barbearia toda atende".
  const itens: { servicoId: string; nome: string; preco: Prisma.Decimal; duracaoMinutos: number }[] = [];
  for (const s of servicos) {
    const precoDesseBarbeiro = s.barbeiros.find((b) => b.barbeiroId === barbeiroId);
    if (!precoDesseBarbeiro) {
      return NextResponse.json({ erro: `Esse barbeiro não realiza o corte "${s.nome}"` }, { status: 400 });
    }
    itens.push({ servicoId: s.id, nome: s.nome, preco: precoDesseBarbeiro.preco, duracaoMinutos: s.duracaoMinutos });
  }

  const precoCobrado = itens.reduce((soma, i) => soma + Number(i.preco), 0);
  const duracaoMinutos = itens.reduce((soma, i) => soma + i.duracaoMinutos, 0);
  const inicio = new Date(`${data}T${hora}:00-03:00`);
  const fim = new Date(inicio.getTime() + duracaoMinutos * 60000);

  // Confere se esse horário (já somando a duração de todos os cortes
  // escolhidos) realmente cai dentro de uma janela de Disponibilidade do
  // barbeiro pra esse dia da semana, e que não é no passado — reaproveita
  // a mesma função usada por GET /api/horarios-livres pra garantir que "o
  // que é oferecido" e "o que é aceito" nunca divirjam. Sem essa checagem,
  // só o conflito com outros agendamentos era validado: uma requisição
  // direta (fora do formulário normal) conseguia criar um PENDENTE numa
  // folga do barbeiro, fora do expediente, ou numa data que já passou.
  const { horarios: horariosLivres } = await calcularHorariosLivres({ barbeiroId, data, duracaoMinutos });
  if (!horariosLivres.includes(hora)) {
    return NextResponse.json({ erro: "Esse horário não está disponível" }, { status: 409 });
  }

  // A checagem de horário livre e a criação do agendamento (+ os cortes
  // escolhidos) acontecem dentro da MESMA transação serializável — isso
  // fecha uma corrida que uma checagem-depois-cria em dois passos
  // separados não fecha: dois clientes pedindo, ao mesmo tempo, cortes de
  // duração diferente pro mesmo barbeiro em horários que se sobrepõem têm
  // início "diferente" — a constraint unique(barbeiroId, data) sozinha não
  // pega esse caso, só o mesmo instante exato. Sob isolamento
  // serializável, o Postgres detecta a sobreposição e uma das duas
  // transações falha com erro de serialização (P2034).
  let agendamento;
  try {
    agendamento = await db.$transaction(
      async (tx) => {
        const ocupados = await buscarAgendamentosOcupados(tx, { barbeiroId, data });
        if (conflitaComOcupados(inicio, fim, ocupados)) {
          throw new HorarioIndisponivelError();
        }
        const criado = await tx.agendamento.create({
          data: {
            barbeariaId,
            clienteId,
            barbeiroId,
            data: inicio,
            duracaoMinutos,
            precoCobrado,
            status: "PENDENTE",
          },
        });
        await tx.agendamentoServico.createMany({
          data: itens.map((i) => ({
            agendamentoId: criado.id,
            servicoId: i.servicoId,
            nomeServico: i.nome,
            precoServico: i.preco,
            duracaoMinutos: i.duracaoMinutos,
          })),
        });
        return criado;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (erro) {
    const mesmaMensagem = { erro: "Esse horário acabou de ficar indisponível" };
    if (erro instanceof HorarioIndisponivelError) {
      return NextResponse.json(mesmaMensagem, { status: 409 });
    }
    // P2002: constraint unique(barbeiroId, data) — mesmo instante exato.
    // P2034: conflito de serialização detectado pelo Postgres — instantes
    // diferentes, mas intervalos sobrepostos.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && (erro.code === "P2002" || erro.code === "P2034")) {
      return NextResponse.json(mesmaMensagem, { status: 409 });
    }
    throw erro;
  }

  const nomesCortes = itens.map((i) => i.nome).join(" + ");
  if (barbeiro.whatsapp && barbeiro.callmebotApiKey) {
    const dataFormatada = data.split("-").reverse().join("/");
    await notificarNovoAgendamento({
      whatsapp: barbeiro.whatsapp,
      apikey: barbeiro.callmebotApiKey,
      mensagem: `Novo agendamento: ${cliente?.nome ?? "um cliente"} marcou ${nomesCortes} (R$ ${precoCobrado.toFixed(2)}) para ${dataFormatada} às ${hora}. Entre no painel pra confirmar.`,
    });
  }

  // Link de acompanhamento (regra de negócio 15) — funciona pra qualquer
  // pedido, logado ou não; quem já tem conta usa "Meus agendamentos"
  // normalmente, mas ganhar o link também não atrapalha em nada.
  const tokenAcompanhamento = await criarTokenAgendamentoConvidado({ agendamentoId: agendamento.id });

  return NextResponse.json({
    agendamento: { ...agendamento, servicos: itens.map((i) => ({ nomeServico: i.nome, precoServico: i.preco })) },
    // Usado pela tela do cliente pra oferecer um link direto de WhatsApp
    // com o barbeiro escolhido, além da notificação automática que já foi
    // disparada acima.
    barbeiro: { nome: barbeiro.nome, whatsapp: barbeiro.whatsapp },
    tokenAcompanhamento,
  });
}

// GET: lista agendamentos.
// - BARBEIRO vê só os próprios; com ?equipe=1 e for o barbeiro chefe da
//   barbearia, vê os de todos os barbeiros (mesmo escopo que o DONO já
//   tem) — sem o parâmetro (ou se não for chefe), nada muda, inclusive
//   pro próprio chefe: ele continua vendo só os PRÓPRIOS pedidos
//   pendentes na seção de confirmar/recusar. Com ?barbeiroId=<outro>, o
//   chefe (ou dono) consegue ver só a agenda de UM colega específico —
//   usado pelo painel do chefe quando clica num barbeiro contratado.
// - DONO vê todos da barbearia (ou só de um barbeiro específico, com
//   ?barbeiroId=)
// - CLIENTE vê os próprios (histórico)
// Lista explícita de papéis (nunca exigirSessao() sem argumento) — sem
// isso, um papel novo que essa rota não sabe tratar (ver ADMIN, regra de
// negócio 14) cai fora dos três `if` abaixo, `where` fica `{}`, e
// db.agendamento.findMany devolve TODOS os agendamentos de TODAS as
// barbearias. ADMIN nunca deve usar esta rota — a visão dele é sempre
// GET /api/admin/agendamentos, que exige um acesso concedido explícito.
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(["CLIENTE", "BARBEIRO", "DONO"]);
  if (sessao instanceof NextResponse) return sessao;

  const statusFiltro = req.nextUrl.searchParams.get("status");
  if (statusFiltro && !Object.values(StatusAgendamento).includes(statusFiltro as StatusAgendamento)) {
    return NextResponse.json({ erro: "Status inválido" }, { status: 400 });
  }

  const dataFiltro = req.nextUrl.searchParams.get("data");
  if (dataFiltro && !/^\d{4}-\d{2}-\d{2}$/.test(dataFiltro)) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }

  const equipe = req.nextUrl.searchParams.get("equipe") === "1";
  const barbeiroIdParam = req.nextUrl.searchParams.get("barbeiroId");

  const where: any = {};
  if (sessao.papel === "BARBEIRO") where.barbeiroId = sessao.usuarioId;
  if (sessao.papel === "DONO") where.barbeariaId = sessao.barbeariaId;
  if (sessao.papel === "CLIENTE") where.clienteId = sessao.usuarioId;

  if (barbeiroIdParam && barbeiroIdParam !== sessao.usuarioId) {
    if (!(await sessaoTemPrivilegioDeChefe(sessao))) {
      return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    }
    const alvo = await db.usuario.findUnique({ where: { id: barbeiroIdParam } });
    if (!alvo || alvo.papel !== "BARBEIRO" || alvo.barbeariaId !== sessao.barbeariaId) {
      return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
    }
    where.barbeiroId = barbeiroIdParam;
    delete where.barbeariaId;
  } else if (sessao.papel === "BARBEIRO" && equipe && (await sessaoTemPrivilegioDeChefe(sessao))) {
    delete where.barbeiroId;
    where.barbeariaId = sessao.barbeariaId;
  }
  if (statusFiltro) where.status = statusFiltro;
  if (dataFiltro) {
    // Dia inteiro em America/Sao_Paulo (-03:00), mesmo critério usado em
    // calcularHorariosLivres() e no financeiro.
    const [ano, mes, dia] = dataFiltro.split("-").map(Number);
    where.data = {
      gte: new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0)),
      lt: new Date(Date.UTC(ano, mes - 1, dia + 1, 3, 0, 0)),
    };
  }
  // Ocultar é uma marca do lado do barbeiro (ver PATCH /api/agendamentos/[id])
  // — nunca afeta o que o CLIENTE vê do próprio histórico. ?mostrarOcultos=1
  // desfaz o filtro, é o "jeito de reverter" (a tela usa isso pra listar e
  // desocultar de novo).
  if (sessao.papel !== "CLIENTE" && req.nextUrl.searchParams.get("mostrarOcultos") !== "1") {
    where.ocultoPeloBarbeiro = false;
  }

  // cliente inclui email/whatsapp pra quem já tem acesso a esse
  // agendamento (barbeiro/dono da barbearia dele) poder entrar em contato
  // se precisar — CLIENTE só vê os próprios agendamentos de qualquer
  // forma (where.clienteId acima), então nunca vaza dado de outro cliente.
  const agendamentos = await db.agendamento.findMany({
    where,
    include: {
      cliente: { select: { id: true, nome: true, email: true, whatsapp: true } },
      barbeiro: { select: { id: true, nome: true } },
      servicos: { select: { nomeServico: true, precoServico: true, duracaoMinutos: true } },
    },
    orderBy: { data: "asc" },
  });

  return NextResponse.json({ agendamentos });
}
