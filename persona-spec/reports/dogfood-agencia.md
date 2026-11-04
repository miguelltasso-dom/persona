# Dogfood #2 — Agência Ponto

04/11 · Forge · relógio falso. Execuções reais de CLI: **0 / 20**. App instalado **não percorrido** (D8 `#root` vazio, CSP).

## Escopo pedido (Atlas)
Gestor montando equipe (cartão de plano), quadros por projeto com sprint, Ensinar, Segundo cérebro com permissão lembrada (repetir sem pergunta + revogar), BYC colado, assuntos coloridos na DM, Quem cuida de quem.

## Engine (este turno) — PASS

Suíte `packages/persona/persona-engine/tests/dogfood-agencia.spec.ts` (1/1):

| Passo | Resultado |
|---|---|
| Gestor `assemble` sem aceite | cartão `[[gestor-plan:plan-agencia]]` + activity `waiting` |
| Gestor após aceite | Sprint 1 + personas da recomendação |
| Quadro `site` | colunas `todo` + `done` |
| Ensinar | rascunho local, `enabled: false` |
| Permissão `publish`/`cms:blog` | 2ª chamada `skip`; após revogar, `ask` |
| BYC colado (Claude) | propostas a partir de `## Decisões já tomadas` |
| Assuntos na DM | 7 cores, nome+cor sempre |
| Quem cuida | orgChart pessoa: Nina sob Miguel |
| F1 | fixtures oficiais: chatgpt/claude/gemini/notion/markdown/grok (Atlas: exportação real opcional) |

```
pnpm exec vitest run packages/persona/persona-engine/tests/dogfood-agencia.spec.ts
  Test Files  1 passed (1)  Tests  1 passed (1)
```

## App real — BLOQUEADO (D8)

Probe 05:48: Setup `1d4e5e95b8` → `#root` vazio. `pageerror`: CSP `script-src` bloqueia `unsafe-eval`.

Causa no bundle empacotado `apps/web/dist/assets/index-B2q7cWGa.js`:

```
const o7=new Function("ctx","expr",` with (ctx) { return eval(expr) } `)
```

É `vendor/loader/src/config/utils.ts` (`evaluate`) no init do chunk. O client importa `Loader` em `boot-client.ts`. **V28**: `evaluate` preguiçoso (só no primeiro `!!js`). **Não** acrescentar `'unsafe-eval'` em `secure-shell.ts`.

**[Forge→Rivet]** dist novo: `apps/web/dist/assets/index-ZjNmkjRJ.js` (scan CSP ok). Empacote este hash. Probe retesta o exe.

## Bugs / donos (UI ainda sem captura)

| ID | Item | Dono | Nota |
|---|---|---|---|
| AG-001 | `#root` vazio no Setup (CSP eval no loader) | Rivet (pack) + Forge (V28) | correção no source; falta rebuild |
| AG-002 | Dogfood visual (cartão, quadro, Ensinar, Cérebro, BYC, assuntos, organograma) | Probe + Prism/Lumen | depois do exe novo |

Padaria (DF-001..010) continua válida para onboarding/UI; não reaberta aqui.
