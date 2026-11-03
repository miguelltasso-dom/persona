# A4 — OAR / CLIs no Windows (somente leitura)

Data: 2026-11-03. Sonda: `pnpm exec tsx packages/persona/persona-runners/scripts/probe-clis.ts`
OAR `@botiverse/oar` 0.67.0. Node 24.22.1. Sem prompts, sem login, sem tokens.

## Matriz

| Runtime | Instalação | Versão | Auth (OAR) | Modelos | MCP | Resume | Sessão (adapter) | Go/no-go |
|---|---|---|---|---|---|---|---|---|
| `dsh` (loop direto) | nativo do host (`ctx.agents`) | — | API key no vault (não sondado aqui) | provedores `llm-pi-ai` | nativo `ctx.tools` | sim (`agent` continuável) | streaming / cancel / inject | **GO** — rota sempre disponível; não passa pelo OAR |
| `oar:claude` | `C:\Users\migue\.local\bin\claude.EXE` | 2.1.317 (bate com a conhecida) | `logged_in` (plan max, method claude.ai; e-mail omitido) | 13 (`default`, opus, fable, sonnet, haiku, …) | sim (`mcpToolsListChanged: additions`; sem recusa) | sim (`--resume`) | queue in-process; attribution `attributed`; images sim | **GO** |
| `oar:codex` | `C:\Users\migue\AppData\Roaming\npm\codex.CMD` | 0.166.0 | `logged_in` (method chatgpt) | 53 (default `gpt-6.1-sol`) | sim (`mcpToolsListChanged: none`) | sim (thread nativa) | queue durável; attribution `nested`; images sim | **GO** |
| `oar:opencode` | `C:\Users\migue\.bun\bin\opencode.EXE` | 1.19.3 | OAR **não** expõe `authStatus`; `listModels` respondeu (373 ids, catálogo + OpenRouter) | 373 | sim (`mcpToolsListChanged: full`) | sim, **só no mesmo cwd** | v1.19 → perfil v2: attribution `nested`; images não declaradas no adapter | **GO com ressalvas** (unverified upstream; sem status de login; resume amarra cwd) |
| `oar:cursor` | `cursor-agent` em `C:\Users\migue\AppData\Local\cursor-agent\versions\2026.10.22-27dcf5f\cursor-agent.cmd` | conhecida 2026.10.22 (`.cmd` **não** executado: `promote-staged`) | OAR cursor exige `@cursor/sdk` 1.0.37 | — | recusado pelo OAR (ferramentas Persona indisponíveis) | sim no SDK, se existisse | queue in-process; attribution `attributed`; images sim | **NO-GO até o Keel instalar `@cursor/sdk@1.0.37`** (não instalei) |

`agent` no PATH é o Grok (`grokAgentOnPath: true`). A sonda só usou `cursor-agent` (via `where.exe`), nunca `agent`.

## Capacidades e recusas (OAR)

- **claude**: `refusedSessionOptions` vazio. MCP e resume aceitos. `session()` não foi aberto.
- **codex**: sem mapa de recusas no runtime. MCP aceito; mudança de tools em sessão = `none`.
- **opencode**: recusa `outputSchema`, `name`, `serviceTier`, `disallowedTools`. MCP aceito. Sem `authStatus`/`login` no runtime.
- **cursor** (do adapter, SDK ausente): recusa `mcpServers`, `systemPrompt`, `appendSystemPrompt`, `env`, `launchArgs`, `outputSchema`, `name`, `serviceTier`.

Capabilities de sessão vêm das constantes do adapter OAR 0.67.0; a sonda **não** chama `session()` (evita processo/prompt).

## Go / no-go (D-009 / D-018)

| Decisão | Runtime | Motivo |
|---|---|---|
| GO | `dsh` | Contrato `ctx.agents` já no host; independe desta sonda. |
| GO | `oar:claude` | Instalado, autenticado, modelos, MCP, resume. |
| GO | `oar:codex` | Idem. |
| GO (2ª classe) | `oar:opencode` | CLI ok e lista modelos; sem `authStatus`; resume só no mesmo cwd; upstream unverified. |
| NO-GO agora | `oar:cursor` | `@cursor/sdk@1.0.37` ausente no workspace. CLI nativa está no PATH. Pedir ao Keel o peer; não rodar `pnpm install` daqui. |

Plano B da D-009 (SDKs próprios) **não** é necessário para claude/codex neste Windows. Cursor só desbloqueia com o peer do SDK.
