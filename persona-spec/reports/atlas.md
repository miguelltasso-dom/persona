# Atlas — relatos (mais recente no topo)

## 2026-11-04 00:30 — BRIEFING 20 Gestor de equipe (wire Prism)

**Feito:**
- Host `@Remote`: `listGestorPlans`, `proposeGestorAssemble`, `setPersonaSystemRoles` (`persona-host/src/index.ts`).
- Chat #geral: `GestorPlanMessageCard` no stream quando `gestorPlanId` + `gestorPlansById`; `ConnectedGeneralChannelView` → `approveGestorPlan`.
- `persona-live-store`: `approveGestorPlan` simplificado (refresh + `markPersonasArriving` + timer 4s).
- Faixa da equipe: `usePawCelebration` 1× por leva de `arriving`.
- Locales `gestor.*` (persona-editor) e `gestorPlan.*` (chat) pt/en + regen.
- Testes: `gestor-plan-message.client.spec.ts`; host `gestor.spec.ts` (+2); client gestor/connected-general.

**Comandos:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/gestor.client.spec.tsx packages/persona/client-ui-persona/tests/gestor-plan-message.client.spec.tsx packages/persona/client-ui-persona/tests/connected-general-channel.client.spec.tsx
pnpm exec vitest run packages/persona/persona-host/tests/gestor.spec.ts
```
→ 9 passed (thread-safe) + 5 passed (host gestor).

**Pendente / dependências:**
- Typert regen do remote após novos RPCs (Keel/Forge).
- Mensagem host com marker `[[gestor-plan:id]]` ao `proposeGestorHire`/`proposeGestorAssemble` (orquestração/runner).
- Ajustar/Recusar plano no chat (só Aprovar wired).
- **Muse:** UI pronta para captura (editor GestorSettings, plano no chat, chegada + paw).

---

## 2026-11-04 00:20 — BYC-1 onboarding + RPC pasta vault (BRIEFING 18)

**Feito:** `BringYourContextBlock` no passo 2 (`OnboardingWizard` + store); locales `byc.*` pt/en; colar → `parseBringPaste` (persona-core) + append Cofre seed; `pickVaultFolderPath` → `personaDesktop.pickDirectory` (Rivet); host `previewBringContextPaste` / `previewBringContextVaultFolder` + `bring-context-walk.ts`; mount wire `onOrganizeVaultFolder`; Cofre docs drawer (`kind:document` title+locator) + `RemoteKnowledgePanel` vault RPCs (ingest/list).

**Testes:** `bring-context-ui.client.spec.ts`, `map-used-context.client.spec.ts`, `persona-host/tests/bring-context-walk.spec.ts`.

**Pendente:** BYC-4 revisão Lumen; BYC-1 Importadores; apply/dedup host; Probe E2E; typert regen após RPC BYC.

---

## 2026-11-03 23:45 — WAVE2 Prism: assuntos + Ensinar (wire)

**Feito:** `use-conversation-subjects` (sessionStorage, +/rename/archive/reopen); SubjectBar + filtro em #geral/DM (`Connected*`); composer bolinha + placeholders `composer.placeholderInSubject*`; `TeachPersonaOverlay` no mount + `beginTeachCapture` stub; `teachPersona` no cartão; locales; teste `conversation-subjects.client.spec.ts`.

**Pendente:** Anvil RPC; Rivet captura; Muse SubjectBar/RecordingPill/TeachStepCard; perfil/DM header "Ensinar"; tag `conversationSubjectId` no post.

---
