# ai-memory (akitaonrails/ai-memory) — decisão (Atlas/CTO, 03/11/2026)

Repositório: https://github.com/akitaonrails/ai-memory — MIT, Rust, binário único, ~15k estrelas, ativo. Memória de longo prazo para CLIs de agentes: captura por hooks (Claude Code, Codex, Cursor, OpenCode e **DeepSeek Harness** — hooks + MCP via patch Cordis), wiki markdown versionada em git como fonte da verdade, índice derivado (FTS + entidades + grafo + vetores opcionais), handoffs tipados "claim-once" entre harnesses, perfil pessoal entre projetos, servidor multiusuário com auditoria, envelhecimento/dedup/contradição **sem LLM** por padrão. Windows nativo: **experimental**.

## Decisão: usar, como integração opcional — não como núcleo de memória

**Por que faz sentido:** resolve exatamente um requisito nosso que é caro de construir — continuidade quando uma persona troca de harness/modelo (Claude → Codex → Cursor) dentro de um repositório, com handoff do que falhou e do que está aberto. Suporta nossos quatro runners e o próprio DSH. Markdown editável combina com o "Cofre" visível e editável.

**Por que não como núcleo:** a Persona precisa de fronteiras de acesso finas — por persona, por audiência (DM vs canal), revogação que se propaga para derivados, contexto obrigatório por política. O ai-memory isola por projeto e por pessoa, não por persona/audiência; usar como fonte da verdade criaria dual-write e vazamento de DM. Windows nativo experimental também pesa (Windows é nossa plataforma 1).

## Como entra

1. **Fonte da verdade continua sendo a Persona** (SQLite + engine): Cofre, decisões, memórias por persona, ACL, proveniência.
2. **Integração "Memória de código"** (marco E, atrás de flag, desligada por padrão): quando uma persona executa uma Tarefa num repositório (worktree), o runner pode iniciar a CLI via `ai-memory run <harness>` ou com hooks/MCP do ai-memory, num servidor local (`ai-memory serve`) gerido pelo host, com namespace por (workspace, projeto). Executoras de tarefas originadas em DM **não** capturam (ou capturam em namespace privado da pessoa). Detecção: se `ai-memory` existe no PATH, oferecer ativação em Configurações; senão, link de instalação.
3. **Adotar as ideias de forma nativa** no nosso store (sem depender do binário): (a) handoff tipado com dono e "claim-once"; (b) envelhecimento sem LLM — decaimento por camada, reforço por uso, dedup de quase-duplicatas, sinalização de contradição, nada apagado de verdade (supersede + restaurar); (c) exportar/importar o Cofre e memórias como markdown (Obsidian-friendly) — também serve ao marco F (importadores).
4. **Spike obrigatório antes de ligar** (Rivet): instalar `ai-memory-windows-x86_64.zip` num HOME temporário, `serve` local, `install-mcp/install-hooks` em Claude Code e Codex temporários, uma sessão curta em cada, verificar captura e handoff Claude→Codex. Go/no-go em `persona-spec/spikes/ai-memory-windows.md`. Se no-go no Windows nativo, a integração fica desligada no Windows e só as ideias nativas (item 3) seguem.
