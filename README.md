# Sistema de agendamento para barbearias (multi-barbearia)

Projeto base (esqueleto funcional) para um sistema onde:

- **Clientes** escolhem corte + barbeiro e pedem um horário
- **Barbeiros** definem sua própria agenda e aceitam/recusam pedidos
- **Donos** cadastram barbeiros, cortes e preços, e veem o faturamento
  (por dia, mês e ano — geral e por barbeiro)
- O sistema suporta **várias barbearias** no mesmo sistema (SaaS), cada
  uma isolada por `barbeariaId` no banco de dados (veja explicação abaixo)

## Stack usada (e por quê)

| Camada       | Tecnologia            | Motivo |
|--------------|------------------------|--------|
| Frontend + Backend | Next.js 14 (App Router) | Um projeto só faz as duas pontas — menos coisa pra hospedar e configurar |
| Banco de dados | PostgreSQL via Prisma ORM | Relacional, lida bem com "barbearia tem muitos barbeiros" etc. Prisma gera as queries e as migrações |
| Autenticação | JWT em cookie httpOnly (lib `jose`) | Simples, sem depender de serviço externo pago |
| Estilo | Tailwind CSS | Rápido de estilizar sem escrever CSS solto |

## Por que um banco só (não um banco por barbearia)

Cada barbearia tem seus próprios barbeiros, cortes e agendamentos, mas
tecnicamente eles moram no **mesmo banco de dados**, separados por uma
coluna `barbeariaId` em cada tabela (veja `prisma/schema.prisma`). Isso é
chamado de **multi-tenancy por linha** e é o padrão usado por praticamente
todo SaaS pequeno/médio — é gratuito de manter em qualquer plano free de
banco de dados, e o código já garante que uma barbearia nunca vê dado de
outra (toda consulta do dono/barbeiro filtra por `barbeariaId`).

## Como rodar localmente

### 1. Pré-requisitos
- Node.js 20+ instalado ([nodejs.org](https://nodejs.org))
- Uma conta gratuita no [Supabase](https://supabase.com) (banco de dados)

### 2. Criar o banco de dados gratuito (Supabase)
1. Crie um projeto novo no Supabase (é grátis, sem cartão)
2. Vá em **Project Settings > Database > Connection string > URI**
3. Copie essa string de conexão

### 3. Configurar o projeto
```bash
cd barbershop-saas
npm install
cp .env.example .env
```
Abra o `.env` e cole a `DATABASE_URL` do Supabase. Gere um `JWT_SECRET`
aleatório com:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Criar as tabelas no banco
```bash
npx prisma migrate dev --name inicial
```

### 5. (Opcional) Popular com dados de teste
```bash
npm run prisma:seed
```
Isso cria uma barbearia de exemplo com login pronto (veja o que aparece
no terminal ao rodar).

### 6. Rodar o projeto
```bash
npm run dev
```
Acesse `http://localhost:3000`.

## Como colocar no ar de graça

1. **Suba o código para o GitHub** (crie um repositório e faça push desta pasta)
2. **Banco de dados**: já está pronto, é o Supabase que você configurou acima
3. **Frontend + backend**: crie uma conta grátis na [Vercel](https://vercel.com),
   clique em "New Project", conecte seu repositório do GitHub
4. Nas configurações do projeto na Vercel, adicione as variáveis de ambiente
   `DATABASE_URL` e `JWT_SECRET` (as mesmas do seu `.env`)
5. Clique em **Deploy**

Pronto — o site fica em uma URL tipo `seu-projeto.vercel.app`, gratuita.
Cada barbearia que se cadastrar usa uma URL própria dentro do mesmo site
(ex: `seu-projeto.vercel.app/barbearia-do-ze`).

> Planos gratuitos têm limites (ex: Supabase free = 500MB de banco,
> pausa o projeto após período de inatividade). Para uso comercial sério
> e contínuo, o próximo passo natural é migrar para os planos pagos
> desses mesmos serviços — mas pra começar, testar e validar a ideia,
> o gratuito é suficiente.

## Estrutura do projeto

```
prisma/schema.prisma       → todas as tabelas do banco de dados
src/lib/
  db.ts                    → conexão com o banco
  auth.ts                  → login, senha, sessão (JWT em cookie)
  horarios.ts              → cálculo dos horários livres de um barbeiro
  exigirSessao.ts           → protege rotas de API por papel de usuário
src/app/
  page.tsx                 → página inicial
  entrar/                  → login
  cadastro/                → cadastro (dono ou cliente)
  [slug]/                  → página pública de cada barbearia (fluxo do cliente)
  barbeiro/                → painel do barbeiro (aceitar pedidos, disponibilidade)
  admin/                   → painel do dono (barbeiros, cortes, faturamento)
  api/                     → todas as rotas de backend
```

## O que já funciona

- Cadastro de barbearia (dono), barbeiro e cliente
- Login/logout com sessão
- Dono cadastra barbeiros e cortes com preço
- Barbeiro cadastra a própria disponibilidade semanal
- Cliente vê cortes → escolhe barbeiro → vê só horários realmente livres
- Pedido de agendamento fica **pendente** até o barbeiro aceitar ou recusar
- Relatório de faturamento por dia/mês/ano, geral e por barbeiro

## Próximos passos sugeridos (para você evoluir)

- Marcar agendamento como "CONCLUIDO" depois que o corte acontece (hoje
  só conta no financeiro o que está como concluído — dá pra automatizar
  isso quando o horário do agendamento passar)
- Troca de senha / recuperação de senha por e-mail
- Notificação por e-mail ou WhatsApp quando o barbeiro confirma/recusa
- Página do barbeiro para editar/desativar seu próprio cadastro
- Upload de foto de perfil dos barbeiros e fotos dos cortes
- Bloqueio de horário por exceção (ex: barbeiro de folga num dia específico)
