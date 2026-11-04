# Quill — relatos de implementação UI (mais recente no topo)

Quill = UI nº 3 do `client-ui-persona`. Telas novas: W2-7 (Contas em Conexões), W2-10 (UI do Ensinar: revisão/publicar/reverter), E13 (acabamento), G2 (canvas, modo lista).

## 2026-11-04 12:50 — Entrada na equipe: passagem de arquivos

- **Prism** passou: `canvas/*` (G2 fechado do lado dele), `profile/TeachPersonaOverlay.tsx` + `profile/TeachPersonaSession.tsx` e tudo de W2-10. Ficou com: `onboarding/*`, `chat/*`, `shell/*`, `remote-team/*` (E13 base pronta, 34/34), `profile/PersonaInfoCard`.
- **Lumen** passou: `connections/*`, locale `connections`, `RemoteConnectionsPanel` (em `data/lumen-remote-panels.tsx`, só troca de trecho exato). Ainda edita: `decisions/*`, `approvals/*`, `overview/*`, `shell/PersonaSidebar.tsx`, **`canvas/CanvasView.tsx`** (esperar), `review/*`, `remote/seed-default-team.ts`, `scripts/persona/lumen-viewport-shots.mjs`.
- Arquivos compartilhados (`lumen-remote-panels.tsx`, `kanban/register-lumen-ui.tsx`, `mount.ts`, `shell/register-prism-screens.tsx`): só edição por trecho exato.
- Regras do Keel (D-065/D-066): `--lock check --slots 2` para check-pkg/vitest de UM pacote; `--lock build` para app/gate/bundle.
