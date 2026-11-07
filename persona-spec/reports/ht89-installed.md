# ht89 no INSTALADO (aceite do ISO-7 / HT-8-9) — comando e critério de PASS

Tally, 07/11/2026. Zero modelo, sem login, nada gasto. O que se prova: **o gate de permissão que está DENTRO do build instalado faz o `claude` de verdade da máquina obedecer** (7 cenários). `scripts/ht89-dry.ts` prova o mesmo com o gate do código-fonte; esta variante usa o `PermissionGate` empacotado, dentro do node do próprio exe (como o `packaged-runners-probe.mjs` do ENG-1).

## O comando (a partir da raiz do repo, depois que o `win-unpacked` do ensaio do pack existir)

```bash
WU="<pasta do win-unpacked>"     # ex.: C:/p8i (o H2 #4, que NÃO tem o gate) ou o do pack do H3
ELECTRON_RUN_AS_NODE=1 node scripts/persona/with-lock.mjs "Rivet ht89 instalado" --lock check --wait-max 900000 -- \
  "$WU/Persona.exe" .maestri/tmp/tally/ht89-installed/packaged-gate-probe.mjs \
  "$WU/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-persona-runners/lib/index.js" \
  --out persona-spec/reports/ht89-installed.json
```

- A CLI testada é a `claude` da máquina (`--claude <caminho>` ou `CLAUDE_BIN` escolhem outra; sem nada, a do PATH). Aqui: 2.1.319 (`C:\Users\migue\.local\bin\claude.EXE`).
- Dura de 1 a 3 minutos (7 turnos da CLI real contra um endpoint Anthropic FALSO em 127.0.0.1, teto de 40 s por cenário), trava `check` (1 de 3 vagas).
- O probe fica em `.maestri/tmp/tally/ht89-installed/packaged-gate-probe.mjs` (fora de `packages/`). Se o Rivet o quiser no tree (por exemplo ao lado do `packaged-runners-probe.mjs`, atrás de uma flag no `verify-persona-package.mjs`), é só copiar: é um `.mjs` autônomo, sem importador.

## Critério de PASS (tudo junto)

1. **Código de saída 0** e UMA linha `GATE-PROBE {"ok":true,...}` na saída.
2. `scenarios` com **7 itens, todos `ok:true`**: (1) nada aprovado: nega e **pede** (`requests: 1`); (2) aprovado ESTE hash: executa; (3) aprovado OUTRO hash: nega (`requests: 1`); (4) classe `send` pré-liberada: executa; (5) só `read` pré-liberada: nega o envio; (6) gate FORA DO AR (sem regra allow): continua negado; (7) gate desarmado (fora de turno): nega.
3. `claudeVersion` preenchida (≠ `unknown`): o resultado vale PARA ESSA versão da CLI; guardar o `--out` em `persona-spec/reports/` junto com o commit/hash do pack.

## Se falhar

- **Saída 1** (`ok:false`): algum cenário não se comportou como o gate promete. A regra do contrato (`contracts/permission-gate.md`) vale: o runner **não libera escrita** daquela versão da CLI (só leitura) e a tela diz. Bloqueia o aceite do ISO-7 até a causa ser entendida (CLI nova mudou o gancho? build sem o gate certo?).
- **Saída 2**: o build **não tem** `PermissionGate`/`argsHash` (anterior ao HT-8/9; é o caso do H2 #4 em `C:/p8i`) ou o caminho da lib está errado (`stage` diz qual).

## Ensaio de hoje (sem o pack final)

| ensaio | resultado |
|---|---|
| `C:/p8i` (H2 #4) com o node do próprio exe | `GATE-PROBE {"ok":false,"stage":"PermissionGate","error":"… this build predates HT-8/9 …"}`, **saída 2**, como deve ser (o H2 #4 não tem o gate) |
| o stub MCP do probe lançado como `Persona.exe fake-mcp.cjs` com `ELECTRON_RUN_AS_NODE=1` | responde `initialize` e `tools/call` e grava a chamada (`mcp-under-exe.mjs`: ok) |
| a lógica dos 7 cenários com o gate do código-fonte (shim) e o `claude` 2.1.319 real | **PASS 7/7, saída 0** (`.maestri/tmp/tally/ht89-installed/positive.json`) |

O que ainda só o pack final mostra: o `PermissionGate` empacotado (o `lib/index.js` do `repo` é velho: de 04/11 11:48, sem o gate; o pack reconstrói) rodando sob o node do `Persona.exe`.
