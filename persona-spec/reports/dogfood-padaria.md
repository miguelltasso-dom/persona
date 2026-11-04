# Dogfood — Padaria Lua

Home limpo: `C:/Users/migue/dev/persona/.maestri/tmp/e2e-be52e732-7084-4183-9ac6-0540b7e9a511`. Perfil `persona`. Runners scriptados. Execuções reais: 0 / 20.

Rodada Forge 03/11 22:22 (vitest `dogfood-padaria.spec.ts` 1/1, 92.7 s, `PERSONA_HOST_NO_LOCK=1`). Overlay do caminho real não fecha; o resto do cenário rodou com `PERSONA_DEV_SEED`.

## Cenário percorrido

- ok: boot shell
- ok: onboarding passos 1–5 até Entrar no Persona (Clara / Padaria Lua / Loja online)
- ok: reabriu seed (`PERSONA_DEV_SEED`) para o resto
- ok: Quadros (projeto Pessoal visível)
- ok: #geral aberto (equipe seed Atlas/Bento/Nina/Sol/Luna)
- ok: Visão geral (Precisa de você + Agora)
- ok: Aprovações (iniciativa + cartão Contratar)
- ok: Saúde da equipe (botão Teste dos 2 dias visível)
- ok: Perfil (Luna)

## Atritos a corrigir

### DF-001 — Dois botões Continuar com o assistente aberto

- Severidade: **P1**
- Dono: **Prism**
- Passos: Onboarding passo 4 → Assistente de estrutura
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/03-dois-continuar.png`
- Esperado: só o Continuar do assistente (o do overlay some ou muda de rótulo)
- Obtido: footer do overlay continua visível e avança o passo 4 sem aplicar a equipe

### DF-002 — Overlay remonta após Entrar no Persona (contrato RPC errado)

- Severidade: **P0**
- Dono: **Prism**
- Passos: Passo 5 → Entrar no Persona
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/04-overlay-remount.png`
- Esperado: overlay some; `getOnboarding.firstUse === false`
- Obtido: scrim do passo 5 volta. Causa: `persona-live-store.completeOnboarding` manda `{ roster, projectId, memberId }`; host `CompleteOnboardingRequest` exige `{ team, personalProjectId, templateIds, runnerChoices, cofreSeed }`. O seed (`seed-default-team.ts`) já manda o contrato certo — por isso o segundo boot fecha o overlay.
- Relacionado: `04-overlay-stuck.png`

### DF-005 — Novo projeto não pede nome (Site / produto)

- Severidade: **P1**
- Dono: **Lumen**
- Passos: Quadros → Novo projeto → Site / produto → Usar este modelo
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/proj-Site novo-sem-nome.png`
- Esperado: campo nome = "Site novo" (projeto separado com fluxo Site)
- Obtido: só troca o modelo do projeto Pessoal atual (`createWorkflowFromTemplate`)

### DF-006 — Novo projeto não pede nome (Contratação)

- Severidade: **P1**
- Dono: **Lumen**
- Passos: Quadros → Novo projeto → Contratação → Usar este modelo
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/proj-Contratar confeiteiro-sem-nome.png`
- Esperado: projeto "Contratar confeiteiro" com fluxo Contratação
- Obtido: igual DF-005; não há dois projetos

### DF-007 — Sprint 1 não dá para iniciar

- Severidade: **P2**
- Dono: **Lumen**
- Passos: Quadros após aplicar modelo Site
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/sprint-ausente.png`
- Esperado: Planejar / Iniciar sprint
- Obtido: botão ausente (filtro "Com sprint ativa" existe; ação de criar não)

### DF-008 — DM começa vazio e o passeio não abre conversa

- Severidade: **P1**
- Dono: **Prism**
- Passos: Mensagens diretas após seed (equipe no rail)
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/07-dms-vazio.png`
- Esperado: uma DM pronta ou clique no rail/avatar abre composer
- Obtido: empty honesto ("Nenhuma conversa ainda" + Nova conversa). Pedido em DM não foi feito.

### DF-010 — Não há controle para a pessoa marcar-se fora

- Severidade: **P1**
- Dono: **Lumen** (Perfil) / **Prism** (Visão geral)
- Passos: Perfil da Luna → presença
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/10-fora-ausente.png`
- Esperado: ação Fora / Ausente para o humano
- Obtido: "Online ativa agora"; sem controle. Por isso DF-011.

### DF-011 — Painel Enquanto você estava fora não apareceu

- Severidade: **P2**
- Dono: **Prism**
- Passos: (não deu para marcar fora) → Visão geral
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/11-away-panel.png`
- Esperado: heading "Enquanto você estava fora"
- Obtido: ausente. Bloqueado por DF-010; empty honesto se ninguém esteve fora.

### DF-013 — Pedido da Padaria no #geral não entrou no transcript

- Severidade: **P1**
- Dono: **Prism**
- Passos: composer #geral → "Preciso de um rascunho da home da Padaria Lua…" → Enviar (exact)
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/06-geral-pedido.png`
- Esperado: mensagem da Clara/Você no canal
- Obtido: composer voltou ao placeholder; transcript só tem o seed (contratação até amanhã). Enviar colidia com "Enviar imagem" (corrigido no harness com `exact: true`); o post em si não apareceu.

## Confirmado no seed (não é bug)

- **DF-003 (reclassificado — falso positivo, Probe 03/11 23:50)**: "Bem-vindoao#geral" / "Cadaprojetocomoseufluxo" vinham do harness concatenando `textContent` de nós irmãos no ramo errado do passo 5, não da UI. Capturas `04-*` / `05-quadros.png` / `06-geral-pedido.png` mostram espaços corretos. Correção: `dogfood-padaria.ts` usa `getByText` / `innerText`; removida a heurística P0 contra Muse.
- **Teste dos 2 dias**: botão no canto de Saúde (`08-team-health.png`). O harness procurou depois de ir ao Perfil — falso DF-009, retirado.
- **Agente propõe contratar**: cartão "Contratar Cláusulas de rescisão?" em Aprovações (`08-aprovacoes.png`), proposta do Atlas. Falso DF-012, retirado. Não é iniciativa nova do pedido Padaria (fake CLI).
- **Precisa de você** na Visão geral com 2 pendências + Revisar.
- Sem vazamento de id interno (`onb-1` / `hire:`) no texto visível.

## Notas

- Encerrado o host e o Chrome ao final do passeio.
- Sem `PERSONA_REAL_TALK` (0 / 20).
- Caminho real do onboarding continua P0 até Prism alinhar o RPC (DF-002).
