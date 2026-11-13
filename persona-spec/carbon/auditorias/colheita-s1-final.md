VEREDITO: BLOQUEADO

# Auditoria final da Colheita S1 — commit `d2135706cd` (faixa `752e85396a..d2135706cd`)

Auditor substituto do Carbon, 12/11. **2 P0 e 1 P1 abertos**, os três na superfície LIGADA. Todo o resto que conferi está fechado.
Os dois P0 estão no mesmo arquivo (`persona-runners/src/authority/command-policy.ts`) e têm conserto pequeno; o P1 é uma linha.

## Como li (leia antes de confiar na tabela)

- **A árvore de trabalho NÃO é o commit.** `HEAD` = `d2135706cd`, mas há 81 arquivos rastreados modificados depois dele (entre eles `persona-host/src/index.ts`, `orchestration.ts`, `surface-gates.ts`, `run-authority.ts`, `runner.ts`, `client/flags.ts`, `persona-runners/src/mcp/gateway.ts`) e o índice do git está defasado (`git status` mostra ~5 mil linhas). Comparei com um índice temporário fora do repositório.
- Auditei o **commit** (`git show d2135706cd:<arquivo>`). Os testes que rodei executam a **árvore de trabalho**; só valem como prova do commit nos arquivos que não mudaram (é o caso de `command-policy.ts` e dos specs citados).
- **Consequência para o instalador:** se ele for empacotado da árvore de trabalho, leva código que ninguém auditou (inclusive 4 superfícies novas em `surface-gates.ts`). Empacotar de um checkout limpo do commit aprovado.
- "Rodei" = executei; "li" = só leitura do código e do teste. Não rodei suítes, build nem pack.

## O que conferi

