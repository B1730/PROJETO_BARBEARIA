# CLAUDE.md

Este arquivo dá contexto pro Claude (via Claude Code) sobre este projeto.
Leia isto antes de mexer em qualquer parte do código.

## O que é este projeto

Sistema de agendamento online para barbearias, no formato SaaS: várias
barbearias diferentes usam o mesmo sistema, cada uma com seus próprios
barbeiros, cortes, preços e clientes.

Três tipos de usuário:
- **Cliente**: escolhe corte → escolhe barbeiro → escolhe horário livre → pede agendamento
- **Barbeiro**: define sua própria disponibilidade semanal; aceita ou recusa cada pedido de agendamento (só ele decide, ninguém mais confirma por ele)
- **Dono**: cadastra barbeiros, cadastra cortes e preços, vê o faturamento (dia/mês/ano, geral e por barbeiro)

O projeto já foi instalado, migrado e testado (ver "Histórico de mudanças
implementadas" no fim deste arquivo). Ele foi escrito originalmente à mão,
arquivo por arquivo, sem acesso à internet — os erros de digitação/tipagem
esperados desse processo já foram encontrados e corrigidos numa varredura
completa do projeto.

**Importante sobre onde rodar**: a pasta original deste projeto vive em
`OneDrive\Área de Trabalho\...`, e isso deixa `npm install`/`next dev`/
`next build` extremamente lentos (o OneDrive e o Windows Defender competem
por I/O com o compilador — um `next dev` chegou a levar mais de 20 minutos
aqui). Por isso existe uma cópia de trabalho em `C:\dev\barbershop-saas`,
fora da sincronização, que é onde o servidor roda de verdade durante o
desenvolvimento. As duas pastas são mantidas com o mesmo código-fonte — ao
editar um arquivo, replicar a mudança na outra pasta (ou copiar de uma pra
outra) antes de testar. Se for continuar o desenvolvimento a partir daqui,
prefira abrir/editar diretamente em `C:\dev\barbershop-saas`.

## Stack

- **Next.js 14** (App Router) — frontend e backend no mesmo projeto
- **PostgreSQL** via **Prisma ORM** — banco de dados
- **Tailwind CSS** — estilo
- **jose** — JWT em cookie httpOnly para sessão de login (sem serviço externo)
- **bcryptjs** — hash de senha
- **zod** — validação dos dados recebidos nas rotas de API

Hospedagem gratuita planejada: **Vercel** (frontend + backend) +
**Supabase** (Postgres gratuito). Ver README.md para o passo a passo
completo de deploy.

## Decisão arquitetural mais importante: multi-tenancy por linha

Cada barbearia tem seus próprios barbeiros, cortes e agendamentos, mas
**tudo mora no mesmo banco de dados**. O isolamento entre barbearias é
feito por uma coluna `barbeariaId` presente nas tabelas principais
(`Usuario`, `Servico`, `Agendamento`).

**Regra que precisa ser respeitada em qualquer código novo**: toda
consulta feita a partir de uma sessão de `DONO` ou `BARBEIRO` tem que
filtrar por `barbeariaId` (ou por `barbeiroId` no caso do barbeiro).
Nunca faça uma query que devolva dados de todas as barbearias para um
usuário comum — isso vazaria dados entre clientes do SaaS. O helper
`src/lib/exigirSessao.ts` retorna a sessão com `barbeariaId` já
disponível para isso.

Não crie bancos de dados separados por barbearia. Essa decisão já foi
tomada e explicada ao usuário (mais barato, mais simples de manter,
funciona igual na prática).

## Idioma e convenções

- **Todo o código é em português**: nomes de tabelas, campos, variáveis,
  funções, rotas de API, comentários. Mantenha esse padrão em qualquer
  código novo — não misture com inglês.
- Textos de interface (botões, mensagens, labels) também em português,
  tom direto e simples.
- Nomes de arquivos de rota seguem o padrão do Next.js App Router
  (`route.ts` dentro de pastas que viram a URL).

## Estrutura de pastas

```
prisma/
  schema.prisma      → TODAS as tabelas do banco (fonte da verdade do modelo de dados)
  seed.ts            → popula o banco com uma barbearia de teste (rodar com `npm run prisma:seed`)

src/lib/
  db.ts              → cliente Prisma (singleton)
  auth.ts            → criarHashSenha, conferirSenha, criarSessao, pegarSessao, encerrarSessao
  exigirSessao.ts    → helper usado no topo de toda rota de API protegida:
                        `const sessao = await exigirSessao(["DONO"])`
                        retorna a sessão OU um NextResponse de erro (401/403) — sempre checar
                        `if (sessao instanceof NextResponse) return sessao;` antes de usar
  horarios.ts        → calcularHorariosLivres(): pega a Disponibilidade do barbeiro no dia da
                        semana, subtrai os Agendamentos já PENDENTE/CONFIRMADO, devolve os
                        horários livres. Essa é a lógica mais delicada do sistema — qualquer
                        mudança aqui afeta diretamente se um cliente consegue marcar horário
                        duplicado ou não.
  whatsapp.ts        → notificarNovoAgendamento(): dispara mensagem via CallMeBot pro
                        barbeiro quando um cliente cria um agendamento; falha em silêncio

src/components/
  Cabecalho.tsx      → cabeçalho compartilhado dos painéis logados (barbeiro/dono):
                        consulta GET /api/auth/sessao ao montar, mostra nome do
                        usuário + nome da barbearia, e o botão de sair

src/app/
  page.tsx           → landing page
  entrar/page.tsx    → login (qualquer papel)
  cadastro/page.tsx  → cadastro — usa ?papel=DONO (padrão, cria barbearia) ou ?papel=CLIENTE
  [slug]/page.tsx    → página pública da barbearia (fluxo do cliente: corte → barbeiro → horário)
  barbeiro/page.tsx  → painel do barbeiro (agenda de hoje, pedidos pendentes, disponibilidade,
                        cortes próprios) — atualiza sozinho a cada 8s (polling)
  barbeiro/perfil/page.tsx → barbeiro cadastra o próprio WhatsApp/apikey do CallMeBot
  admin/page.tsx     → painel do dono (barbeiros, cortes/preços, faturamento)

  api/
    auth/cadastro, auth/login, auth/logout, auth/sessao (GET, devolve usuário + barbearia logados)
    barbearias/[slug]         → GET público (dados da barbearia pro fluxo do cliente)
    servicos, servicos/[id]   → dono gerencia cortes/preços
    barbeiros                 → dono lista/cadastra barbeiros
    disponibilidade, disponibilidade/[id]  → barbeiro gerencia a própria agenda
    horarios-livres           → GET público, usa calcularHorariosLivres()
    agendamentos, agendamentos/[id]  → cliente pede; barbeiro confirma/recusa (PATCH)
    financeiro                 → relatório por período, filtrado por papel (dono vê tudo da
                                  barbearia agrupado por barbeiro; barbeiro vê só o próprio)
    perfil                     → GET/PATCH, barbeiro edita o próprio whatsapp/callmebotApiKey
```

## Modelo de dados (resumo — ver prisma/schema.prisma para o completo)

- `Barbearia`: o tenant. Tem `slug` único usado na URL pública.
- `Usuario`: um único model para os 3 papéis (`papel`: CLIENTE / BARBEIRO / DONO).
  Clientes têm `barbeariaId` nulo (podem agendar em qualquer barbearia).
  Barbeiros e donos têm `barbeariaId` preenchido.
- `Servico`: corte oferecido por uma barbearia (`precoBase`, `duracaoMinutos`).
- `ServicoBarbeiro`: tabela de ligação — permite cada barbeiro ter um preço
  próprio para o mesmo corte, se quiser (opcional, senão usa `precoBase`).
- `Disponibilidade`: janela semanal que o barbeiro cadastra (dia da semana + hora início/fim).
- `Agendamento`: liga cliente + barbeiro + serviço + data/hora. `status` vai de
  PENDENTE → CONFIRMADO/RECUSADO (decisão do barbeiro) → CONCLUIDO (depois do
  atendimento acontecer — hoje isso não é automático, ver "Pendências" abaixo).
  `precoCobrado` congela o preço no momento do agendamento (não muda se o
  dono alterar o preço do serviço depois).

## Regras de negócio que não podem ser quebradas

1. **Só o barbeiro confirma ou recusa o próprio agendamento** — rota
   `PATCH /api/agendamentos/[id]` já valida isso (`agendamento.barbeiroId !== sessao.usuarioId` → 404).
   Não adicionar um jeito do dono confirmar por ele sem que isso seja pedido explicitamente.
2. Um agendamento **PENDENTE já ocupa o horário** — ele não pode ser
   oferecido a outro cliente enquanto o barbeiro não decide. Isso está em
   `calcularHorariosLivres()`, que considera `status: { in: ["PENDENTE", "CONFIRMADO"] }`.
3. Ao criar um agendamento, a rota **revalida** que o horário ainda está
   livre antes de gravar (evita dois clientes pegando o mesmo horário ao
   mesmo tempo). Não remover essa revalidação achando redundante.
4. O relatório financeiro só soma agendamentos com `status: "CONCLUIDO"`.
   Isso é proposital — PENDENTE/CONFIRMADO ainda pode ser cancelado ou não
   acontecer, então não deve contar como faturamento ainda.
5. `POST /api/servicos` aceita tanto `DONO` quanto `BARBEIRO`, mas o
   alcance é diferente: quando o **dono** cria um corte, ele fica
   disponível pra barbearia toda (qualquer barbeiro pode ser escolhido pra
   ele). Quando o **barbeiro** cria, o corte fica só dele — a rota cria
   automaticamente um `ServicoBarbeiro` vinculando o serviço ao barbeiro
   que criou, e é essa linha que faz o fluxo do cliente (`[slug]/page.tsx`)
   e a validação de `POST /api/agendamentos` considerarem que só aquele
   barbeiro oferece esse corte. Não remover essa criação de
   `ServicoBarbeiro` achando redundante — é o mecanismo inteiro da regra.

## Pendências conhecidas / próximos passos (o usuário já sabe disso)

- Não existe hoje um jeito automático de marcar um `Agendamento` como
  `CONCLUIDO` depois que o horário passa — hoje isso teria que ser feito
  manualmente ou implementado como próximo passo (ex: um cron job, ou o
  próprio barbeiro marcando como concluído no painel).
- Não existe troca de senha nem recuperação de senha por e-mail.
- Não existe notificação (e-mail/WhatsApp) quando o barbeiro confirma ou recusa.
- Não existe bloqueio de horário por exceção (ex: barbeiro de folga num
  dia específico dentro da janela normal de disponibilidade).
- Upload de foto de perfil/cortes não foi implementado.

Se o usuário pedir para avançar em algum desses pontos, pode implementar
diretamente — são extensões esperadas do sistema, não mudanças de escopo.

## Próxima leva de mudanças pedidas (ainda não implementadas)

Nenhum item pendente no momento — a última leva pedida (sessão/cabeçalho,
bug de horários, WhatsApp, agenda do dia, polling, frontend mais dinâmico)
foi implementada por completo. Ver "Histórico de mudanças implementadas"
abaixo para o que foi feito e quais decisões foram tomadas.

## Histórico de mudanças implementadas

- **Varredura geral de bugs** (antes da leva de itens abaixo): projeto
  rodado pela primeira vez, `.env` criado, migração inicial e seed
  aplicados. Uma auditoria completa encontrou e corrigiu ~15 problemas,
  entre eles: vazamento de `senhaHash` em 4 rotas (trocado `include` por
  `select` explícito), agendamento cross-tenant não bloqueado (agora
  `barbeariaId` é sempre derivado do serviço, nunca aceito do cliente),
  double-booking sem trava de banco (`@@unique([barbeiroId, data])`
  adicionado no `Agendamento`), `PATCH /api/agendamentos/[id]` sem máquina
  de estados (agora valida a transição), fuso horário incorreto em
  `calcularHorariosLivres()` e no financeiro (fixado em `America/Sao_Paulo`,
  -03:00), landing page que era uma cópia da tela de login, e `useSearchParams()`
  sem `Suspense` em `cadastro/page.tsx` (quebrava só no `next build`, não
  no `next dev`).
- **Item 1 — Sessão e cabeçalho**: criada `GET /api/auth/sessao` e o
  componente `src/components/Cabecalho.tsx`, usado em `barbeiro/page.tsx`
  e `admin/page.tsx`. Mostra nome do usuário + nome da barbearia e oferece
  logout. O cookie de sessão já funcionava (30 dias); o problema era só a
  interface nunca checar a sessão existente ao carregar a página.
- **Item 2 — Bug "horários sempre indisponíveis"**: já resolvido como
  parte da varredura geral de fuso horário citada acima —
  `calcularHorariosLivres()` agora calcula o dia da semana e os horários
  de forma explícita em `America/Sao_Paulo`, independente do fuso do
  servidor. Confirmado com teste manual (barbeiro/data/serviço da seed).
- **Item 3 — WhatsApp do barbeiro + notificação**: provedor escolhido foi
  **CallMeBot** (gratuito, sem verificação de negócio) — usuário aprovou
  cientes das limitações (API não-oficial, pode parar de funcionar sem
  aviso; cada barbeiro precisa ativar o próprio número mandando "I allow
  callmebot to send me messages" pro contato do CallMeBot e guardar a
  apikey pessoal que ele responde). Campos `whatsapp` e `callmebotApiKey`
  adicionados no `Usuario` (migração `usuario_whatsapp`). Tela
  `src/app/barbeiro/perfil/page.tsx` (link "Meu perfil" no `Cabecalho`,
  só aparece pra `BARBEIRO`) com o passo a passo de ativação e um form pra
  salvar via `GET/PATCH /api/perfil`. Envio feito em
  `src/lib/whatsapp.ts` (`notificarNovoAgendamento`), chamado a partir de
  `POST /api/agendamentos` depois que o agendamento é criado — só dispara
  se o barbeiro tiver os dois campos preenchidos, e falha em silêncio
  (nunca derruba a criação do agendamento).
- **Item 4 — Agenda do dia + barbeiro cadastra corte**: `barbeiro/page.tsx`
  ganhou a seção "Agendamentos de hoje" (usa o novo filtro `?data=YYYY-MM-DD`
  em `GET /api/agendamentos`, mesmo critério de fuso de
  `calcularHorariosLivres()`) mostrando todos os status do dia, não só
  `PENDENTE`. Decisão registrada: corte criado pelo barbeiro fica **só
  pra ele** (ver "Regras de negócio" item 5) — a seção "Meus cortes" filtra
  os serviços pra mostrar só os de alcance geral (sem `ServicoBarbeiro`)
  mais os exclusivos dele.
- **Item 5 — Atualização automática**: `barbeiro/page.tsx` faz polling a
  cada 8s (`setInterval` num `useEffect`, com cleanup) recarregando os
  dados sem mostrar o spinner de carregamento inteiro — só a primeira
  carga da página usa o spinner cheio.
- **Item 6 — Frontend mais dinâmico**: estados de "salvando.../
  adicionando..." com botão desabilitado durante a requisição, e mensagens
  de sucesso (verde) além das de erro (vermelho), aplicados em
  `admin/page.tsx`, `barbeiro/page.tsx` e `barbeiro/perfil/page.tsx`. Em
  `[slug]/page.tsx`: estado de carregamento nos horários livres (evita
  mostrar "nenhum horário livre" por um instante antes da resposta
  chegar), botão de agendar desabilitado durante o envio, e mensagem clara
  quando a barbearia do slug não existe (antes ficava preso em
  "Carregando..." pra sempre).

## Ambiente / variáveis necessárias

Arquivo `.env` (baseado em `.env.example`):
- `DATABASE_URL` — string de conexão do Postgres (Supabase)
- `JWT_SECRET` — string aleatória para assinar os cookies de sessão

Sem essas duas variáveis o projeto não sobe. Rodar `npx prisma migrate dev`
antes da primeira execução para criar as tabelas no banco.
