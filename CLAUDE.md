# CLAUDE.md

Contexto pro Claude (via Claude Code) sobre este projeto. Leia antes de mexer no código.

## O que é

SaaS de agendamento para barbearias. Três papéis: **Cliente** (escolhe cortes → barbeiro → horário → pede agendamento), **Barbeiro** (define disponibilidade, aceita/recusa pedidos), **Dono** (cadastra barbeiros/cortes, vê faturamento). Projeto já instalado/migrado/testado; código escrito à mão, sem internet, e já auditado várias vezes (ver histórico no fim).

**Onde rodar**: pasta original em OneDrive é lenta pra `npm install`/`next dev`/`build` (conflito de I/O com Defender). Cópia de trabalho real fica em `C:\dev\barbershop-saas`, fora do OneDrive — editar/testar sempre lá, replicando mudanças pra pasta do OneDrive.

## Stack

Next.js 14 (App Router, front+back juntos) · PostgreSQL via Prisma · Tailwind · `jose` (JWT em cookie httpOnly) · `bcryptjs` · `zod`. Deploy: Vercel + Supabase (Postgres).

## Multi-tenancy por linha (decisão mais importante)

Um único banco; isolamento via coluna `barbeariaId` em `Usuario`/`Servico`/`Agendamento`. **Toda query de sessão DONO/BARBEIRO deve filtrar por `barbeariaId` (ou `barbeiroId`)** — nunca devolver dados de outra barbearia. Helper: `src/lib/exigirSessao.ts`. Não usar bancos separados por barbearia (decisão já tomada).

## Idioma

Tudo em português: tabelas, campos, variáveis, rotas, comentários, textos de UI. Não misturar com inglês.

## Estrutura (resumo)

- `prisma/schema.prisma` — modelo de dados; `prisma/seed.ts` — barbearia de teste.
- `src/lib/`: `db.ts` (Prisma singleton), `auth.ts` (hash/sessão/tokens), `exigirSessao.ts` (`exigirSessao(["DONO"])`, `sessaoTemPrivilegioDeChefe()`, `sessaoAtendeComoBarbeiro()`), `horarios.ts` (`calcularHorariosLivres()` — lógica mais delicada do sistema), `whatsapp.ts` (notificações CallMeBot, falham em silêncio), `email.ts` (convite/boas-vindas via Gmail/SMTP, nodemailer), `storage.ts` (upload Supabase, valida assinatura binária real).
- `src/app/`: landing, `entrar`, `cadastro`, `[slug]` (fluxo cliente), `barbeiro/*` (painel, perfil, desempenho), `admin` (painel dono), `meus-agendamentos`, `convite/aceitar`, e toda a `api/*` correspondente (auth, barbearias, servicos, barbeiros, disponibilidade, horarios-livres, agendamentos, financeiro, relatorio-equipe, perfil, upload).
- `src/components/`: `Cabecalho.tsx` (painéis logados); `PainelDisponibilidade.tsx` (edição/replicar disponibilidade) e `PainelCortes.tsx` (criar/editar/vincular/aprovar corte) — os dois compartilhados entre `barbeiro/page.tsx` (seção do chefe) e `admin/page.tsx`, pra não divergir a UI de gestão entre as duas telas.

## Modelo de dados (essencial)

- `Barbearia`: tenant, `slug` único.
- `Usuario`: um model pra 3 papéis. Cliente sem `barbeariaId`; `whatsapp` obrigatório no cadastro de CLIENTE (e-mail/senha ou Google — nos dois casos, nome/e-mail vêm livres, só `whatsapp` é exigido de verdade). `senhaHash` nullable (login Google). `atendeComoBarbeiro` (só DONO). `ehChefe` (só um por barbearia, nunca no cookie).
- `Servico`: corte da barbearia (`precoBase`, `duracaoMinutos`, `imagemUrl`, `aprovado` — regra 5). `ServicoBarbeiro`: vínculo explícito corte↔barbeiro (sempre obrigatório pra atender/aparecer, regra 5), com preço próprio opcional.
- `Disponibilidade`: janela semanal; `@@unique([barbeiroId, diaDaSemana, horaInicio, horaFim])`.
- `Agendamento`: cliente+barbeiro+data/hora, **sem** `servicoId` único (ver `AgendamentoServico`). Status: PENDENTE → CONFIRMADO/RECUSADO → CONCLUIDO (a qualquer momento, sem travar por horário). `precoCobrado`/`duracaoMinutos` congelam a soma no momento da criação. `cancelamentoSolicitadoEm`/`motivoCancelamento` = pedido de cancelamento em aberto. `confirmadoEm`/`concluidoEm` marcam a confirmação/conclusão (mesmo padrão: só na primeira vez, usados no relatório de desempenho). `observacoes` é preenchido automaticamente (nunca editável) quando a conclusão acontece num dia diferente do agendado.
- `AgendamentoServico`: um corte dentro do agendamento, congela nome/preço/duração; `@@unique([agendamentoId, servicoId])`.

