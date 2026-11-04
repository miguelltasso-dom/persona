# Modelo de ameaças — Persona (v1)

Escopo: app desktop/local-first. Sem telemetria externa. Atualizado 03/11/2026 22:25 a partir do código (core/engine/host/runners) e do dogfood Padaria Lua (Forge, seed após overlay P0).

## Ativos

| Ativo | Onde vive | Se vazar |
| --- | --- | --- |
| Cofre (brief/constraint/decision/memory) | `PERSONA_HOME` SQLite | Regras e dados da empresa no prompt |
| Credenciais de CLI / APIs | Cofre DPAPI (Windows) / vault selado | Gasto de cota, impersonação |
| Transcriptos canal/DM | store local | Conversas e PII |
| Worktrees de tarefa | disco do projeto | Código e segredos do repo |
| Arquivos `.persona.json` / `.team.json` | export do usuário | Perfil da equipe (sem memória privada por contrato) |
| Insights locais | eventos já persistidos | Hábitos de uso (não saem da máquina) |

## Fronteiras

1. **Pessoa → UI (renderer Electron / web)** — texto, anexos, imports.
2. **UI → host Node** — Remote RPC autenticado por sessão.
3. **Host → engine** — Trigger/Ticket/Eval; pré-roteador antes do modelo.
4. **Engine → runner (DSH / CLI)** — prompt + cwd; CLI nunca em `prompt` (D-052).
5. **Host → fontes externas** (GitHub HMAC, e-mail, Telegram, Slack, Discord, ICS) — token no Cofre, polling com teto.
6. **Share/import** — arquivo no disco; parser recusa segredo e memória privada.

A UI não executa agente. O host local executa. Credenciais não sobem para Cloudflare no caminho local-first.

## Ameaças por canal

### #geral e DM

- Injeção ("IGNORE ALL POLICIES", "você é o dono") — mitigado: bloco `<dado>`; pré-roteador ignore; talk-eval real recusou a injeção no fake e o i1 não rodou no teto de 4.
- Eco / placeholder — juiz do talk-eval; prompt pede para não ecoar.
- @menção que vira Tarefa sem querer — host mapeia mention → `action: 'model'` (não auto-accept).
- Id interno (`onb-1`) no prompt — `composeTalkPrompt` / `composePersonaPrompt` usam nome de exibição.

### Aprovações / revisão git

- Patch com segredo — `redactSecrets` no ReviewDelivery.
- Merge pela metade — accept aborta no conflito.
- Feedback de revisão — vira memória com proveniência, não skill ativa.

### CLI / runner

- Aprovação interativa pendurada — `assertCliNeverPrompt`; eval usa `deny`.
- Sessão órfã (cota + RAM) — `coord-real-cli` / `talk-real-cli` cancel+dispose+timeout+`taskkill /T`.
- Skill importada de `~/.claude/skills` — só candidata `enabled: false`; arquivo com cara de segredo é ignorado.

### Export / import

- Upload de avatar e Cofre no share — avatar vira silhueta; `memory`/`vault`/`credentials` recusados.
- Timezone/relógio falso em testes — insights e funil são locais, sem rede.

### Fontes externas

- Webhook GitHub sem HMAC — recusa.
- Token no log — redaction no review e no eval (`SECRET_IN_PROMPT`).

## Mitigações que já existem

- ACL `can(actor, action, resource)` + authorize no `compileContext`.
- Cofre: requireds sempre entram; DM-origin skill não publica.
- `persona_propose` não escala acesso além do criador.
- Handoff claim-once, sem ciclo, orçamento de profundidade.
- Share: `SECRET_REFUSED` / `IMPORT_REFUSED`.
- Insights: sem export para nuvem (contrato).

## Lacunas (v1)

- **First-use stuck (P0):** `completeOnboarding` do live store manda `roster`/`projectId`; o host exige `team`/`personalProjectId`. O overlay remonta (`firstUse` fica true). Disponibilidade: usuário novo não entra no app. Seed (`seed-default-team.ts`) já usa o contrato certo. DF-002.
- Pedido em #geral pode não persistir (DF-013); DM não abre sozinha (DF-008). Superfície de conversa ainda não é o caminho único de Trigger.
- "Marcar fora" / "Enquanto você estava fora" ausentes no perfil (DF-010/011) — sem sinal honesto de ausência humana.
- Talk-eval real não cobriu o cenário de injeção (teto 4).
- Quota entre projetos no mesmo `PERSONA_HOME`: `spendOnProject` / `maySpendOnProject` isolam leftovers (engine). Anvil ainda precisa persistir o book por projeto.
- Cloudflare/edge (E11) fora deste modelo até o Atlas liberar conta.
- Renderer Electron: assumimos o hardening do Rivet (instância única, CSP); não reauditado neste passeio.
- Copy sem glifo de espaço (DF-003) é UX, não vazamento; ids internos (`onb-*`) não apareceram na UI do seed.
