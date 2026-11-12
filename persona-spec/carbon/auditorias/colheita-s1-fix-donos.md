# colheita-s1-fix: quem corrige o quê (Keel, 12/11 08:50)

Veredito do Carbon em 752e85396a: **BLOQUEADO** (7 P0, 8 P1, 3 P2). Arquivo: `colheita-s1-fix.md`.
Regras da rodada: reproduzir antes de corrigir (teste vermelho primeiro); quem tem P0/P1 aberto não começa item novo;
um pesado por vez pela trava; arquivo novo = avisar o Keel; marcar o resultado em `colheita-s1-respostas.md`
(seção "Rodada 2"). Ordem: vazamento de segredo/acesso → perda de dado → o resto.
Já corrigidos DEPOIS do 752e85396a (só falta o Carbon ver): P0-02 (Forge, `runnable()`), P0-07a (Tally, DM→#geral),
P1-08 parte (Anvil: skills learned, perfil com DM alheia, estado da DM).

| Achado | Resumo | Dono | Apoio |
|---|---|---|---|
| P0-01 | P0-05×P1-10: `browser?.release()` no acerto do cache de warmRunners apaga a vez da persona; `open()` não repovoa openers | Forge | Prism (Estação) |
| P0-02 | `runnable()` relança Tarefa de fundo (já corrigido 08:44) | Forge | Probe (e2e `regressao-p1-02b` sem `it.fails`) |
| P0-03 | `skill-import.ts`: tar com size negativo = loop infinito; gzip bomb; sem timeout; ler=importar sem dono | Flint | Zinc revisa depois de 00:00 |
| P0-04 | Item 23: `actorId='owner'`/`ws` fixos; bootstrap de `:teamId` sequestrável; `{clear}` aceito; `message.actorId` sem cruzar com `authorId` | Bolt | Lumen (revisão), Tally (ACL) |
| P0-05a | Senha no Chrome quente após 10 min (`get_network_request`); `tapTurn`/`redactRunDetail` sem `mask.redact`; `mail:*`/`gh:*`/`telegram:*` = `authority:'person'`; `campaign:` perde linhagem; `via-email` abre em falha | Lumen | Bolt (`handoffs`) |
| P0-05b | `command-policy.ts`: `cp -rt`, `-t<dir>`, `sort -o<arq>`, `::$DATA`, `git config -f` | Tally | Lumen (tabela) |
| P0-06a | Reserva 95%: `splitByFunction` descarta `u2`; handoff+humano perde `handoff:<ticket>` | Rivet | Forge |
| P0-06b | Aprovação cega: "e mais N" sem expandir, aliases ocultos (`external-actions.ts`, `ActionContent.tsx`) | Prism | Rivet |
| P0-06c | `email-filter.ts` nome entre aspas burla o filtro; `mail-host-guard` IPv6 mapeado hex `::ffff:7f00:1` | Rivet (email-filter) | Tally (mail-host-guard) |
| P0-07 | DM→#geral (3 escritores; Tally já corrigiu); **TextCapture compartilhado** no runner `talk:answer-only` entre `/lado` e indicadores | Forge (TextCapture por sessão) | Rivet (indicadores com runner próprio), Tally |
| P1-01 | `ConnectedTaskConversation` falha 100%: falta `unwrapPersonaRemote`; `send` ignora `ok:false`; anexo e `@` | Prism | Ember |
| P1-02 | `ask_vault_code`: Tarefa vira `ready`, `wakeTicket` false, sem cartão/badge, `site` omitido, `login` opcional | Lumen | Anvil |
| P1-03 | Voz: mensagem vazia sem transcrever; CSP (media-src blob/wasm); `components.json`/`DSH_COMPONENTS_MANIFEST`; teto 2 min descarta; DM sem mic; `SoundsSection` sem efeito | Quill (voz/sons/UI) | Cobalt (prepare-dsh, depois de 00:00), CSP: Miguel |
| P1-04 | `finishReply` vaza fala proibida pelo streaming e persiste no Parar; `hostActs:true`; recusa `native.own` vira prova; `<details>`; "Direcionar agora" duplica Tarefa de fundo | Anvil | Flint (absorbingTicket/steer) |
| P1-05 | Item 23: UI de aprovar entrada (listJoinRequests/decideJoinRequest/createInviteLink sem tela); WS `append` sem checar `workspaceId`; revogado autentica; `putMember` sem try/catch; rate-limit | Bolt (hub/host) | Prism (UI), Ember |
| P1-06 | Item 22: cerca do host sem saída clicável; `ConnectedGeneralChannelView` fixo em `#geral`; `@Ana Paula` sem espaço; `@equipe` | Flint (host, flag da cerca, composer) | Prism (UI) |
| P1-07 | Item 26: catálogo/saúde usam `connectorPorts` (undefined) em vez de `portsNow()`; `importSkills` sem hash/escopo owner-repo; `preRoute` com texto externo cru; intake 6/h descarta | Flint | Lumen (revisão) |
| P1-08 | UI P1-11 (Resumo sem Editar, Cofre `keepSecretOnEdit`); Estação: `stationGate.forget` em `evictWarmRunners` + contadores; `bindAccount`; `testEmailConnection` com host editado e senha em branco | Anvil (UI), Prism (Estação), Tally (bindAccount, testEmailConnection) | |
| P2-01 | cleanroom e lint-staged no `persona-gate`; 83 erros oxlint; 6× `crypto.randomUUID()`; `runtime-file-policy.ts:16` nome do pacote | Gauge (gate), Quill (randomUUID e lint do client) | Cobalt (runtime-file-policy, depois de 00:00) |
| P2-02 | `regressao-p1-02b` sem `it.fails`; eval Padaria estrito | Probe | Gauge |
| P2-03 | `GITHUB_WEBHOOK_SECRET` no wrangler; `saveConnectorSecret` sem allowlist; `playbook.ts` UTC; ~15 painéis fora de `ctx.locale` | Bolt (wrangler), Tally (allowlist), Anvil (playbook), Quill (locale) | |

Depois de tudo: corte, gate no worktree limpo (`gate-on-head`), nova auditoria (`colheita-s1-fix2`, base 0167f7d029).
