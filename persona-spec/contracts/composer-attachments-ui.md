# Composer attachments + avatar upload (UI seam)

**Owner:** Anvil (Remote/store) · **Consumer:** Prism (`ChannelComposer`, `PersonaEditor`)

## Phase 1 (current)

Flags in `composer-host-capabilities.ts` keep **+ / image / attach / emoji / @** and **avatar upload** disabled with `aria-disabled` and copy **“Em breve”** until host methods exist.

## Phase 2 (when Anvil lands + Status notice)

Prism enables flags and wires:

- **Messages:** pick/drag/paste image or file, upload progress, thumbnail chips in composer, remove before send, `postMessage` (or successor) with attachment ids; errors in pt-BR (`fileTooLarge`, `typeNotAllowed`, network).
- **Avatar:** file picker on editor upload path; host upload RPC; gallery/silhouette unchanged.

**Tests (Prism):** fake remote success, error, cancel — no real file I/O in CI.

**Reference:** `persona-spec/contracts/attachments.md` (Anvil). Client probe: `resolve-composer-host-ready.ts` (`attachFile` / `uploadPersonaAvatar` on Remote). Flags stay `false` until Phase 2 UI ships; `postChannelMessage` already forwards `attachmentIds`.
