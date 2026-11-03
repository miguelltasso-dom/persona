# Relatos — Keel (Tech Lead)

Mais recente no topo.

---

## 03/11 B9 (composição + boot) — perfil `persona` sobe e troca o shell

**Pronto**
- `PROFILE_TEMPLATES.persona = [dsh-base, dsh-web-app, dsh-persona-app]` e `HIDDEN_BUNDLES` (`packages/util/official-bundles`), dependência `@deepseek-ai/dsh-persona-app` em `apps/cli/package.json`.
- `packages/persona/persona-app/cordis.patch.yml`: 52 linhas desativadas (UI do Harness da lista do spike A7 + `desktop-product-telemetry`, `product-analytics`, `session-telemetry-otel`, `session-log-deepseek`, `plugin-package-inventory-deepseek`) e inserção de `persona-host` + `ui-persona`.
- `scripts/persona/with-lock.mjs`: nova opção `--release-on <regex>` (app não segura a trava depois de pronto); lock órfão é roubado.

**Verificação**
- `node --import tsx/esm apps/cli/src/bin.ts --profile persona --dump-config`: 1334 linhas, 14 grupos "patched by @deepseek-ai/dsh-persona-app", `ui-layout` com `disabled: true`, `persona-host` e `ui-persona` ao final.
- Boot real (`.maestri/tmp/keel-boot-persona.mjs`, home temporário, sob a trava): host em `127.0.0.1:3080`, token → 303 + cookie, `/` → 200. Manifesto `__DSH_BOOT__`: 29 entradas; `@deepseek-ai/dsh-client-ui-persona: true`; `client-ui-layout/sidebar/workspace/chat/conversation/brand-official/settings-account: false`; `client-ui-theme/renderer/session/tool`, `client-connection`, `api-remotes: true`. Sem erro no stdout/stderr.
- Título da página ainda "DSH Local Build" (build `local`): troca é do Rivet (A3b, `DSH_CLIENT_TITLE`).

**Pendente**
- Push de `7caef40`: o pre-push roda o typecheck completo e a árvore está em movimento (erros transitórios de arquivos em andamento: `persona-engine/src/core/{engine,tickets}.ts` imports não usados (Forge, P0) e `persona-e2e/src/visual-diff/png-compare.ts` (`compare` indefinido, Probe)). Reexecutar quando a árvore ficar verde.
