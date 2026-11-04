# Probe → Gauge — repasse dos itens de QA (Atlas, 04/11)

Itens que passam ao **Gauge**: BYC-6, GES-6, SB-7, PB-9, GOV-10, W2-11, E10, B8, F5, C9.
Itens que **ficam com o Probe**: V1-P0-5/6, D8, S7, SW-9/SW-10, D9/D10, PRO-6, F3, F6, G3.
Evidência sempre: comando, contagem pass/fail, capturas/`proof.json`. Relato em `persona-spec/reports/gauge.md` + 1 linha no post-it Status (`maestri note edit`, nunca `note write`).

## Como rodar (vale para tudo abaixo)

- Pacote: `packages/persona/persona-e2e`. Um arquivo de spec por vez, **sem watch**, sempre com timeout. Ao terminar: `node scripts/persona/reap-orphans.mjs`.
- Camada 1 (contratos, rápida, sem navegador): `pnpm exec vitest run packages/persona/persona-e2e/tests/<nome>-contract.spec.ts --testTimeout 120000` (cada `*-contract.spec.ts` dispara os specs de engine/host/cliente do dono por subprocesso).
- Camada 2 (app real, `persona` profile + Chrome): exige `PERSONA_E2E=1` e a **trava de build** (D-062, agora FIFO):
  `node scripts/persona/with-lock.mjs "Gauge <rótulo>" --wait-max 3000000 -- pnpm exec vitest run packages/persona/persona-e2e/tests/<arquivo>.spec.ts --testTimeout 600000 --hookTimeout 400000 --teardownTimeout 120000`
  (com o `with-lock` por fora, o `startWebHost` sobe direto, sem trava aninhada). Um host por vez; ~90 s de boot por arquivo.
- Typecheck do pacote: `node scripts/persona/check-pkg.mjs persona-e2e` (~7–25 s).
- Galerias (capturas claro/escuro): `real-gallery-*.spec.ts` com `PERSONA_E2E=1`; saída em `packages/persona/persona-e2e/artifacts/` (gitignored).
- Atenção ao shell: **não** passe texto com crases dentro de aspas duplas no bash (vira substituição de comando). Relatos e mensagens longas: arquivo + `Write`.

## Ferramentas novas deste turno (use à vontade)

- `withFakeCliOnPath({ turnMs?, fail?, reply? })` (`src/fake-cli.ts`): stubs `claude`/`codex`/`opencode`/`cursor-agent` no PATH **e pin de `OAR_*_BIN`** (um run fake nunca alcança IA real). O stub responde um turno inteiro, com tokens medidos; `scope.invocations()` lê o log `FAKE_CLI_LOG` (prova de que o app chamou o motor).
- `withNoEngineOnPath()`: nenhum motor visível (caminho "Falta uma IA").
- `openRealPersonaApp({ engine: { kind: 'fake', turnMs?, reply?, fail? } | { kind: 'none' }, liveRunner?, keepOnboarding?, devSeed?, dismissOnboardingViaStorage?, viewport? })` (`src/real-app-session.ts`). `liveRunner: true` sobe o host como o desktop (`PERSONA_REAL_CLI=1`, `VITEST` limpo) para os stubs responderem; sem isso a resposta é a scriptada do Vitest.
- `src/first-delivery-flow.ts`: `walkOnboardingToStep5`, `runHappyFirstDelivery`, `runNoEngineFirstDelivery`, `createFirstDeliveryRecorder` (marcas + capturas + `proof.json` em `artifacts/first-delivery/<cenário>/`).

## Estado por item (o que está pela metade)