| Item | Estado | Evidência |
|---|---|---|
| P0-01 vez do navegador no runner quente | fechado (li) | `orchestration.ts:2764` troca o `release()` por `browserLeases.set`; `browser/service.ts:217`; `browser-warm-runner.host.spec.ts:90,156,169` |
| P0-02 Tarefa de fundo relançada | fechado (li) | `orchestration.ts:977-981` (`backgroundWork.isDriven`); `p1-02-background.host.spec.ts:214`; e2e `regressao-p1-02b` sem `it.fails` |
| P0-03 skill-import (loop / gzip bomb) | fechado (li) + superfície desligada | `skill-import.ts:96,242`, `skill-import-host.ts:139` |
| P0-04 convite / E2EE | dívida declarada, superfície `invite` desligada | ver D-113 abaixo |
| P0-05a senha no Chrome quente | fechado (li) | `browser-secret-leak.host.spec.ts:248-295`, `tap-turn-secret.host.spec.ts` |
| P0-05b gatilho externo como `person` | fechado (li) | `run-authority.ts:37-46` (`EXTERNAL_TRIGGER`, campanha sem linhagem = `unattended`); `via-email.ts` falha fechado |
| P0-05c escapes do `command-policy` | **NÃO fechado** | ver **P0-A** |
| P0-06a reserva de 95% com split/handoff | fechado (li) | `window-reserve.host.spec.ts:215,235` |
| P0-06b prévia de ação (itens 7–20, sinônimos) | fechado (li) | `p0-06b-aliases.host.spec.ts`, `p0-06b-action-content.client.spec.tsx` |
| P0-06c `From:` entre aspas, IPv6 mapeado | fechado (li) | `email-filter.spec.ts:67-72`, `mail-host-guard.spec.ts:32` |
| P0-07 DM no #geral / `TextCapture` | fechado (li) | os dois e2e `regressao-dm-nao-vaza-*` sem `it.fails`; `runner-capture-per-session.spec.ts:124` |
| P1-01 conversa da Tarefa no Quadro | fechado (li) | `p1-01-task-conversation-envelope.client.spec.tsx:64-109` |
| P1-02 código 2FA não acordava a Tarefa | fechado (li) | `vault-code-wait.host.spec.ts:35,53,67` |
| P1-03 voz e sons | fechado (li; CSP rodada) | `voice-p1-03-*.client.spec.ts`; `main.ts:678` passa `DSH_COMPONENTS_MANIFEST`; `SoundsSection` não é mais renderizada |
| P1-04 `finishReply` / Direcionar agora | fechado (li) | `turn-close-p1-04.host.spec.ts:91-177`, `p104b-steer-background.host.spec.ts:61` |
| P1-05 convite na UI / WorkspaceHub | dívida declarada, `invite` desligada | D-113 |
| P1-06 canais | cerca e Remotes desligados; **um ponto ficou na superfície ligada** | ver **P1-A** |
| P1-07 conectores / importar skill | `skillImport` desligada; partes 1 e 3 com teste (não reli a fundo) | `p1-07-connector-ports.host.spec.ts` |
| P1-08 resíduos | parte do host fechada (li); Estação desligada; pontas de UI com teste, **não conferi** perfil/Memória nem estado da DM | `team-connect-host.ts:97-103`, `connected-cofre-keep-secret`, `company-summary-edit-p1-08` |
| D-113 superfícies desligadas | fechado (li) | `surface-gates.ts` (padrão do produto = OFF; `sharedBrowser` = ON), `flags.ts:44-47` (`test` só com `VITEST=true`), `remote-guard.ts:172` recusa antes de tudo, `index.ts:4053,4070` (ramo remoto do convite); `d113-off-for-real.host.spec.ts` cobre as 35 chamadas; nenhum `PERSONA_SURFACE_*` em `apps/desktop`; flags do cliente `remoteTeamTab`/`channelSections`/`toolsCatalog`/`station` = `defaultOn: false` |
| D-114 CSP da voz | fechado (rodei) | `secure-shell.ts:21-34`: só `'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `blob:` em `media-src` e `connect-src`, nenhum host novo (diff contra `752e85396a`); `secure-shell-p1-05.spec.ts` verde |
| Delta (a) cerca entre projetos | fechado (rodei) | `harness-boards.ts` `assertMine`, `harness-routines.ts` `list`, `acl.ts` `coordinates`; `marco-m3-fence.host.spec.ts` e `acl-project-fence.spec.ts` verdes. Pelas ferramentas a identidade já vinha do turno (`harness-ports.ts:96-118`); a cerca nova é a segunda barreira |
| Delta (b) remover 1 de 3 contas | fechado (li) | `index.ts` `removeConnectionAccount` → `releaseAccountDocs` + `evictWarmRunners`; assento órfão cai numa conta existente; `account-seats.host.spec.ts` SEAT-2/3/4 (não rodei: o spec e `account-docs.ts` mudaram na árvore) |
| Delta (c) `getOfficialQuota` para membro | fechado (rodei) | `index.ts` `withoutAccountIdentity`; `quota-account-identity.host.spec.ts` verde; não há outro emissor de `accountLabel` no host |
| 5 vazamentos R2-01..05 | fechados (li) | `r2-conversation-acl.host.spec.ts:45-116`, `r2-04-private-by-id.host.spec.ts:28-107`, `dm-canvas-approvals.host.spec.ts:13` |
| CP-1..12 | os 12 fechados (rodei: 108 casos verdes) | `p0-05b-command-bypass.spec.ts` + `command-policy-review-r2.spec.ts`; mais ~330 comandos meus contra `judgeCommand`: sobraram só P0-A e P0-B |

## P0-A · `sort -uo ARQUIVO` ainda escreve fora do rascunho como `read` (resíduo do P0-05, dado como fechado)

- **Arquivo:** `packages/persona/persona-runners/src/authority/command-policy.ts:586` (e `:588` para o `tree`).
- **Causa:** a regra é `text === '-o' || text.startsWith('--output') || /^-[a-z]*o./u.test(text)`. A regex exige um caractere DEPOIS do `o`; um grupo de opções curtas que TERMINA em `o`, com o arquivo na palavra seguinte, passa.
- **Reprodução (rodei `judgeCommand` com `draftRoot` = `cwd` = rascunho):**
  - `sort -uo C:/fora/x.txt a` → `read`
  - `sort -ro C:/fora/x.txt a`, `sort -no …`, `sort -k2o …` → `read`
  - `sort -uo ../fora/x a` → `read`
  - controle: `sort -o C:/fora/x a`, `sort -u -o …`, `sort -uoC:/fora/x a` → `unknown` (certo)
  - `tree -Lo 2 ../fora/x` → `read` (mesma falha na linha 588)
- **Efeito:** `read` é `allow` para `person`, `routine` e `unattended` (`authority-table.ts:48`). A persona grava um arquivo em qualquer pasta sem cartão, por exemplo um `.bat` na pasta Inicializar do Windows. É a mesma classe do CP-6 (`uniq`), que a equipe tratou como P0.
- **Conserto sugerido:** na 586 usar `/^-[a-zA-Z]*o/u` (qualquer grupo curto que contenha `o`), e o equivalente na 588. Acrescentar ao `p0-05b-command-bypass.spec.ts` os casos `-uo DIR/x`, `-ro DIR/x`, `-k2o DIR/x`, `tree -Lo 2 DIR/x`.

## P0-B · `git init --template` + `git commit` executam um programa qualquer, tudo como `draft-change` (auto-permitido)

- **Arquivo:** `packages/persona/persona-runners/src/authority/command-policy.ts:162` (`GIT_DRAFT_CHANGE` tem `init`, `commit`, `add`, `merge`…) e `:763-764`.
- **Causa:** a política protege caminho escrito DIRETO em `.git/` (`echo x > .git/hooks/…` → `outside-change`, certo), mas não o que POVOA o `.git` por outro caminho: o molde do `git init` copia `hooks/` e `config` para dentro do repositório novo.
- **Reprodução (julgamento rodado; execução provada numa pasta temporária fora do repositório, git 2.x do Windows):**
  1. Escrever `tpl/hooks/pre-commit` no rascunho (arquivo comum: `mkdir -p tpl/hooks` → `draft-change`; o conteúdo pode vir da ferramenta Write), com `#!/bin/sh` e um comando qualquer (`curl …`, copiar `~/.ssh`, gravar fora).
  2. `git init --template=tpl r` → `draft-change`.
  3. `git -C r add .` → `draft-change`; `git -C r commit -m x` → `draft-change`.
  4. O gancho roda. No meu teste ele gravou um arquivo FORA da pasta do repositório.
