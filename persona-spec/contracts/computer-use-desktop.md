# Computer-use desktop (W3-5)

Rivet: overlay spec, fake UIA, pause hook, MCP bind.
Muse: cursor HTML. Forge: shared-control domain.

- Overlay: `overlayWindowSpec` — `screen-saver`, `focusable: false`, `ignoreMouseEvents.forward`.
- DIP: `physicalToDip(rect, display.scaleFactor)`.
- UIA: `createFakeUiaPort` until Windows COM adapter; password nodes render `digitando ••••`.
- Invoke: `invokeUiaTarget` / bind `invoke(name)` recusa `human` e `password`; ponto = centro do rect (`uiaClickPoint`).
- Clique nomeado: `clickNamedUia` / bind `clickNamed` (MCP). Humano ou senha não clicam.
- COM: `runWindowsUiaScript` + `createComputerUseComHost` (PowerShell injetável). `WINDOWS_UIA_INVOKE_SCRIPT` (`InvokePattern`); `WINDOWS_UIA_SETVALUE_SCRIPT` (`ValuePattern` depois de `IsPassword`). Bind `invokeCom` / `setValueCom`. Humano não lança COM. Main liga o COM host sem abrir overlay no boot.
- Devolver: `overlayMouseIgnore(hovered)` e `isComputerUseResumeAccelerator` (`CommandOrControl+Shift+Space`). Nunca retoma sozinho.
- Snapshot JSON: `parseUiaSnapshot`. Windows: `createWindowsUiaPort` + `WINDOWS_UIA_SNAPSHOT_SCRIPT` (sem Value de senha).
- Overlay HTML placeholder: `computerUseOverlayHtml` / `overlayDocumentUrl` — `pointer-events:none` exceto `.devolver`; rAF; IPC `cu:*`; cap 2; senha = `digitando ••••`. Muse substitui o renderer.
- MCP: `actingPortsFromComputerUse` + desktop `desktopComputerUseActions(bind)`. Human hold: `onInput('human')` → every persona `human`; `gateComputerActing` recusa click/type; screenshot fica.
- Resume só `resume(personaId)`.
- Cursor cap: 2 por monitor (`OVERLAY_CURSOR_CAP`).
