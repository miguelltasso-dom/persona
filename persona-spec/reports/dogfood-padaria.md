# Dogfood — Padaria Lua

Home limpo: `C:/Users/migue/dev/persona/.maestri/tmp/e2e-fe85b6aa-895c-491a-a7c4-317fc0be60c4`. Perfil `persona`. Runners scriptados. Execuções reais: 0 / 20.

## Cenário percorrido
- ok: boot shell
- ok: reabriu seed (PERSONA_DEV_SEED) para o resto do cenário
- ok: quadros
- ok: #geral pedido
- ok: visao-geral
- ok: aprovacoes
- ok: team-health
- ok: perfil

## Atritos (10)

### DF-001 — Onboarding não apareceu em home limpo

- Severidade: **P0**
- Dono: **Prism**
- Passos: Abrir perfil persona com PERSONA_HOME novo
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/00-boot.png`
- Esperado: Passo 1 visível
- Obtido: sem heading do passo 1

### DF-002 — Caminho real preso no overlay — live.completeOnboarding manda roster/projectId; host CompleteOnboardingRequest exige team/personalProjectId/templateIds/cofreSeed (seed-default-team.ts já manda o contrato certo)

- Severidade: **P0**
- Dono: **Prism**
- Passos: Entrar no Persona → getOnboarding.firstUse continua true → remount
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/04-overlay-stuck.png`
- Esperado: firstUse false e rail clicável
- Obtido: scrim do passo 5 ainda no ar; Quadros/DM não são o overlay

### DF-003 — Modelo Site / produto ausente

- Severidade: **P1**
- Dono: **Lumen**
- Passos: Novo projeto → Site / produto
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/proj-Site novo-modelo.png`
- Esperado: card Site / produto
- Obtido: não listado

### DF-004 — Modelo Contratação ausente

- Severidade: **P1**
- Dono: **Lumen**
- Passos: Novo projeto → Contratação
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/proj-Contratar confeiteiro-modelo.png`
- Esperado: card Contratação
- Obtido: não listado

### DF-005 — Sprint 1 não dá para iniciar no Site novo

- Severidade: **P2**
- Dono: **Lumen**
- Passos: Abrir projeto Site → Sprints
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/sprint-ausente.png`
- Esperado: Planejar/Iniciar sprint
- Obtido: botão ausente

### DF-006 — DM sem composer ou sem persona para falar

- Severidade: **P1**
- Dono: **Prism**
- Passos: Abrir Mensagens diretas após contratar equipe
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/07-dms-vazio.png`
- Esperado: composer de DM
- Obtido: Persona

Buscar em tudo…
Ctrl K
Visão geral
Canais
Mensagens diretas
SUA EQUIPE
5
ORGANIZAÇÃO
TRABALHO
Projetos
Quadros
Rotinas
Aprovações
EMPRESA
MAIS
Conectado
Configurações
Nenhuma conversa ainda

Chame alguém da equipe no particular — c

### DF-007 — Botão Teste dos 2 dias ausente ou não habilitado

- Severidade: **P2**
- Dono: **Lumen**
- Passos: Saúde da equipe após onboarding
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/09-dois-dias-ausente.png`
- Esperado: botão Teste dos 2 dias
- Obtido: não encontrado

### DF-008 — Não achei controle para marcar-se fora

- Severidade: **P1**
- Dono: **Lumen**
- Passos: Perfil / Quem cuida / cartão da persona
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/10-fora-ausente.png`
- Esperado: ação Fora/Ausente
- Obtido: controle ausente

### DF-009 — Painel Enquanto você estava fora não apareceu

- Severidade: **P2**
- Dono: **Prism**
- Passos: Marcar fora → Visão geral
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/11-away-panel.png`
- Esperado: heading do painel
- Obtido: ausente (pode ser vazio honesto)

### DF-010 — Nenhum cartão "Contratar X?" após o passeio

- Severidade: **P2**
- Dono: **Anvil**
- Passos: Onboarding + #geral + Aprovações (fake CLI)
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-padaria/12-hire-ausente.png`
- Esperado: proposta de contratação de outro agente
- Obtido: cartão ausente (fake CLI pode não disparar iniciativa)

## Notas

- Encerrado o host e o Chrome ao final do passeio.
- Sem `PERSONA_REAL_TALK` neste dogfood (scripted).
- Se o overlay não fechou no caminho real, o resto do cenário rodou com `PERSONA_DEV_SEED` (contrato certo de completeOnboarding).