- **Variações que o julgamento também deixa passar (li o veredito, não executei o git):** `mv sub .git`, `cp -r sub .git`, `ren sub .git` → `draft-change` (uma pasta comum com `hooks/` e `config` vira o `.git`); `git init --separate-git-dir=sub r` → `draft-change`; `git -C sub status` e `cd sub && git status` → `read` com `sub/` montada como repositório (um `core.fsmonitor` no `config` é um comando; minha execução dessa variante travou e eu a interrompi, então fica como suspeita).
- **Efeito:** os três passos são `allow` também para `routine` e `unattended`. Um e-mail ou página que convença a persona dá execução de programa na máquina do dono, sem cartão: envio de dados, leitura de segredo e escrita fora do rascunho, que são exatamente o que `send`/`secret`/`outside-change` existem para barrar.
- **Conserto sugerido (três linhas de defesa, a primeira já estanca):**
  1. No ambiente que o runner entrega ao CLI, fixar configuração de git que vence a do repositório: `GIT_CONFIG_COUNT=3`, `core.hooksPath` = pasta vazia do app, `core.fsmonitor=false`, `safe.bareRepository=explicit`. (O `DANGEROUS_ENV` já impede a persona de sobrescrever `GIT_*`.)
  2. Em `command-policy.ts`: `git init` com `--template` ou `--separate-git-dir` → `unknown`; em `cp`/`mv`/`ren`/`Move-Item`/`Copy-Item`/`mkdir`, qualquer operando cujo último segmento seja `.git` (ou que passe por `/.git/`) → `outside-change`.
  3. Teste: o gancho de um repositório criado pela persona não roda (um spec que executa o git de verdade num temporário), mais os casos de julgamento acima.

## P1-A · Escolher no seletor uma persona de nome composto manda a mensagem para outra (P1-06, ponto 3, lançado como dívida de `channels` mas está na superfície ligada)

