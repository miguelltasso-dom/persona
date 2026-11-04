# Contrato — captura Ensinar (WAVE2 §2 / W2-9 / W2-10)

Dono desktop: **Rivet**. Dono do rascunho: **Forge**. Persistência: **Anvil**. UI: Prism/Lumen.

## Formato combinado

Rivet captura `{ atMs, png }`. No `stop`, projeta e entrega:

```
{ atMs: number, imageRef: string, changeScore: number }
```

`imageRef` é `file://` local em `{PERSONA_HOME}/teach/teach-frame-NNN.png`. Host `teachDraftFrom` consome essa lista. `draftTaughtSkill` nunca liga `enabled`.

## IPC (`personaDesktop.teach`)

`listSources` · `start(sourceId, mic)` · `pause` · `resume` · `ingestFrame(pngBase64)` · `stop(typed?)` → `{ artifactPath, frames, transcript }`.

Transcrição: texto digitado. whisper.cpp é NO-GO nesta máquina.

Consentimento `teach-v1` fica na UI. Retenção 30 dias (`teach-*` só).
