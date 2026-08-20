import { NextRequest, NextResponse } from "next/server";
import { Prisma, StatusAgendamento } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";
import { buscarAgendamentosOcupados, conflitaComOcupados } from "@/lib/horarios";
import { notificarNovoAgendamento } from "@/lib/whatsapp";

const schema = z.object({
  barbeiroId: z.string(),
  servicoId: z.string(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "2026-08-20"
  hora: z.string().regex(/^\d{2}:\d{2}$/), // "14:30"
});

// Usado só pra sinalizar, de dentro da transação abaixo, que o horário foi
// tomado por outra requisição — nunca chega a sair da função POST.
class HorarioIndisponivelError extends Error {}

// POST: cliente solicita um agendamento. Fica como PENDENTE até o
// barbeiro aceitar ou recusar — ninguém mais consegue pegar o mesmo
// horário enquanto ele está pendente (ver calcularHorariosLivres).
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["CLIENTE"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json());
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  const { barbeiroId, servicoId, data, hora } = dados.data;

  // barbeariaId nunca vem do cliente — é sempre derivado do serviço, pra
  // não deixar misturar servicoId de uma barbearia com barbeiroId de outra.
  const servico = await db.servico.findUnique({
    where: { id: servicoId },
    include: { barbeiros: { where: { barbeiroId } } },
  });
  if (!servico || !servico.ativo) {
    return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });
  }

  const barbeiro = await db.usuario.findUnique({ where: { id: barbeiroId } });
  if (!barbeiro || barbeiro.papel !== "BARBEIRO" || barbeiro.barbeariaId !== servico.barbeariaId) {
    return NextResponse.json({ erro: "Barbeiro não encontrado" }, { status: 404 });
  }

  // Se o serviço tem preços customizados por barbeiro, esse barbeiro precisa
  // estar entre eles — senão ele nem oferece esse corte.
  const algumPrecoCustomizado = await db.servicoBarbeiro.findFirst({ where: { servicoId } });
  if (algumPrecoCustomizado && servico.barbeiros.length === 0) {
    return NextResponse.json({ erro: "Esse barbeiro não realiza esse serviço" }, { status: 400 });
  }

  const precoCobrado = servico.barbeiros[0]?.preco ?? servico.precoBase;
  const inicio = new Date(`${data}T${hora}:00-03:00`);
  const fim = new Date(inicio.getTime() + servico.duracaoMinutos * 60000);

  // A checagem de horário livre e a criação do agendamento acontecem dentro
  // da MESMA transação serializável — isso fecha uma corrida que uma
  // checagem-depois-cria em dois passos separados não fecha: dois clientes
  // pedindo, ao mesmo tempo, dois serviços de duração diferente pro mesmo
  // barbeiro em horários que se sobrepõem (ex.: serviço de 90min às 10:00 e
  // serviço de 30min às 10:30) têm início "diferente" — a constraint
  // unique(barbeiroId, data) sozinha não pega esse caso, só o mesmo instante
  // exato. Sob isolamento serializável, o Postgres detecta a sobreposição e
  // uma das duas transações falha com erro de serialização (P2034).
  let agendamento;
  try {
    agendamento = await db.$transaction(
      async (tx) => {
        const ocupados = await buscarAgendamentosOcupados(tx, { barbeiroId, data });
        if (conflitaComOcupados(inicio, fim, ocupados)) {
          throw new HorarioIndisponivelError();
        }
        return tx.agendamento.create({
          data: {
            barbeariaId: servico.barbeariaId,
            clienteId: sessao.usuarioId,
            barbeiroId,
            servicoId,
            data: inicio,
            duracaoMinutos: servico.duracaoMinutos,
            precoCobrado,
            status: "PENDENTE",
          },
        });
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

  if (barbeiro.whatsapp && barbeiro.callmebotApiKey) {
    const cliente = await db.usuario.findUnique({ where: { id: sessao.usuarioId }, select: { nome: true } });
    const dataFormatada = data.split("-").reverse().join("/");
    await notificarNovoAgendamento({
      whatsapp: barbeiro.whatsapp,
      apikey: barbeiro.callmebotApiKey,
      mensagem: `Novo agendamento: ${cliente?.nome ?? "um cliente"} marcou ${servico.nome} para ${dataFormatada} às ${hora}. Entre no painel pra confirmar.`,
    });
  }

  return NextResponse.json({
    agendamento,
    // Usado pela tela do cliente pra oferecer um link direto de WhatsApp
    // com o barbeiro escolhido, além da notificação automática que já foi
    // disparada acima.
    barbeiro: { nome: barbeiro.nome, whatsapp: barbeiro.whatsapp },
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
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao();
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

  const agendamentos = await db.agendamento.findMany({
    where,
    include: {
      cliente: { select: { id: true, nome: true } },
      barbeiro: { select: { id: true, nome: true } },
      servico: true,
    },
    orderBy: { data: "asc" },
  });

  return NextResponse.json({ agendamentos });
}