- **Arquivo:** `packages/persona/client-ui-persona/src/client/chat/ChannelComposer.tsx:527`; `packages/persona/persona-host/src/mentions.ts:41-63`.
- **Causa:** o compositor monta `@${responder.name.replace(/\s+/gu, '')}` (`@AnaPaula`); o host só reconhece a menção com o nome exato (`@Ana Paula`). O caminho depende de `menuMode` (`:230`), que vem da flag `navPlaces`, ligada no produto; não depende da superfície `channels`.
- **Reprodução (li, não executei):** contratar uma persona chamada "Ana Paula"; no #geral, escolher a Ana Paula no seletor de quem responde e enviar "monte o relatório". O texto sai como `@AnaPaula monte o relatório`, `mentionsOf` não acha ninguém e quem responde é a persona padrão.
- **Alcance:** só personas com espaço no nome (as do time padrão têm uma palavra).
- **Conserto sugerido:** na 527 usar `@${responder.name}` (o `mentionsOf` já casa nomes com espaço, do mais longo para o mais curto) e conferir `!text.includes(handle)` com o mesmo texto; um caso em spec de cliente com "Ana Paula".

## Ressalvas (não bloqueiam sozinhas)

1. **Empacotar do commit, não da árvore** (ver "Como li"). O `d113-off-for-real.host.spec.ts`, o `surface-gates.spec.ts` e o `account-seats.host.spec.ts` também estão modificados na árvore.
2. **Não conferi:** P1-08 (Memória do perfil filtrada por persona; DM mostrando `paused`/`quiet`/`step`), P1-07 parte a parte, P1-02 "cartão aparece no chat" (o teste prova a espera, o acordar e a contagem do badge), e a escrita da linhagem de campanha do Gestor (sem ela a campanha roda como `unattended`: falha fechado).
3. **Fora do escopo (P2):** `git config --global --list` é `read` enquanto `cat ~/.gitconfig` é `unknown`.

## Para a reauditoria do conserto

Basta o delta de `command-policy.ts`, do ambiente do runner e de `ChannelComposer.tsx:527`, com os specs novos. Os comandos que usei estão nas seções P0-A e P0-B.

## REAUDITORIA S2 (c0d7578b86)

VEREDITO S2: LIBERADO COM RESSALVAS

- **Delta conferido:** `git diff d2135706cd c0d7578b86` = 5 arquivos, só os esperados (`command-policy.ts`, `native-cli-env.ts`, `p0-ab-sort-git-hooks.spec.ts`, `persona-host/src/mentions.ts`, `persona-host/tests/mentions.spec.ts`); os trechos de P0-A/P0-B estão íntegros.
- **P0-A e P0-B: fechados, mas o conserto é MEU** (o dono do produto pediu que o auditor corrigisse). Vermelho antes (31), verde depois (34/34), mais 14 arquivos / 401 testes da suíte de comandos sem regressão. Não vale como revisão independente: essa fica com o Gauge/Lumen. Sem prova: o caso `core.fsmonitor` (não reproduzido), e que cada CLI repassa o `GIT_CONFIG_*` ao shell que abre.
- **P1-A: fechado (rodei).** `mentionsOf` aceita a forma compacta: `@AnaPaula` chega à "Ana Paula"; `@Ana Paula` e `@Ana` seguem certos com "Ana" e "Ana Paula" no mesmo time; `@AnaPaulaX` e `x@anapaula.com` não mencionam ninguém. `mentions.spec.ts` verde.
- **Ressalva 1 (P2, não bloqueia):** com duas personas cujo nome só difere por espaço ou acento, a menção exata pode ir para a outra, conforme a ordem da lista: `["Ana Paula","AnaPaula"]` + `@AnaPaula` → "Ana Paula"; `["João","Joao"]` + `@Joao` → "João". Conserto: em empate de tamanho, a chave exata (como escrita) vence a compacta/sem acento.
- **Ressalva 2 (a mesma da auditoria):** empacotar de um checkout limpo de `c0d7578b86`; a árvore de trabalho tem dezenas de arquivos alterados fora do commit e o índice do git está defasado.
