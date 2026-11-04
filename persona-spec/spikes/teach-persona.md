# Spike — Ensinar a persona (WAVE2 §2 / W2-9) — 03/11/2026 Rivet

## Pergunta
Dá para gravar tela/janela no Electron, guardar só local, amostrar quadros por mudança e transcrever a narração sem sair da máquina?

## Como medi
Módulo `apps/desktop/src/teach-capture.ts` + teste `apps/desktop/tests/teach-capture.spec.ts` (sem abrir o app; um pesado por vez — D8 pack em curso).

| Peça | Resultado |
|---|---|
| `desktopCapturer` (main) | **GO.** `getSources({ types:['screen','window'] })` já é o caminho do Harness. Spike lista `TeachSource`. |
| `MediaRecorder` (renderer) | **GO.** `getUserMedia({ audio, video: { mandatory: { chromeMediaSource:'desktop', chromeMediaSourceId }}})`. Main só lista fontes e grava o blob. Não liguei IPC no `main.ts` neste spike (W2-10). |
| Pausar / parar / microfone | **GO.** Máquina de estados `idle→recording↔paused→stopped`; `mic: boolean`. |
| Arquivo local + retenção | **GO.** `{PERSONA_HOME}/teach/teach-{t}.webm`. `applyTeachRetention` apaga só `teach-*` velhos. Nada sobe. |
| Quadros-chave por mudança | **GO.** SHA-256 do PNG; guarda se ≥4% dos bytes do hash diferem. Teste: 3 frames (a, a ignorado, b, pause ignora, c). |
| whisper.cpp | **NO-GO nesta máquina.** Sem `whisper-cli` no PATH e sem `PERSONA_WHISPER_CPP`. Fallback: texto digitado (`teachTranscript`). Viável se Miguel instalar o binário depois. |
| Motor de visão → skill | **Forge `draftTaughtSkill` / host `teachDraftFrom`.** Rivet entrega `{ artifactPath, frames: {atMs,imageRef,changeScore}[], transcript }`. Draft nunca ativa skill. |
| IPC main | **GO (W2-10).** `installTeachCapture` + `personaDesktop.teach`. Transcrição = texto digitado (whisper NO-GO). |
| Overlay teach | **GO (W2-10).** `teachOverlayHtml(clock)` — relógio, Pausar/Parar, borrões, aviso de senha. Sem PNG/`imageRef`. |
| Borrar região | **GO (W2-10).** `addBlur` + IPC `teachBlur` + `personaDesktop.teach.blur`. Clock `blurCount`. |

## Tempos / tamanho (sintético)
- Amostragem + retenção: <10 ms no teste.
- `measureTeachSpike({ frames: 3, bytes: 1024, startedAt: 1000, stoppedAt: 1008 })` → `8 ms`, whisper **no-go**.
- WebM real: não gravado (pack D8 segura a trava). Esperado 1–3 MB/min 720p + mic.

## Decisão
**GO para captura local + quadros + texto digitado.** Seguir para W2-10 (IPC + consentimento + artefato Anvil). Transcrição local só com whisper.cpp opt-in. Nada ativa skill sozinho.