## Regras de negócio inquebráveis

1. Só o próprio barbeiro confirma/recusa seu agendamento.
2. PENDENTE já ocupa o horário (`calcularHorariosLivres` considera PENDENTE+CONFIRMADO).
3. Criação de agendamento revalida o horário antes de gravar (evita corrida).
4. Financeiro soma só `CONCLUIDO`.
5. Corte (`Servico`) sempre precisa de vínculo explícito com quem atende (`ServicoBarbeiro`) — sem vínculo nenhum, o corte existe mas não aparece pra ninguém (não existe mais "sem vínculo = barbearia toda"). Chefe/dono (`sessaoTemPrivilegioDeChefe`) cria já `aprovado`, escolhendo livremente quais contratados atendem (`POST`/`PATCH /api/servicos` com `barbeiroIds[]` — `PATCH` substitui a lista inteira, `PainelCortes.tsx`). Um BARBEIRO contratado comum que cria um corte gera uma solicitação pendente (`aprovado:false`, vinculada só a ele); só aparece pro cliente depois que o chefe aprovar (`PATCH {aprovado:true}`) — rejeitar é só excluir, mesma regra de sempre.
6. Barbeiro chefe: um só por barbearia; convida barbeiros, vê equipe via `?equipe=1` (ignorado silenciosamente pra barbeiro comum) e disponibilidade alheia (`?barbeiroId=`, 403 se não for chefe/dono).
7. Barbeiro nunca se autocadastra — só via convite do dono/chefe. `POST /api/auth/cadastro` só aceita CLIENTE/DONO.
8. Contratar barbeiro = convite por e-mail (token assinado, 3 dias) via Gmail/SMTP; conta só é criada quando aceito e senha escolhida. Falha no envio do convite é erro real (bloqueia); e-mail de boas-vindas falha em silêncio.
9. Cancelamento pelo cliente: PENDENTE cancela direto; CONFIRMADO vira só um "pedido" (`cancelamentoSolicitadoEm`) até o barbeiro confirmar (`status:"CANCELADO"`) ou recusar (`recusarCancelamento:true`). Um pedido em aberto por vez.
10. Dono pode atender como barbeiro (`atendeComoBarbeiro`, interruptor via `PATCH /api/perfil`) — passa a valer como barbeiro em disponibilidade, agendamentos, listagem pública (inclusive foto de perfil, `fotoUrl`, mesmo upload que o barbeiro usa). UI em `/admin`, seção própria (não reaproveita `/barbeiro/perfil`).
11. Relatório de desempenho (`/api/relatorio-equipe`, tela "Visualizar dados da barbearia"): chefe/dono vê a equipe inteira; barbeiro comum também acessa, mas só a própria linha (nunca escolhe colega nem vê a barbearia toda). Campos: `totalAgendamentos`, faturamento, corte mais feito, cancelados, tempo médio até confirmar, lista de cortes concluídos no período com data marcada + `concluidoEm` (destaca quando divergem); período livre de datas (`?de=/?ate=`, cobre qualquer intervalo, inclusive vários meses juntos).
12. Agendamento com múltiplos cortes (`servicoIds[]`, interseção de barbeiros que atendem todos); barbeiro vê contato do cliente (`email`/`whatsapp`, botão "Ver contato"); corte pode ser editado ou excluído (`PATCH`/`DELETE /api/servicos/[id]`, mesma regra nos dois: dono qualquer um da barbearia, barbeiro só o próprio exclusivo). `CONCLUIDO` antes da hora marcada foi liberado por decisão do usuário (não bloqueia mais).
13. Barbeiro pode ocultar da própria visão um agendamento CONCLUIDO/CANCELADO (`ocultoPeloBarbeiro`, `PATCH /api/agendamentos/[id]` com `{ocultar:true|false}`) — não apaga nada, só some do `GET /api/agendamentos` padrão; `?mostrarOcultos=1` desfaz o filtro (tela tem um toggle "Mostrar ocultos" pra isso). Só o próprio barbeiro do agendamento pode ocultar o dele.

