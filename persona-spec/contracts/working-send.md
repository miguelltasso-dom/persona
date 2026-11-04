# Contrato — fila × direcionar (T3 §4 / §11 / §12)

Dono do domínio: **Forge** (`resolveWorkingSend`, `enqueueWorkingMessage`, `editQueuedMessage`, `dropQueuedMessage`, `openAsideAsk`, `pauseAtLimit`, `resumeAfterLimit`).
Persistência + RPC: **Anvil** (`WorkingSendHost` em `screen_doc`).
Composer: **Prism**.

## Persistência (Anvil)

A fila é por `personaId` + `subjectId`. DM e assunto privado **não sobem** no sync (`isLocalOnlyStream` / `mayUpload`).

| RPC | Efeito |
|---|---|
| `enqueueWorkingMessage({ personaId, subjectId, text })` | Balão tracejado; fora do turno |
| `steerWorkingTurn({ personaId, text })` | Corrige o turno aberto |
| `editQueuedMessage({ id, text })` / `dropQueuedMessage({ id })` | Editar ou Tirar |
| `flushWorkingQueue({ personaId })` | Envia em ordem; esvazia |
| `listWorkingQueue({ personaId, subjectId })` | Replay ao reabrir |
| `openAsideAsk({ personaId, subjectId, question })` | `/lado` — `onThread: false` |
| `pauseAtLimit` / `resumeAfterLimit` | Faixa "No limite"; **fila permanece** |

Idle (`working: false`) ⇒ `resolveWorkingSend` devolve `steer` (manda agora). Ctrl+Enter inverte o modo preferido.

## Aceite

- Texto vazio recusa (`INVALID_PERSONA` / `QUEUE`).
- `/lado` nunca vira mensagem do fio.
- Queda/reopen: `listWorkingQueue` devolve o que estava tracejado.
