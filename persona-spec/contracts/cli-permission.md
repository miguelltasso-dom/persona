# Contrato — permissão CLI (Anvil → Rivet)

Dono Anvil (`persona-host` `resolveFor`). Rivet mapeia `spec.tools` → flags de cada CLI (D10 lease).

## Política (D-013)

CLI **nunca** roda `prompt`. Aprovação interativa não existe (OAR não responde). Config `permissionMode: prompt` em spec CLI é **inválida** e falha cedo:

`CLI não aceita modo prompt — a aprovação interativa não existe. Use deny (resposta) ou allow-once (tarefa no worktree).`

| Purpose | Ferramentas | Modo |
|---|---|---|
| `talk` (resposta / Coordenação, sem tools) | ignoradas (`toolLevel: none`) | `deny` |
| `task` (Tarefa no worktree) | `files: write` ou `shell: safe\|write` | `allow-once` |
| `task` | só `read` / vazio | `deny` |

O gate humano da Tarefa é **Revisar** (diff + Aceitar), não o prompt da CLI.

## O que o host envia

```
resolveRunner({
  spec, permissionMode, autonomy, personId,
  toolLevel,   // talk = none; task = effectiveToolLevel(tools)
  tools,       // persona.spec.tools
  home,        // omitido = ~/.claude nativo
})
```

`purpose: 'talk' | 'task'` fica no host (`HostRunnerRequest`). Rivet escolhe modelo barato/rápido para `talk` (triagem + resposta simples) e o modelo da persona para `task`.

## Lease (Rivet D10)

Host reutiliza runner por `projectId + personaId + purpose`. Rivet entrega o lease; Anvil guarda `warmRunners`.

## Medir

- `first-token` (alvo < 5 s)
- `resolve:talk:start` → `resolve:talk:ready` / `warm`
- hang se `permissionMode === 'prompt'` (regressão: 0)
- 1ª resposta útil < 60 s (alvo < 30 s)
