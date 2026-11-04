# Teach persona (WAVE2 §2) — Remote contract

Screen recording + narration → **candidate skill** draft; never auto-activates tools or publishes without user review.

## Methods

| Method | Purpose |
|--------|---------|
| `startTeachSession({ workspaceId, projectId, personaId, consentVersion })` | Returns `{ sessionId, retentionDays, storageHintPt }`. Requires desktop host for capture; web returns `unsupported`. |
| `pauseTeachSession({ sessionId })` / `resumeTeachSession({ sessionId })` | |
| `stopTeachSession({ sessionId, includeMicrophone: boolean })` | Starts local processing; returns `{ sessionId, status: 'processing' }`. |
| `getTeachSession({ sessionId })` | `{ status, elapsedMs, frameCount?, error? }` |
| `getTeachDraft({ sessionId })` | `{ steps: TeachStepView[], skillTitle, candidateSkillId? }` when ready |
| `submitTeachDraft({ sessionId, steps, activate: false })` | Saves candidate skill; `activate` only after explicit user confirm in UI |

## `TeachStepView`

```ts
{ order: number, instruction: string, thumbnailAssetId?: string, verifyHint?: string }
```

## Domain (Forge / persona-engine)

`draftTaughtSkill(frames, transcript, vision)` + `fakeVisionPort` + `sampleKeyFrames`. Skill sai `origin: 'taught'`, `enabled: false`, `scope: 'persona'`. Ferramentas só da allow-list do caller. Artefato local (`local: true`).

W2-10: `acceptTaughtCandidate` grava a candidata **sempre** `enabled: false`. `activateTaughtSkill` só no aceite explícito e recusa ferramentas acima do mandato. `publishTaughtSkill` para team/project exige `explicit`. DM/privado não publica sozinho.

Consentimento: `TEACH_CONSENT_VERSION = teach-v1` (`assertTeachConsent`). Retenção: `TEACH_RETENTION_DAYS = 30` + `teachRetentionExpiresAt`. Narração: `redactTeachNarration` (senha/token). Quadros: `omitBlurredTeachFrames`. Host Anvil ainda tem as constantes locais — pode importar do engine.

## Privacy

- Artifact stays on device until user exports/shares.
- `consentVersion` must match UI copy id shown in overlay.

## Client until host ships

UI runs consent + mock recording timer; `getTeachDraft` optional — overlay shows placeholder steps and records intent in report only.
