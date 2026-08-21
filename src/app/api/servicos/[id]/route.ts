import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";

const schema = z.object({
  nome: z.string().min(2).optional(),
  precoBase: z.number().positive().optional(),
  duracaoMinutos: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
  imagemUrl: z.string().url().optional(),
  // Os dois abaixo só chefe/dono pode usar (checado depois do parse) —
  // aprovar uma solicitação pendente, e redefinir por completo quais
  // barbeiros contratados atendem esse corte (substitui a lista inteira).
  aprovado: z.boolean().optional(),
  barbeiroIds: z.array(z.string()).optional(),
});

async function garantirDono(id: string, barbeariaId: string) {
  const servico = await db.servico.findUnique({ where: { id }, include: { barbeiros: true } });
  return servico && servico.barbeariaId === barbeariaId ? servico : null;
}

// PATCH: chefe/dono (ver sessaoTemPrivilegioDeChefe) edita qualquer corte
// da barbearia, incluindo aprovar solicitações pendentes e redefinir quais
// barbeiros atendem cada corte; um BARBEIRO comum só edita (nome/preço/
// duração/foto) um corte que seja exclusivamente dele — nunca aprova nem
// redefine vínculos, mesmo do próprio corte.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await garantirDono(params.id, sessao.barbeariaId!);
  if (!existente) return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });

  const ehChefeOuDono = await sessaoTemPrivilegioDeChefe(sessao);
  if (!ehChefeOuDono) {
    const ehSoDele = existente.barbeiros.length === 1 && existente.barbeiros[0].barbeiroId === sessao.usuarioId;
    if (!ehSoDele) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });

  if (!ehChefeOuDono && ("aprovado" in dados.data || "barbeiroIds" in dados.data)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  let barbeiroIdsValidos: string[] | null = null;
  if (dados.data.barbeiroIds) {
    const idsUnicos = [...new Set(dados.data.barbeiroIds)];
    if (idsUnicos.length > 0) {
      const elegiveis = await db.usuario.findMany({
        where: {
          id: { in: idsUnicos },
          barbeariaId: sessao.barbeariaId!,
          OR: [{ papel: "BARBEIRO" }, { papel: "DONO", atendeComoBarbeiro: true }],
        },
        select: { id: true },
      });
      if (elegiveis.length !== idsUnicos.length) {
        return NextResponse.json({ erro: "Algum barbeiro selecionado não foi encontrado" }, { status: 400 });
      }
    }
    barbeiroIdsValidos = idsUnicos;
  }

  const { barbeiroIds, ...camposServico } = dados.data;
  const servico = await db.$transaction(async (tx) => {
    const atualizado = Object.keys(camposServico).length > 0
      ? await tx.servico.update({ where: { id: params.id }, data: camposServico })
      : existente;
    if (barbeiroIdsValidos !== null) {
      // Substitui a lista inteira de vínculos por barbeiroIdsValidos — mais
      // simples e previsível do que tentar diffar (adicionar só o que
      // faltou, remover só o que sobrou) pra uma tela que já manda a lista
      // completa marcada/desmarcada.
      await tx.servicoBarbeiro.deleteMany({ where: { servicoId: params.id } });
      if (barbeiroIdsValidos.length > 0) {
        await tx.servicoBarbeiro.createMany({
          data: barbeiroIdsValidos.map((barbeiroId) => ({ servicoId: params.id, barbeiroId, preco: atualizado.precoBase })),
        });
      }
    }
    return atualizado;
  });

  return NextResponse.json({ servico });
}

// DELETE: chefe/dono pode excluir (desativar) qualquer corte da barbearia
// — inclusive rejeitar uma solicitação pendente de um contratado. Um
// BARBEIRO comum só pode excluir um corte que seja exclusivamente dele
// (ver regra de negócio 5: corte criado por barbeiro contratado fica só
// pra ele, marcado por ter exatamente um ServicoBarbeiro apontando pro
// próprio criador).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const existente = await garantirDono(params.id, sessao.barbeariaId!);
  if (!existente) return NextResponse.json({ erro: "Serviço não encontrado" }, { status: 404 });

  const ehChefeOuDono = await sessaoTemPrivilegioDeChefe(sessao);
  if (!ehChefeOuDono) {
    const ehSoDele = existente.barbeiros.length === 1 && existente.barbeiros[0].barbeiroId === sessao.usuarioId;
    if (!ehSoDele) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // Preferimos desativar a excluir de fato, pra não perder o histórico de
  // agendamentos antigos que referenciam esse serviço.
  await db.servico.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