## Pendências conhecidas

- CPF do cliente: ideia futura, não implementada.
- Sem cron pra marcar CONCLUIDO automaticamente após o horário passar.
- Sem troca/recuperação de senha por e-mail.
- Sem notificação quando barbeiro confirma/recusa.
- Sem bloqueio de horário por exceção (folga pontual).
- Login Google só CLIENTE/DONO (ver regra 7); "Entrar" é estrito, "Cadastro" cria conta.
- E-mails via Gmail pessoal podem cair em spam (sem domínio próprio) — sem correção de código, migrar pra serviço transacional se virar problema.
- `DATABASE_URL` ainda aponta pra conexão direta (5432), não pro pooler — falta a string do pooler, que só existe no painel do Supabase (região específica). Schema já preparado (`directUrl`/`DIRECT_URL`).

Itens de backlog podem ser implementados diretamente se pedidos — são extensões esperadas. Nenhum item na fila "próxima leva" no momento.

## Histórico de mudanças (resumo cronológico)

Varredura inicial (~15 bugs: vazamento de senhaHash, cross-tenant, double-booking, fuso horário, etc.) → sessão/cabeçalho → fix de horários por fuso → WhatsApp via CallMeBot → agenda do dia + corte próprio do barbeiro → polling 8s → estados de loading/sucesso → landing dinâmica + login/cadastro Google + upload de imagens → **2ª auditoria** (36 itens, 13 críticos corrigidos: JWT sem fallback, autocadastro de barbeiro fechado, double-booking com transação Serializable, validação cross-tenant em horários-livres, e-mails duplicados tratados, upload valida binário real, etc.) → barbeiro chefe/contratado (regra 6) → convite de barbeiro por e-mail (regra 8, trocado de Resend pra Gmail) → mensagens de erro específicas no login (decisão de produto, não bug) → login Google separado de cadastro Google → horários ocupados aparecem cinza + erro 403 mais claro → disponibilidade só de 30 em 30 min → **3ª auditoria** (14 itens, 10 corrigidos: XSS em e-mails, transação no promover chefe, e-mail de colega escondido de barbeiro comum, margem de 6h em agendamentos próximos à meia-noite, normalização de WhatsApp, etc.) → grade de horários sempre de 30min + header de login na página do cliente → carrossel de próximos agendamentos + chefe vê agenda de um contratado específico → trava contra disponibilidade duplicada (constraint + 409) → cliente pode pedir cancelamento (regra 9) + tela `/meus-agendamentos` → **4ª auditoria** (12 bugs + 14 melhorias de performance, tudo implementado: normalização de e-mail, closure velha no polling do chefe, validação real de disponibilidade/horário passado ao criar agendamento, limpeza de pedido de cancelamento em qualquer mudança de status, índices de banco, Server Component na página pública, `next/image`, etc.) → fix de mensagem de erro/sucesso invisível (estava fora da viewport, não era bug de backend) → dono também atende como barbeiro (regra 10) → botões mais visíveis ("Meus agendamentos", WhatsApp do dono) → cancelamento direto de PENDENTE (regra 9 atualizada) + relatório de desempenho do chefe (regra 11) → agendamento com múltiplos cortes + contato do cliente pro barbeiro + excluir corte próprio (regra 12) → fluxo do cliente invertido (barbeiro antes do corte) + WhatsApp obrigatório no agendamento + painel do barbeiro com 3 campos (agendados/concluídos/cancelados) → ocultar concluído/cancelado da própria visão com filtro "mostrar ocultos" (regra 13) + relatório aberto pro barbeiro comum (só os próprios dados) com total de agendamentos, tela renomeada "Visualizar dados da barbearia" (regra 11) → ajustes de interface: seletor de período da "Visualizar dados da barbearia" com intervalo livre (de/até) escondido atrás do botão "Adicionar data diferente" (atalhos Hoje/Semana/Mês/Ano sempre visíveis, seletor de mês avulso removido) + campo de WhatsApp tirado de `/meus-agendamentos` (continua sendo pedido só no momento do agendamento, em `[slug]`) → disponibilidade replicável pra outros dias da semana (`POST /api/disponibilidade/replicar`, duplicata ignorada em silêncio) + edição direta de uma janela sem excluir/recriar (`PATCH /api/disponibilidade/[id]`, mesma validação da criação) + tela de editar corte em "Meus cortes"/"Cortes e preços" (regra 12) → foto de perfil do dono-que-atende: backend já aceitava (`/api/upload` e `/api/perfil` nunca bloquearam DONO), faltava só a interface — adicionada no card "Eu também atendo" em `/admin` (regra 10) → **auditoria de UX** (82 achados, frontend puro): críticos + importantes corrigidos (44 itens de polimento ficaram como backlog) — `.btn-secondary` ganhou estado visual de desabilitado, toda tela de entrada trata falha de rede, contraste/labels corrigidos, confirmação antes de excluir/remover/rebaixar chefe/desativar atendimento, WhatsApp do cliente em `[slug]` virou `<form>` de verdade (Enter/`required` funcionam), painel do dono ganhou o mesmo polling de 8s do barbeiro (pedido novo aparece sem F5) e a mesma seção "Agendamentos de hoje", `PainelDisponibilidade` unificou a edição/replicar (antes só existia pro barbeiro) → data marcada vs. data de conclusão: `concluidoEm` (regra 11, mesmo padrão de `confirmadoEm`) + `observacoes` gerado automaticamente quando a conclusão diverge do dia agendado (antes ou depois), visível pro barbeiro comum em "Cortes concluídos" (não só chefe/dono) → sessão deslogando com frequência sem o cookie ter expirado: bug era `Cabecalho.tsx` tratando qualquer erro (`!r.ok`, inclusive um 500 passageiro) como sessão inválida, em vez de checar só 401 — corrigido, mesmo padrão já usado no resto do app → "Visualizar dados da barbearia" quebrado no mobile: cabeçalho sem `flex-wrap` (título e botão se sobrepondo) e a lista de cortes concluídos espremendo o nome do corte até sumir — os dois corrigidos, testado em 375px → WhatsApp obrigatório no cadastro de CLIENTE (e-mail/senha e Google — o Google ganhou a mesma telinha extra "falta só um detalhe" que o DONO já tinha pro nome da barbearia, agora também usada pra pedir o WhatsApp) → cortes com vínculo explícito + aprovação do chefe (regra 5 reescrita): chefe/dono escolhe livremente quais contratados atendem cada corte (`PainelCortes.tsx`, migração com backfill pra preservar o comportamento antigo nos cortes já existentes); corte criado por um contratado vira solicitação pendente até o chefe aprovar; corte aprovado sem nenhum vínculo fica invisível pro cliente (não é mais "barbearia toda atende" por padrão).

## Ambiente (.env)

`DATABASE_URL` (Supabase, hoje conexão direta) · `DIRECT_URL` (sempre direta, usada por `prisma migrate`) · `JWT_SECRET` (sem fallback, obrigatória) · `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (upload, bucket `uploads`) · `GOOGLE_CLIENT_ID`/`SECRET` (opcional, sem isso só os botões Google falham) · `GMAIL_USER`/`GMAIL_APP_PASSWORD` (senha de app de 16 letras, não a senha normal; sem isso convidar barbeiro responde 502).

Rodar `npx prisma migrate dev` antes da primeira execução. **Nunca** colocar valores reais em `.env.example` (versionado) — só em `.env` (não versionado).
