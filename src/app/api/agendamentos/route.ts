import { NextRequest, NextResponse } from "next/server";
import { Prisma, StatusAgendamento } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao } from "@/lib/exigirSessao";
import { calcularHorariosLivres } from "@/lib/horarios";
import { notificarNovoAgendamento } from "@/lib/whatsapp";

const schema = z.object({
  barbeiroId: z.string(),
  servicoId: z.string(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "2026-08-20"
  hora: z.string().regex(/^\d{2}:\d{2}$/), // "14:30"
});

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

  // Revalida que o horário ainda está livre (evita corrida entre dois clientes)
  const livres = await calcularHorariosLivres({ barbeiroId, data, duracaoMinutos: servico.duracaoMinutos });
  if (!livres.includes(hora)) {
    return NextResponse.json({ erro: "Esse horário acabou de ficar indisponível" }, { status: 409 });
  }

  const precoCobrado = servico.barbeiros[0]?.preco ?? servico.precoBase;

  try {
    const agendamento = await db.agendamento.create({
      data: {
        barbeariaId: servico.barbeariaId,
        clienteId: sessao.usuarioId,
        barbeiroId,
        servicoId,
        data: new Date(`${data}T${hora}:00-03:00`),
        precoCobrado,
        status: "PENDENTE",
      },
    });

    if (barbeiro.whatsapp && barbeiro.callmebotApiKey) {
      const cliente = await db.usuario.findUnique({ where: { id: sessao.usuarioId }, select: { nome: true } });
      const dataFormatada = data.split("-").reverse().join("/");
      await notificarNovoAgendamento({
        whatsapp: barbeiro.whatsapp,
        apikey: barbeiro.callmebotApiKey,
        mensagem: `Novo agendamento: ${cliente?.nome ?? "um cliente"} marcou ${servico.nome} para ${dataFormatada} às ${hora}. Entre no painel pra confirmar.`,
      });
    }

    return NextResponse.json({ agendamento });
  } catch (erro) {
    // Constraint unique(barbeiroId, data) pega a corrida que a revalidação acima não fecha sozinha.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return NextResponse.json({ erro: "Esse horário acabou de ficar indisponível" }, { status: 409 });
    }
    throw erro;
  }
}

// GET: lista agendamentos.
// - BARBEIRO vê só os próprios
// - DONO vê todos da barbearia
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

  const where: any = {};
  if (sessao.papel === "BARBEIRO") where.barbeiroId = sessao.usuarioId;
  if (sessao.papel === "DONO") where.barbeariaId = sessao.barbeariaId;
  if (sessao.papel === "CLIENTE") where.clienteId = sessao.usuarioId;
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
