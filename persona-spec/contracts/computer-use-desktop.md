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

## Ciclo de vida do overlay e do atalho global (BUG-QUIT-1, 05/11 — regra, não detalhe)

- **O overlay e o atalho global `CommandOrControl+Shift+Space` NÃO existem em idle.** `installComputerUseBind` só abre as janelas (uma por monitor, lido na hora) e registra o atalho no **primeiro `control.begin(personaId)`**; `release()` (chamado no `finishQuit` do desktop) e `close()` devolvem as duas coisas. Dizia "sem overlay no boot" aqui e o `main` abria no boot: era a causa do bug abaixo.
- **Por quê (medido no exe, 05/11):** com a janela de overlay viva (transparente, tela cheia, `alwaysOnTop`, página com rAF eterno) o "Sair" não terminava — raiz + GPU + network + 1 renderer ficavam vivos com 0% de CPU (reabrir o app entregava ao processo fantasma: "nada aparece"). Sem ela os processos somem em ~2,5 s. Destruir/fechar a janela antes do quit NÃO cura; `setIgnoreMouseEvents` sem `forward` e o nível `screen-saver` foram exonerados no bisect do Bolt. Por isso, quando o overlay ESTÁ aberto (persona usando o computador), o quit passa por `app.exit(0)` + `quit-watchdog` (`apps/desktop/src/quit-watchdog.ts`), não por `app.quit()` sozinho.
- **O atalho global tira o acorde de TODOS os outros apps enquanto estiver registrado** (dicas de parâmetro do VS Code, alguns IMEs): só com o overlay aberto, nunca em idle. O overlay em si nunca interceptou mouse/foco (medido: `WS_EX_TRANSPARENT|NOACTIVATE|LAYERED|TOPMOST`, `focusable:false`; o pixel sob ele é do app de baixo).
- Quem ligar o driver real do computer-use: chame `bind.control.begin` ao começar a usar a tela e `bind.release()` ao terminar o último uso (hoje só o quit chama `release`); não crie janela de overlay em outro lugar. Medidor e aceite: `scripts/persona/bug-quit/` (`validate-exe.mjs`).
