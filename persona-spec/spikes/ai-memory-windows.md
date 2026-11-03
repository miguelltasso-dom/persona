# Spike — ai-memory no Windows nativo (AI-MEMORY-DECISION.md §4)

Data: 2026-11-03. Rivet. HOME temporário; config real do Miguel não foi tocada.

## O que foi feito

- Baixado `ai-memory-windows-x86_64.zip` v3.3.2 para `.maestri/tmp/ai-memory-spike/` (não é código de produto).
- SHA-256: `7C35827430E7D1753FA420B256A059AD7104C469C263D6B0A1080BD04064CBB0` (bate com o release).
- `AI_MEMORY_HOME` / `--data-dir` = `.maestri/tmp/ai-memory-spike/data`.
- `CLAUDE_CONFIG_DIR` / `CODEX_HOME` apontados para pastas temporárias no mesmo spike.
- Sem `--apply` em configs reais. Sem prompt em CLI real (cota; BUILDER-RULES).

## Resultados

| Passo | Resultado |
|---|---|
| Binário nativo `ai-memory.exe --version` | **GO** — `ai-memory 3.3.2` |
| `serve --transport http` | **GO** — processo ficou no ar; migrations V1–V17; SQLite em `data/db/memory.sqlite`; lock em `data/.serve.lock` |
| HTTP `GET /` | 404 (esperado: endpoint MCP, não site) |
| `install-hooks --agent claude-code` (dry, sem `--apply`) | **GO** — imprime JSON de hooks apontando para o exe e o data-dir temporários; destino `…/claude-config/settings.json` |
| `install-mcp --help` | **GO** — clientes claude-code e codex listados |
| Sessão curta Claude → Codex + captura/handoff | **não executado** — prompts reais bloqueados até o Keel liberar cota |
| Config real | **intacta** — `~/.ai-memory` e `%LOCALAPPDATA%\ai-memory` continuam ausentes |

Vendor: docs/windows.md e aimemory.sh ainda marcam Windows nativo como **experimental**; WSL2+Linux é o caminho “supported”.

## Go / no-go

**GO com ressalvas para a integração opcional (flag off).** O binário e o `serve` nativos funcionam neste Windows x64 sem WSL. Não ligar por padrão até uma sessão Claude→Codex autorizada provar captura e handoff. Se essa sessão falhar, cair no item 3 da decisão (ideias nativas no store) e manter a integração desligada no Windows.

Não instalar o zip no PATH do Miguel; o spike fica em `.maestri/tmp/`.