| Item | Onde | Estado | Próximo passo |
|------|------|--------|----------------|
| **BYC-6** | `tests/mandatory-bring-your-context.spec.ts` (≈14 `it.todo`), `…-contract.spec.ts`, `real-gallery-byc-import.spec.ts`, `fixtures/bring-your-context/` | contrato (camada 1) verde; galeria Importadores capturada; os cenários de UI estão `it.todo` | promover os 3 cenários de `persona-spec/BRING-YOUR-CONTEXT.md` §Aceite para camada 2 (colar resposta → revisão → gravar no Cofre; pasta do vault; recusa sem revisão) |
| **GES-6** | `tests/mandatory-team-manager.spec.ts` (12 `it` + 5 `it.todo`), `…-contract.spec.ts`, `fixtures/team-manager/` | arquivo tem **edição minha não comitada** (+99 linhas: adversariais GES-2b..f já viram `it`); contrato verde | fechar os 3 bullets de `MAESTRO.md` §Aceite na UI (modal Gestor, Ajustar, cartão do gestor — Prism GES-4/5 já publicaram) |
| **SB-7** | `tests/mandatory-second-brain.spec.ts` (≈19 `it.todo`), `…-contract.spec.ts`, `real-gallery-second-brain.spec.ts`, `fixtures/second-brain/` | contrato verde; galeria capturada; UI `it.todo` | `SECOND-BRAIN.md` §6 + adversariais de permissão SB-3b..f na camada 2 |
| **PB-9** | `tests/mandatory-project-boards.spec.ts` (6 `it` + 1 `it.todo`), `…-contract.spec.ts`, `real-gallery-project-boards.spec.ts` | J12–J19 verdes no contrato (7/7 junto com GOV); galeria ok | 5 cenários de `PROJECT-BOARDS.md` §3 na UI (isolamento, concluir→`done`, Attention→`needs_you`, editar fluxo, sprint) + axe/loading preso |
| **GOV-10** | `tests/mandatory-governance.spec.ts` (8 `it` + 1 `it.todo`), `…-contract.spec.ts`, `real-gallery-governance|org-chart-scale|two-day-health.spec.ts`, `fixtures/org-chart/` | galerias GOV + org-chart 9/9; J1–J10 no contrato | 5 cenários de `GOVERNANCE.md` §4 na UI (relógio falso no Teste dos 2 dias; pessoa "fora"; 3 tipos de empresa) |
| **W2-11** | `tests/mandatory-wave2.spec.ts` (≈11 `it.todo`), `…-contract.spec.ts`, `real-gallery-wave2-subjects.spec.ts` | smoke SubjectBar PASS; contas/Ensinar dependem das UIs (Prism: Ensinar no perfil/DM/cartão já entrou — AG-003 verde) | assuntos, contas, Ensinar na camada 2 |
| **B8** | `mandatory-b9-real-app.spec.ts` (6 `it` + 4 `it.todo`), `mandatory-scope.spec.ts` (2 `it` + 4 `it.todo`), `mandatory-token-scenarios*.spec.ts`, `robustness-host.spec.ts` (3 `it.todo`), `app-bench.spec.ts` (2 `it.todo`) | B9 Tier 1 **6/6 PASS** (87 s); `mandatory-proactivity.spec.ts` (8 `it.todo`) é **PRO-6 = Probe**, não B8 | promover os `it.todo` de B9 (#geral→resposta do runner **agora é possível com `liveRunner` + fake**, kanban após mensagem, criar/editar persona) e os 4 de scope |
| **F5** | `real-surface-a11y.spec.ts` (2 `it.todo`), `src/axe-check.ts`, `src/real-gallery/keyboard.ts` | axe 0 em todas as telas capturadas; faltam editor-persona e onboarding Esc | os 2 `it.todo` |
| **C9** | `real-gallery-*.spec.ts`, `src/visual-diff/`, `scripts/persona/capture-real-gallery*.mjs`, `scripts/persona/compare-shot-dirD.mjs` | galeria real de todas as telas; diff vs `persona-assets/references/dirD-tela.png` em refinamento (limiar) | fechar o diff claro/escuro em home limpo |
| **E10** | os `it.todo` acima + `measureV1Close` (engine) | depende de B8/S7/PRO-6 | rodar a suíte completa quando B8 fechar |

## Avisos

- Nada do que está aí foi comitado por mim; o Keel publica. `git status` mostra os arquivos modificados.
- A execução **real** de IA tem orçamento total de 3 execuções no projeto e só com o OK do Keel. Tudo acima usa o fake (sem gasto).
- O `with-lock` é FIFO: entre na fila e espere; não dispute em laço.
