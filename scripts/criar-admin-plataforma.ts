// Cria manualmente uma conta ADMIN (equipe da própria plataforma) — esse
// papel nunca nasce por nenhuma rota pública de cadastro/login com Google
// (ver regra de negócio 7 e 14 no CLAUDE.md), de propósito: só deve existir
// um punhado dessas contas, então criar é sempre uma ação manual e
// deliberada de quem já tem acesso direto ao banco de produção.
//
// Uso: npx tsx scripts/criar-admin-plataforma.ts "Nome Completo" email@exemplo.com "senha"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const [nome, emailBruto, senha] = process.argv.slice(2);
  if (!nome || !emailBruto || !senha) {
    console.error('Uso: npx tsx scripts/criar-admin-plataforma.ts "Nome Completo" email@exemplo.com "senha"');
    process.exit(1);
  }
  if (senha.length < 6) {
    console.error("A senha precisa ter pelo menos 6 caracteres.");
    process.exit(1);
  }
  const email = emailBruto.trim().toLowerCase();

  const jaExiste = await db.usuario.findUnique({ where: { email } });
  if (jaExiste) {
    console.error(`Já existe uma conta com esse e-mail (papel: ${jaExiste.papel}).`);
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(senha, 10);
  const admin = await db.usuario.create({
    data: { nome, email, senhaHash, papel: "ADMIN" },
  });

  console.log(`Conta ADMIN criada: ${admin.nome} <${admin.email}> (id ${admin.id}).`);
  console.log("Ela já pode entrar pela tela normal de login (/entrar) com essa senha.");
  console.log("Nenhuma barbearia é visível até um DONO conceder acesso em /admin.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
