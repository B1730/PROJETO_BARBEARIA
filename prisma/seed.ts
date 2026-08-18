import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash("123456", 10);

  const barbearia = await db.barbearia.create({
    data: { nome: "Barbearia do Zé", slug: "barbearia-do-ze" },
  });

  const dono = await db.usuario.create({
    data: { nome: "Zé", email: "dono@exemplo.com", senhaHash, papel: "DONO", barbeariaId: barbearia.id },
  });

  const barbeiro = await db.usuario.create({
    data: { nome: "Carlos", email: "carlos@exemplo.com", senhaHash, papel: "BARBEIRO", barbeariaId: barbearia.id },
  });

  const cliente = await db.usuario.create({
    data: { nome: "João Cliente", email: "cliente@exemplo.com", senhaHash, papel: "CLIENTE" },
  });

  const corte = await db.servico.create({
    data: { nome: "Corte degradê", precoBase: 40, duracaoMinutos: 30, barbeariaId: barbearia.id },
  });

  await db.servicoBarbeiro.create({
    data: { servicoId: corte.id, barbeiroId: barbeiro.id, preco: 40 },
  });

  // Segunda a sexta, 9h às 18h
  for (const dia of [1, 2, 3, 4, 5]) {
    await db.disponibilidade.create({
      data: { barbeiroId: barbeiro.id, diaDaSemana: dia, horaInicio: "09:00", horaFim: "18:00" },
    });
  }

  console.log("Seed concluído:");
  console.log("Dono:     dono@exemplo.com / 123456");
  console.log("Barbeiro: carlos@exemplo.com / 123456");
  console.log("Cliente:  cliente@exemplo.com / 123456");
  console.log(`Link da barbearia: /${barbearia.slug}`);
}

main().finally(() => db.$disconnect());
