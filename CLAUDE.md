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
  whatsapp.ts        → notificarNovoAgendamento()/notificarSolicitacaoCancelamento()/
                        notificarCancelamentoConfirmado(): disparam mensagem via CallMeBot
                        pro barbeiro (criação, pedido de cancelamento do cliente e
                        confirmação final); todas falham em silêncio

src/components/
  Cabecalho.tsx      → cabeçalho compartilhado dos painéis logados (barbeiro/dono):
                        consulta GET /api/auth/sessao ao montar, mostra nome do
                        usuário + nome da barbearia, e o botão de sair

src/app/
  page.tsx           → landing page
  entrar/page.tsx    → login (qualquer papel)
  cadastro/page.tsx  → cadastro — usa ?papel=DONO (padrão, cria barbearia) ou ?papel=CLIENTE
  [slug]/page.tsx    → página pública da barbearia (fluxo do cliente: corte → barbeiro → horário)
  barbeiro/page.tsx  → painel do barbeiro (agenda de hoje, pedidos pendentes, pedidos de
                        cancelamento, disponibilidade, cortes próprios) — atualiza sozinho
                        a cada 8s (polling)
  barbeiro/perfil/page.tsx → barbeiro cadastra o próprio WhatsApp/apikey do CallMeBot
  admin/page.tsx     → painel do dono (barbeiros, cortes/preços, faturamento)
  meus-agendamentos/page.tsx → cliente vê o próprio histórico de agendamentos (todas as
                        barbearias) e pede cancelamento de um PENDENTE/CONFIRMADO

  api/
    auth/cadastro, auth/login, auth/logout, auth/sessao (GET, devolve usuário + barbearia logados)
    barbearias/[slug]         → GET público (dados da barbearia pro fluxo do cliente)
    servicos, servicos/[id]   → dono gerencia cortes/preços
    barbeiros                 → dono lista/cadastra barbeiros
    disponibilidade, disponibilidade/[id]  → barbeiro gerencia a própria agenda
    horarios-livres           → GET público, usa calcularHorariosLivres()
    agendamentos, agendamentos/[id]  → cliente pede; barbeiro confirma/recusa/cancela (PATCH)
    agendamentos/[id]/cancelar → POST, cliente pede cancelamento (ver regra de negócio 9)
    financeiro                 → relatório por período, filtrado por papel (dono vê tudo da
                                  barbearia agrupado por barbeiro; barbeiro vê só o próprio)
    perfil                     → GET/PATCH, barbeiro edita o próprio whatsapp/callmebotApiKey
