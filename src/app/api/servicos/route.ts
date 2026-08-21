import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { exigirSessao, sessaoTemPrivilegioDeChefe } from "@/lib/exigirSessao";

const schema = z.object({
  nome: z.string().min(2),
  precoBase: z.number().positive(),
  duracaoMinutos: z.number().int().positive().default(30),
  imagemUrl: z.string().url().optional(),
  // Só chefe/dono pode usar isso (ver POST abaixo) — quais barbeiros
  // contratados já nascem vinculados a esse corte. Vazio/omitido é válido:
  // o corte existe mas ainda não aparece pra nenhum cliente até alguém
  // (o próprio chefe, depois) vincular um barbeiro a ele.
  barbeiroIds: z.array(z.string()).optional(),
});

// GET: lista os serviços da barbearia do usuário logado (dono ou barbeiro)
export async function GET() {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const servicos = await db.servico.findMany({
    where: { barbeariaId: sessao.barbeariaId! },
    include: {
      barbeiros: {
        select: { barbeiroId: true, preco: true, barbeiro: { select: { id: true, nome: true } } },
      },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json({ servicos });
}

// POST: cria um novo corte/serviço.
// - Chefe/dono (ver sessaoTemPrivilegioDeChefe) cria já aprovado, e pode
//   vincular explicitamente quais barbeiros contratados oferecem esse
//   corte (barbeiroIds) — desde a revisão da regra de negócio 5, não
//   existe mais "sem vínculo = barbearia toda atende"; um corte sem
//   nenhum barbeiro vinculado simplesmente não aparece pra ninguém ainda.
// - Um BARBEIRO contratado comum também pode cadastrar, mas vira uma
//   SOLICITAÇÃO pendente (aprovado:false) vinculada só a ele mesmo — só
//   fica disponível pro cliente depois que o chefe aprovar (PATCH
//   /api/servicos/[id] com {aprovado:true}).
export async function POST(req: NextRequest) {
  const sessao = await exigirSessao(["DONO", "BARBEIRO"]);
  if (sessao instanceof NextResponse) return sessao;

  const dados = schema.safeParse(await req.json().catch(() => null));
  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 });
  }

  const ehChefeOuDono = await sessaoTemPrivilegioDeChefe(sessao);
  const barbeariaId = sessao.barbeariaId!;

  let barbeiroIdsValidos: string[] = [];
  if (ehChefeOuDono && dados.data.barbeiroIds && dados.data.barbeiroIds.length > 0) {
    const idsUnicos = [...new Set(dados.data.barbeiroIds)];
    const elegiveis = await db.usuario.findMany({
      where: {
        id: { in: idsUnicos },
        barbeariaId,
        OR: [{ papel: "BARBEIRO" }, { papel: "DONO", atendeComoBarbeiro: true }],
      },
      select: { id: true },
    });
    if (elegiveis.length !== idsUnicos.length) {
      return NextResponse.json({ erro: "Algum barbeiro selecionado não foi encontrado" }, { status: 400 });
    }
    barbeiroIdsValidos = idsUnicos;
  }

  const { nome, precoBase, duracaoMinutos, imagemUrl } = dados.data;
  const servico = await db.servico.create({
    data: { nome, precoBase, duracaoMinutos, imagemUrl, barbeariaId, aprovado: ehChefeOuDono },
  });

  if (ehChefeOuDono) {
    if (barbeiroIdsValidos.length > 0) {
      await db.servicoBarbeiro.createMany({
        data: barbeiroIdsValidos.map((barbeiroId) => ({ servicoId: servico.id, barbeiroId, preco: dados.data.precoBase })),
      });
    }
  } else {
    // Barbeiro comum: fica só com ele mesmo, mesmo padrão de sempre
    // (exclusivo), só que agora começa pendente de aprovação.
    await db.servicoBarbeiro.create({
      data: { servicoId: servico.id, barbeiroId: sessao.usuarioId, preco: dados.data.precoBase },
    });
  }

  return NextResponse.json({ servico });
}
