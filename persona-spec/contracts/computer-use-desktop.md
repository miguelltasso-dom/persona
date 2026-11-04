# Computer-use desktop (W3-5)

Rivet: overlay spec, fake UIA, pause hook, MCP bind.
Muse: cursor HTML. Forge: shared-control domain.

- Overlay: `overlayWindowSpec` — `screen-saver`, `focusable: false`, `ignoreMouseEvents.forward`.
- DIP: `physicalToDip(rect, display.scaleFactor)`.
- UIA: `createFakeUiaPort` until Windows COM adapter; password nodes render `digitando ••••`.
- Human hold: `onInput('human')` → every persona `human`; `gateComputerActing` recusa click/type; screenshot fica.
- Resume só `resume(personaId)`.
- Cursor cap: 2 por monitor (`OVERLAY_CURSOR_CAP`).