```

## Modelo de dados (resumo — ver prisma/schema.prisma para o completo)

- `Barbearia`: o tenant. Tem `slug` único usado na URL pública.
- `Usuario`: um único model para os 3 papéis (`papel`: CLIENTE / BARBEIRO / DONO).
  Clientes têm `barbeariaId` nulo (podem agendar em qualquer barbearia).
  Barbeiros e donos têm `barbeariaId` preenchido.
- `Servico`: corte oferecido por uma barbearia (`precoBase`, `duracaoMinutos`,
  `imagemUrl` opcional — foto do corte, guardada no Supabase Storage).
- `ServicoBarbeiro`: tabela de ligação — permite cada barbeiro ter um preço
  próprio para o mesmo corte, se quiser (opcional, senão usa `precoBase`).
- `Disponibilidade`: janela semanal que o barbeiro cadastra (dia da semana + hora início/fim).
  Tem `@@unique([barbeiroId, diaDaSemana, horaInicio, horaFim])` — não dá pra cadastrar a
  mesma janela duas vezes (horário diferente no mesmo dia continua permitido).
- `Agendamento`: liga cliente + barbeiro + serviço + data/hora. `status` vai de
  PENDENTE → CONFIRMADO/RECUSADO (decisão do barbeiro) → CONCLUIDO (depois do
  atendimento acontecer — hoje isso não é automático, ver "Pendências" abaixo).
  `precoCobrado` congela o preço no momento do agendamento, e
  `duracaoMinutos` (nullable) congela a duração da mesma forma — nenhum dos
  dois muda se o dono alterar o serviço depois. `duracaoMinutos` é nullable
  só porque foi adicionado depois de já existirem agendamentos; o cálculo
  de horário livre cai de volta pra duração atual do serviço quando é nulo.
  `cancelamentoSolicitadoEm`/`motivoCancelamento` (ambos nullable) guardam
  um pedido de cancelamento do cliente em aberto — ver regra de negócio 9.
- `Usuario.senhaHash` é nullable: contas criadas via "Entrar com Google"
  não têm senha. `Usuario.fotoUrl` guarda a foto de perfil (usada pelo
  barbeiro), também no Supabase Storage.

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
6. **Barbeiro chefe**: um `BARBEIRO` pode ter `ehChefe: true`
   (`Usuario.ehChefe`) — **só um por barbearia**, promovido/rebaixado pelo
   dono via `PATCH /api/barbeiros/[id]` (a rota rebaixa qualquer chefe
   atual antes de promover outro, numa transação, pra nunca sobrar mais
   de um). O chefe continua com agenda/disponibilidade/cortes própria
   igual qualquer barbeiro — por cima disso, ganha: (a) convidar barbeiro
   novo por e-mail (`POST /api/barbeiros`, antes só o dono podia — ver
   regra 8 sobre o convite em si); (b) ver
   agenda/faturamento de todos os barbeiros da barbearia passando
   `?equipe=1` em `GET /api/agendamentos`/`GET /api/financeiro` (sem esse
   parâmetro, o comportamento é idêntico ao de um barbeiro comum — inclusive
   pro próprio chefe, que só vê os PRÓPRIOS pedidos pendentes na tela de
   aceitar/recusar); (c) ver a disponibilidade de um colega (só leitura)
   via `GET /api/disponibilidade?barbeiroId=`. Um barbeiro comum (não
   chefe) que tenta usar `?equipe=1` tem o parâmetro **ignorado**
   silenciosamente (nunca 403, nunca vaza dado alheio — só devolve os
   próprios dados como sempre) — só `?barbeiroId=` de outro colega em
   `disponibilidade` retorna 403 se quem pede não for chefe/dono, porque
   ali é um pedido explícito de dado de outra pessoa. `ehChefe` nunca
   entra no cookie de sessão — toda rota que precisa saber confere direto
   no banco (`sessaoTemPrivilegioDeChefe()` em
   `src/lib/exigirSessao.ts`), pra uma promoção ter efeito imediato em vez
   de esperar até 30 dias (validade do cookie).
7. **Barbeiro nunca se autocadastra** — a única forma de virar `BARBEIRO`
   de uma barbearia é o dono (ou o barbeiro chefe, ver regra 6) convidar
   por `POST /api/barbeiros` (ver regra 8 — o convite por e-mail).
   `POST /api/auth/cadastro` só aceita
   `papel: "CLIENTE"` ou `"DONO"`. Isso já existiu de outro jeito (aceitava
   `papel: "BARBEIRO"` + um `barbeariaId` informado no corpo da requisição)
   e foi removido de propósito: `GET /api/barbearias/[slug]` é pública e
   sempre foi usada pelo fluxo do cliente, então o id de qualquer barbearia
   é descobrível por qualquer visitante — com o caminho antigo, isso
   bastava pra qualquer um virar barbeiro de verdade de qualquer barbearia
   existente, sem convite. Não reabrir esse caminho sem adicionar algum
   tipo de convite/aprovação do dono.
8. **Contratar barbeiro é um convite por e-mail, não criação direta** —
   `POST /api/barbeiros` (dono ou chefe) **não cria** o `Usuario` na hora:
   gera um token assinado (`criarTokenConviteBarbeiro`/
   `lerTokenConviteBarbeiro` em `src/lib/auth.ts`, mesmo molde do convite
   pendente do Google, validade 3 dias, nenhuma tabela nova) e manda um
   e-mail via Gmail/SMTP (`src/lib/email.ts`, biblioteca `nodemailer` —
   único serviço externo do projeto que precisa de uma biblioteca em vez
   de `fetch()` puro, porque SMTP não é uma API HTTP) com um link pra
   `/convite/aceitar?token=...`. Só quando a pessoa convidada clica,
   confirma e escolhe a própria senha
   (`POST /api/barbeiros/aceitar-convite`) é que a conta passa a existir
   — o chefe/dono nunca sabe a senha de quem contratou. Diferente da
   notificação de WhatsApp (`notificarNovoAgendamento`, que falha em
   silêncio de propósito), uma falha ao enviar esse e-mail **precisa**
   virar erro pra quem convidou, porque é o único jeito da pessoa
   completar o cadastro. Precisa de `GMAIL_USER`/`GMAIL_APP_PASSWORD`
   configuradas (ver "Ambiente"). Depois que a conta é criada, dispara
   também um e-mail de boas-vindas (`enviarEmailBoasVindas`) com o link
   de login e o link público da barbearia — esse aqui falha em silêncio
   (a conta já foi criada, é só um extra).
   
   **Por que Gmail e não a Resend**: a primeira versão usava a Resend
   (API HTTP simples), mas sem verificar um domínio próprio ela só deixa
   mandar e-mail pro e-mail da própria conta Resend — inviabilizava
   convidar qualquer barbeiro de verdade. Trocado pra Gmail/SMTP (conta
   pessoal do usuário + senha de app) por não exigir domínio próprio nem
   cadastro em serviço novo.
9. **Cancelamento de agendamento pelo cliente é um pedido, não um
   cancelamento direto** — `POST /api/agendamentos/[id]/cancelar` (só o
   CLIENTE dono do agendamento, `PENDENTE` ou `CONFIRMADO`) não muda o
   `status` na hora: só marca `Agendamento.cancelamentoSolicitadoEm`
   (+ `motivoCancelamento` opcional) e avisa o barbeiro por WhatsApp
   (`notificarSolicitacaoCancelamento`, mesmo padrão do
   `notificarNovoAgendamento`). O agendamento continua `PENDENTE`/
   `CONFIRMADO` e ocupando o horário normalmente enquanto o pedido está
   em aberto — de propósito, pra dar tempo do barbeiro falar com o
   cliente e entender o motivo antes de decidir (não existe um status à
   parte tipo "cancelamento solicitado": é só uma marca em cima do status
   que já existia, assim `calcularHorariosLivres()` não precisa saber
   disso). Só o barbeiro decide o que fazer, via
   `PATCH /api/agendamentos/[id]`: `{ status: "CANCELADO" }` confirma o
   cancelamento de vez (usa a transição `CANCELADO` que já existia no
   `TRANSICOES_PERMITIDAS`, só nunca tinha sido alcançável por ninguém até
   agora) e dispara `notificarCancelamentoConfirmado` pro próprio
   barbeiro; `{ recusarCancelamento: true }` mantém o agendamento como
   estava (limpa `cancelamentoSolicitadoEm`/`motivoCancelamento`, sem
   mudar o `status`) — 409 se não houver pedido em aberto. Um cliente só
   pode ter um pedido em aberto por vez (409 se tentar de novo). Não
   existe pedido de cancelamento pelo lado do barbeiro/dono: o barbeiro
   sempre pôde cancelar diretamente com `{ status: "CANCELADO" }`, isso
   não mudou.

## Pendências conhecidas / próximos passos (o usuário já sabe disso)

- Ideia futura (ainda sem escopo definido): coletar CPF do cliente,
  pensando num banco de dados de usuários mais completo mais pra frente.
  Não implementado — quando for a hora, precisa decidir se fica opcional
  ou obrigatório, e como pedir isso em quem se cadastra via Google (que
  não fornece CPF, precisaria de uma telinha extra tipo a que já existe
  pro dono informar o nome da barbearia).
- Não existe hoje um jeito automático de marcar um `Agendamento` como
  `CONCLUIDO` depois que o horário passa — hoje isso teria que ser feito
  manualmente ou implementado como próximo passo (ex: um cron job, ou o
  próprio barbeiro marcando como concluído no painel).
- Não existe troca de senha nem recuperação de senha por e-mail.
- Não existe notificação (e-mail/WhatsApp) quando o barbeiro confirma ou recusa.
- Não existe bloqueio de horário por exceção (ex: barbeiro de folga num
  dia específico dentro da janela normal de disponibilidade).
- Não existe tela pra editar/desativar um corte já cadastrado ou trocar sua
  foto depois de criado (a API já suporta via `PATCH`/`DELETE` em
  `servicos/[id]`, só falta a interface).
- Login com Google só cobre CLIENTE e DONO. BARBEIRO não usa esse fluxo —
  ver regra de negócio 7 acima. **Entrar com Google é login estrito**
  (`/entrar`, `?modo=entrar` — erro "Conta não encontrada" se não
  existir); **criar conta com Google só na tela de Cadastro**
  (`/cadastro?papel=CLIENTE` ou `?papel=DONO`, ambos com botão
  "Cadastrar com Google" agora).
- Não existe tela pra editar um `Servico` existente pra vincular/desvincular
  um `ServicoBarbeiro` de um contratado específico — hoje isso só acontece
  na criação (quem cria o corte é quem fica dono dele).
- E-mail de convite/boas-vindas enviado via Gmail pessoal (`src/lib/email.ts`)
  pode cair na caixa de spam de quem recebe, principalmente na primeira
  vez que aquele destinatário recebe algo desse remetente — é normal pra
  envio via conta Gmail pessoal (sem domínio/DNS próprio configurado) e
  tende a melhorar com o tempo. Não tem correção de código pra isso hoje;
  se virar problema recorrente, a solução de verdade é migrar pra um
  serviço de e-mail transacional com domínio verificado.

Se o usuário pedir para avançar em algum desses pontos, pode implementar
diretamente — são extensões esperadas do sistema, não mudanças de escopo.

## Próxima leva de mudanças pedidas (ainda não implementadas)

Nenhum item pendente no momento. A última leva foi a hierarquia de
barbeiro chefe/contratado (ver regra de negócio 6 e "Histórico de
mudanças implementadas" abaixo). Ainda em backlog, sob pedido: os itens
de baixa prioridade e de polimento de frontend/UX da segunda auditoria
(não estão listados neste arquivo, só no histórico de conversa daquela
sessão).

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
- **Landing page dinâmica + login/cadastro com Google + upload de
  imagens**: `src/app/page.tsx` virou um Server Component que redireciona
  DONO/BARBEIRO logados direto pro próprio painel (`/admin`/`/barbeiro`) —
  só quem não está logado vê a landing de verdade. Login com Google
  implementado do zero (sem NextAuth), fluxo Authorization Code com `jose`
  verificando o JWKS do Google: `src/app/api/auth/google/route.ts` inicia,
  `.../callback/route.ts` troca o code e decide (loga se o e-mail já
  existe; cria CLIENTE na hora se não existe e o intent era CLIENTE; se o
  intent era DONO e não existe, manda pra `/cadastro/finalizar-google` só
  pra pedir o nome da barbearia, via um token assinado de curta duração —
  `criarTokenGooglePendente`/`lerTokenGooglePendente` em `src/lib/auth.ts`).
  Upload de imagem (corte e foto de barbeiro) via Supabase Storage: rota
  `POST /api/upload` (dono/barbeiro autenticado, valida tipo e tamanho),
  helper `src/lib/storage.ts` (`enviarImagem`), campos `Servico.imagemUrl`
  e `Usuario.fotoUrl`. Ver regra de negócio 7 sobre por que BARBEIRO não
  usa login com Google.
- **Segunda auditoria completa + correções de segurança/lógica**: nova
  varredura do projeto (rotas de API, frontend, schema/libs) encontrou 36
  itens; os críticos/altos/médios (13) foram corrigidos nesta leva:
  secret JWT deixou de ter fallback hardcoded (agora dá `throw` se
  `JWT_SECRET` não estiver definida); autocadastro de `BARBEIRO` em
  barbearia arbitrária foi fechado (ver regra de negócio 7) e
  `GET /api/barbearias/[slug]` parou de vazar o `id` real da barbearia
  (agora usa `select` explícito); double-booking entre serviços de
  duração diferente foi fechado envolvendo a checagem+criação do
  agendamento numa transação Prisma com isolamento `Serializable` (antes
  só a constraint `@@unique([barbeiroId, data])` existia, que só pega o
  mesmo instante exato); `GET /api/horarios-livres` ganhou a mesma
  validação cross-tenant que `POST /api/agendamentos` já tinha; corridas de
  e-mail duplicado (cadastro de dono, finalizar cadastro Google, criar
  barbeiro) passaram a devolver 409 tratado em vez de 500 cru, e o cadastro
  de dono virou uma transação (Barbearia+Usuario) pra não deixar barbearia
  órfã; upload de imagem passou a validar a assinatura binária real do
  arquivo, não só o Content-Type declarado (`detectarTipoImagem` em
  `src/lib/storage.ts`); o token de "finalizar cadastro com Google" ganhou
  vínculo com um cookie httpOnly gerado no mesmo navegador que fez o login
  (campo `vinculo`), pra não ser um bearer credential completo só por
  vazar a URL; checagem de open-redirect no `next` do login Google ficou
  mais estrita; duração do serviço passou a ser congelada no agendamento
  (`Agendamento.duracaoMinutos`, ver "Modelo de dados"); marcar um
  agendamento como `CONCLUIDO` antes da hora acontecer agora dá 409;
  validação de `Disponibilidade` passou a rejeitar hora inválida e janela
  invertida (`horaInicio >= horaFim`); `calcularHorariosLivres()` ganhou
  uma guarda contra duração zero/negativa; notificação de WhatsApp ganhou
  timeout de 5s pra não segurar a resposta do agendamento. Os itens de
  baixa prioridade e de frontend/UX (23 no total) ficaram como backlog,
  não implementados nesta leva — a lista completa está registrada no
  histórico de conversa, não neste arquivo.
- **Barbeiro chefe / barbeiro contratado**: ver regra de negócio 6 pro
  detalhe completo. Resumo das decisões tomadas: um chefe só por
  barbearia (não múltiplos chefes com equipes separadas); o próprio chefe
  contrata os barbeiros dele (`POST /api/barbeiros` deixou de ser só do
  dono); o chefe também atende clientes normalmente, com agenda própria
  igual qualquer barbeiro, e por cima disso ganha visão de supervisão via
  `?equipe=1` em `agendamentos`/`financeiro` e `?barbeiroId=` (leitura) em
  `disponibilidade`. Adicionado também um link "Falar no WhatsApp" na
  tela de confirmação do agendamento do cliente (`POST /api/agendamentos`
  agora devolve `barbeiro: {nome, whatsapp}` na resposta), além da
  notificação automática que já existia. Painel do barbeiro
  (`barbeiro/page.tsx`) ganhou também um contador de "cortes hoje" (fetch
  extra em `/api/financeiro?periodo=dia`, sem `equipe`) pra qualquer
  barbeiro, chefe ou contratado — cobre "quantos cortes hoje/no mês e
  valor total" que só o contratado via antes de forma incompleta (só
  tinha o total do mês). Carlos (barbearia-do-ze) foi promovido a chefe
  como demonstração — nenhum outro barbeiro de teste foi alterado.
- **Convite de barbeiro por e-mail**: ver regra de negócio 8 pro detalhe
  completo. `POST /api/barbeiros` deixou de criar a conta na hora — manda
  um convite por e-mail com um link que só cria o `Usuario` depois que a
  pessoa confirma e escolhe a própria senha (`/convite/aceitar`,
  `POST /api/barbeiros/aceitar-convite`). Os formulários de
  "adicionar/contratar barbeiro" em `admin/page.tsx` e `barbeiro/page.tsx`
  perderam o campo de senha inicial. Testado de ponta a ponta com um
  token forjado com a `JWT_SECRET` real. Implementado primeiro com a
  Resend, mas trocado pra Gmail/SMTP (`nodemailer`) porque a Resend sem
  domínio verificado só deixa mandar e-mail pro e-mail da própria conta —
  não dava pra convidar barbeiro nenhum de verdade (achado só depois do
  usuário testar em produção). Ver regra de negócio 8 pro porquê completo.
  Também adicionados: e-mail de boas-vindas depois que o convite é aceito
  (login + link público da barbearia), link "Já tem conta? Entrar" em
  `/cadastro` e "Não tem conta? Cadastre-se" em `/entrar`.
- **Mensagens de erro específicas no login por e-mail/senha**:
  `POST /api/auth/login` deixou de responder um genérico "E-mail ou senha
  incorretos" pros três casos possíveis — agora diz "Usuário não
  existente" (404, e-mail sem conta), "Essa conta usa login com Google"
  (401, conta existe mas não tem senha — foi criada via Google) ou "Senha
  incorreta" (401, conta e senha existem mas não batem). **Decisão
  deliberada do usuário**, reconhecidamente trocando uma proteção contra
  enumeração de e-mail (que existia de propósito) por uma mensagem mais
  clara — não é um bug corrigido, é uma escolha de produto. Se algum dia
  quiserem voltar a mensagem genérica por segurança, é só reverter esse
  arquivo.
- **Login com Google separado de cadastro com Google**: quando perguntado, o usuário primeiro disse pra manter
  "Entrar com Google" criando conta de cliente automaticamente — mas ao
  testar de verdade, percebeu que não era o que queria (selecionar uma
  conta Google sem cadastro na tela de Entrar voltava pra home sem
  explicação nenhuma) e pediu pra separar. `GET /api/auth/google` ganhou
  `?modo=entrar` (usado só pelo link em `/entrar`): se o e-mail não tiver
  conta, o callback nunca cria nada — redireciona de volta pra `/entrar`
  com "Conta não encontrada" (usa o mesmo parâmetro `?erro=` que a tela
  já lia). `/cadastro?papel=CLIENTE` ganhou seu próprio botão "Cadastrar
  com Google" (antes só o DONO tinha) — é o único lugar que cria conta de
  cliente via Google agora. Confirma que decisões desse tipo, tomadas
  antes de testar de verdade, podem mudar depois — vale sempre reconferir
  com o usuário se o comportamento bateu com a expectativa, em vez de
  assumir que a resposta da pergunta fechou o assunto.
- **Horários ocupados aparecem cinza em vez de sumir + mensagem clara de
  403 no agendamento**: `calcularHorariosLivres()` (`src/lib/horarios.ts`)
  passou a devolver também `ocupados: string[]` (horários dentro do
  expediente que já têm agendamento), além do `horarios` (livres) que já
  existia — `GET /api/horarios-livres` repassa os dois. `[slug]/page.tsx`
  agora desenha os dois juntos, ordenados, com os ocupados desabilitados
  e acinzentados (antes só sumiam da lista, o que confundia o cliente
  sobre o que realmente estava disponível). Também corrigido: tentar
  agendar logado como `DONO`/`BARBEIRO` (contas que não são de cliente)
  dava um 403 com mensagem genérica ("Sem permissão") sem explicar por
  quê — agora mostra uma mensagem específica dizendo que é preciso entrar
  com uma conta de cliente.
- **Disponibilidade só de meia em meia hora**: `POST /api/disponibilidade`
  passou a exigir que `horaInicio`/`horaFim` sejam em ponto ou meia
  (minuto 00 ou 30) — os `<input type="time">` em `barbeiro/page.tsx`
  ganharam `step={1800}` (30min) pra já guiar isso na interface. Evita
  janelas de expediente com início/fim "quebrado" (ex: 09:15).
- **Terceira auditoria completa + correções de segurança/lógica**: nova
  varredura (rotas de API, frontend, schema/libs), focada no que foi
  adicionado desde a segunda auditoria (chefe, convite por e-mail, split
  Google). Encontrou 14 itens; os críticos/altos/médios (10) foram
  corrigidos nesta leva: e-mails de convite/boas-vindas passaram a
  escapar HTML e remover quebra de linha de `nome`/`barbeariaNome`/
  `convidadoPorNome` antes de interpolar (`src/lib/email.ts`) — sem isso,
  como o autocadastro de dono é público e sem verificação, dava pra
  qualquer um mandar HTML arbitrário (phishing) saindo do Gmail real
  configurado, pra qualquer endereço; `PATCH /api/barbeiros/[id]`
  (promover/rebaixar chefe) passou a rodar em transação `Serializable`
  igual `POST /api/agendamentos`, fechando uma corrida que podia deixar
  dois chefes simultâneos na mesma barbearia; `GET /api/barbeiros` parou
  de devolver e-mail dos colegas pra barbeiro comum (só dono/chefe, igual
  já valia pro `POST`); `buscarAgendamentosOcupados()`
  (`src/lib/horarios.ts`) ganhou uma margem de 6h antes da meia-noite na
  busca, fechando uma lacuna onde um agendamento que começa perto da
  virada do dia e invade o dia seguinte ficava invisível pra quem
  consultava esse dia seguinte; número de WhatsApp passou a ser
  normalizado (só dígitos) ao salvar em `PATCH /api/perfil`, e o link
  "Falar no WhatsApp" no cliente também sanitiza defensivamente;
  `/convite/aceitar` mostra um aviso se o navegador já tiver uma sessão
  logada, antes de trocar silenciosamente pra conta nova; o painel do
  chefe (`barbeiro/page.tsx`) passou a atualizar a seção "Minha equipe"
  no mesmo polling de 8s que já existia; `calcularHorariosLivres()` ganhou
  um terceiro estado (`diaEncerrado`) pra diferenciar "esse dia já
  passou/expediente encerrou" de "está genuinamente lotado", evitando uma
  mensagem confusa; o link "criar conta" (e o futuro "Cadastrar com
  Google") na página da barbearia passou a propagar `next=`, e
  `cadastro/page.tsx` passou a honrar isso depois do cadastro — antes o
  cliente perdia o corte/horário escolhido e caía na home; e
  `POST /api/barbeiros/aceitar-convite` passou a logar automaticamente na
  conta existente numa corrida de e-mail duplicado, igual
  `google/finalizar` já fazia, em vez de só devolver 409. Os itens
  restantes (baixa prioridade — sistemático de `fetch()` sem tratamento
  de erro de rede, duplicação de upload, corrida no seletor de período do
  admin, etc.) ficaram como backlog, a maioria já vinha de uma auditoria
  anterior.
- **Grade de horários sempre de 30 em 30 minutos + login visível na
  página do cliente**: `calcularHorariosLivres()` (`src/lib/horarios.ts`)
  oferecia um horário a cada `duracaoMinutos` do próprio serviço — um
  corte de 90min pulava 9:00 → 10:30 → 12:00, escondendo os horários de
  30min que cabiam no meio. Agora o passo é sempre fixo em 30min
  (`PASSO_GRADE_MINUTOS`), e um serviço mais longo simplesmente marca
  vários desses horários como ocupados (qualquer um que colidiria com um
  agendamento já existente) — o tempo real continua "descontado"
  certinho, só a lista de horários oferecidos ficou mais granular.
  `src/app/[slug]/page.tsx` também ganhou um cabeçalho pequeno mostrando
  se o cliente já está logado (com botão "Sair") ou, se não, os links
  "Entrar"/"Cadastre-se" direto — antes só apareciam depois de tentar
  agendar e tomar erro de permissão.
- **Carrossel de próximos agendamentos + chefe vê agenda de um contratado
  específico**: painel do barbeiro (`barbeiro/page.tsx`) ganhou uma seção
  "Próximos agendamentos" (PENDENTE/CONFIRMADO em dias depois de hoje —
  "Agendamentos de hoje" já cobre o dia de hoje) num carrossel horizontal
  (`overflow-x-auto`), reaproveitando os mesmos `GET /api/agendamentos`
  já usados noutras partes do painel. `GET /api/agendamentos` ganhou um
  parâmetro `?barbeiroId=<id>` — chefe (ou dono) consegue ver os
  agendamentos ainda não realizados de UM colega específico (mesmo padrão
  de permissão já usado em `?barbeiroId=` de `disponibilidade`); barbeiro
  comum tentando ver de outro colega continua dando 403. Na seção
  "Barbeiros contratados" do chefe, clicar num nome agora abre/fecha a
  agenda (pendente + confirmado) daquele contratado especificamente.
- **Trava contra disponibilidade duplicada**: `Disponibilidade` ganhou
  `@@unique([barbeiroId, diaDaSemana, horaInicio, horaFim])` (migração
  `disponibilidade_sem_duplicata`) — um barbeiro não consegue mais
  cadastrar a mesma janela (mesmo dia da semana + mesmo início + mesmo
  fim) duas vezes. `POST /api/disponibilidade` trata o erro de constraint
  (P2002) e devolve 409 "Você já tem esse horário cadastrado nesse dia"
  em vez de deixar estourar um 500 cru. Um horário diferente no mesmo dia
  continua sendo permitido normalmente — só a janela idêntica é barrada.
- **Cliente pode pedir cancelamento de agendamento**: ver regra de negócio
  9 pro detalhe completo. Resumo: `POST /api/agendamentos/[id]/cancelar`
  (nova rota) deixa o cliente pedir cancelamento de um `PENDENTE`/
  `CONFIRMADO` — isso não cancela na hora, só marca o pedido (campos novos
  `cancelamentoSolicitadoEm`/`motivoCancelamento` no `Agendamento`) e
  avisa o barbeiro por WhatsApp, pra ele poder conversar com o cliente e
  entender o motivo antes de decidir. O barbeiro decide via
  `PATCH /api/agendamentos/[id]`: `{status:"CANCELADO"}` confirma (e
  agora dispara uma notificação de WhatsApp pro próprio barbeiro
  confirmando o cancelamento) ou `{recusarCancelamento:true}` mantém o
  agendamento como estava. `src/lib/whatsapp.ts` ganhou
  `notificarSolicitacaoCancelamento`/`notificarCancelamentoConfirmado`
  (reaproveitando a mesma função de envio de `notificarNovoAgendamento`,
  só que agora fatorada num helper interno comum). Nova página
  `src/app/meus-agendamentos/page.tsx` — não existia nenhuma tela do
  cliente pra ver o próprio histórico de agendamentos antes disso; agora
  tem link em `[slug]/page.tsx` (cabeçalho, pro cliente logado) e na
  landing (`page.tsx`, só aparece se logado como cliente). Testado de
  ponta a ponta via script com sessão forjada (`jose` + `JWT_SECRET`
  real): pedido duplicado dá 409, outro cliente não consegue pedir
  cancelamento do agendamento alheio (404), recusar sem pedido em aberto
  dá 409, e o ciclo completo pedir → recusar → pedir de novo → confirmar
  funciona e limpa os campos corretamente em cada passo.

## Ambiente / variáveis necessárias

Arquivo `.env` (baseado em `.env.example`):
- `DATABASE_URL` — string de conexão do Postgres (Supabase)
- `JWT_SECRET` — string aleatória para assinar os cookies de sessão.
  `src/lib/auth.ts` dá `throw` no carregamento do módulo se isso não
  estiver definida — de propósito, não existe (nem deve voltar a existir)
  um valor de fallback hardcoded pra assinatura de sessão.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — upload de imagens
  (cortes/fotos de barbeiro) pro Supabase Storage, bucket `uploads`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — login/cadastro com Google
  (ver `src/app/api/auth/google/*`). Sem isso, os botões "Entrar/Cadastrar
  com Google" respondem com erro, mas o resto do app funciona normalmente.
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — envio do e-mail de convite de
  barbeiro e boas-vindas (ver regra de negócio 8, `src/lib/email.ts`).
  `GMAIL_APP_PASSWORD` **não é** a senha normal da conta Google — é uma
  "senha de app" de 16 letras, gerada em
  `myaccount.google.com/apppasswords` (exige verificação em duas etapas
  ativada na conta primeiro). Sem essas duas, convidar um barbeiro
  (`POST /api/barbeiros`) responde 502, mas o resto do app funciona
  normalmente.

Rodar `npx prisma migrate dev` antes da primeira execução para criar as
tabelas no banco.

**Nunca coloque valores reais dessas variáveis em `.env.example`** — esse
arquivo é versionado no git (só tem placeholders); os valores reais ficam
só em `.env`, que não é versionado.
