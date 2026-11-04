# Dogfood #2 — Agência Ponto

04/11 · Forge · host perfil `persona` em **dev** (não instalador). Home: `C:/Users/migue/dev/persona/.maestri/tmp/e2e-917c927f-0961-47c3-83c7-933595168640`. Execuções reais de CLI: **0 / 20**.

## Escopo (Atlas)
Gestor montando equipe (cartão de plano), quadros com sprint, Ensinar, Segundo cérebro com permissão lembrada + revogar, BYC colado, assuntos na DM, Quem cuida de quem.

## App real — passos
- ok: boot shell
- ok: Gestor cartão de plano
- ok: #geral pedido assemble
- ok: Segundo cérebro (vazio honesto)
- ok: BYC colado em Importar
- ok: assuntos na DM
- ok: Quem cuida de quem

## Bugs / donos (4)

### AG-001 — Sprint ausente nos Quadros

- Severidade: **P2**
- Dono: **Lumen**
- Passos: Quadros após pedido de equipe
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-agencia/20-sprint-ausente.png`
- Esperado: Planejar/Iniciar sprint
- Obtido: botão ausente

### AG-002 — Navegação falhou: perfil

- Severidade: **P1**
- Dono: **Lumen**
- Passos: Rail → Perfil
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-agencia/nav-perfil-fail.png`
- Esperado: painel visível
- Obtido: TimeoutError: locator.waitFor: Timeout 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /Conversar com Atlas/ }).first() to be visible


### AG-003 — Ensinar ausente no perfil

- Severidade: **P1** → **resolvido 04/11 (Prism)**
- Dono: **Prism**
- Passos: Perfil Atlas → Ensinar; DM → ⋯ Ensinar
- Esperado: botão Ensinar (hero + DM)
- Obtido: `PersonaProfilePage` + `dogfood-ag-003` verde; cabeçalho DM com menu Ensinar

### AG-004 — Nenhuma permissão lembrada para revogar (esperado com fake CLI / seed vazio)

- Severidade: **P2**
- Dono: **Anvil**
- Passos: Segundo cérebro → Permissões
- Captura: `C:/Users/migue/dev/persona/.maestri/tmp/shots/dogfood-agencia/40-sem-grant.png`
- Esperado: grant + Revogar após Aprovações "Lembrar"
- Obtido: lista vazia — precisa de um grant no host

## Notas

- Host e Chrome encerrados no `finally` (dispose).
- Sem `PERSONA_REAL_TALK`: fake CLI no PATH. Um host por vez sob `with-lock`.
- Engine walk (0 execs) continua em `packages/persona/persona-engine/tests/dogfood-agencia.spec.ts`.
- **Rivet pack ok** `hash=BsxPADcs` (04/11). Probe: retestar o exe instalado (`#root` + dogfood UI). Dist de trabalho ainda aponta `index-ZjNmkjRJ.js`; o hash do pack é o do asar/NSIS limpo.
