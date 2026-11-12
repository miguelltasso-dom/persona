# Flags: padrão LIGADO na v1.1 — host (TEAM-15, Anvil, 05/11 02:00) e cliente (FLAGS-ON-1, Flint, 05/11 01:40, ao fim)

**Regra (Keel, D-090):** uma função da v1.1 vem **LIGADA no app real**. A pessoa (ou o build) **desliga**; ninguém precisa lembrar de ligar. O `cordis.patch.yml` (`persona-app`) **não** carrega `config` do `persona-host`: o padrão mora no host, em `persona-host/src/flags.ts` (`resolveHostFlag`).

## Quem decide (ordem)

1. `Config.<flag>` do plugin quando nomeia a flag (`true` **ou** `false` — `false` é o opt-out explícito do código);
2. variável de ambiente `PERSONA_<FLAG>`: `0`/`false`/`off`/`no` desliga, `1` liga, qualquer outro valor (ou vazio) mantém o padrão;
3. padrão do produto: **ligada**.

**Única exceção, num lugar só:** sob Vitest (`VITEST=true`) o padrão continua **desligado**. As suítes in-process montam um host nu e ligam o que testam (do mesmo modo que `allowsScriptedReplies` e o banco em memória já dependem de `VITEST`). Um processo de host iniciado por um verificador que herdou `VITEST=true` deve limpá-la (precisa de qualquer forma: `VITEST` também deixa o host *scripted*, ver `runner.ts`). Fora do Vitest nada disso existe: **o app instalado já nasce ligado**.

**Provar o padrão de PRODUÇÃO dentro do Vitest (Gauge team-day, Probe):** `PERSONA_HOST_FLAGS=production` no ambiente **ou** `Config.flagDefaults: 'production'` faz o padrão valer LIGADO mesmo sob `VITEST`. Muda só o **padrão**: `Config.<flag>` e `PERSONA_<FLAG>=0` continuam vencendo (a mesma suíte prova o opt-out). Outro valor de `PERSONA_HOST_FLAGS` não muda nada.

**Smoke no app instalado, sem env:** o host resolve as quatro uma vez (`PersonaHost.hostFlags`) e mostra o resultado em dois lugares:
- `exportDiagnostics()` → `json.flags = { teamwork, fanout, startOnBoardMove, productTools, defaults }` (`defaults`: `production` no app, `test` num host de Vitest sem o override);
- uma linha no log do host, no boot, só fora do Vitest: `[persona-host] flags teamwork=1 fanout=1 startOnBoardMove=1 productTools=1 defaults=production` (stderr).
Quem confere o exe instalado lê uma das duas e espera `=1` e `defaults=production` sem ter passado nenhuma variável.

## Inventário do host (dono: Anvil, salvo indicação)

| Flag (`Config`) | Variável de opt-out | Dono | Padrão **antes** | Padrão **agora** | O que liga |
|---|---|---|---|---|---|
| `teamwork` | `PERSONA_TEAMWORK=0` | Anvil (+ Forge/Tally nos motores) | desligada (opt-in `=1`) | **ligada** | D-090: passar trabalho, pedir ajuda/opinião, revisar, bom-dia, cartões de equipe, títulos curtos, rota por função |
| `fanout` | `PERSONA_FANOUT=0` | Anvil (+ Bolt na triagem) | desligada (opt-in `=1`) | **ligada** | CV-8: "Toda a equipe", "Quem tiver algo a dizer", várias @menções como bloco de linhas tipadas |
| `startOnBoardMove` | `PERSONA_START_ON_BOARD=0` | Anvil (HT-3, Bolt/Rivet) | desligada (opt-in `=1`) | **ligada** | a persona começa quando a pessoa move o cartão para "Fazendo" |
| `productTools` | `PERSONA_PRODUCT_TOOLS=0` | Bolt/Rivet (HT-0), host liga | desligada (opt-in `=1`) | **ligada** | ferramentas do produto (quadro, sprints, rotinas, contratar, perguntar) na Tarefa de CLI; exige o transporte CLI |

Já ligados por padrão (sem mudança, só registrados): `Orchestration.skipTriage = true`, `Orchestration.courtesyNoModel = true`.

**Conector / prévia de ação (HT-9) — o host NÃO muda (D-095, Atlas/Keel 05/11 03:27: HT-9 PROVADO, a v1.1 sai com o ENVIO por permissão):** o host não tem flag própria para isso (o portão é o `PermissionGate` do Tally e o cartão é sempre gravado); quem decide se a prévia aparece é a flag do **cliente** `actionPreview`, que agora vem **ON** como as outras (tabela abaixo). Nenhum padrão de conector do host muda.

**Revisão de entrega (TEAM-6):** não tem flag própria; roda dentro de `teamwork` (`Handoffs.enabled`, `handoffs.ts`). Com `teamwork` ligado por padrão, um projeto sem política cai em `NEW_PROJECT_REVIEW` (todas as entregas, revisor = Coordenação) até a pessoa mudar em `setReviewPolicy`. Quem conta Tarefas numa spec do host não vê a revisão (sob Vitest `teamwork` nasce desligado) a menos que ligue `teamwork`; para desligar só a revisão: `setReviewPolicy({ mode: 'off' })`.

Fora de escopo (não são "funções ligáveis"): `PERSONA_HOME`/`DSH_HOME` (pasta), `PERSONA_REAL_CLI`/`PERSONA_SCRIPTED` (modo do runner; scripted só sob `VITEST`/`=1`), `PERSONA_BUNDLED_GIT`, `PERSONA_GITHUB_WEBHOOK_SECRET`, `PERSONA_REAL_*` (provas pagas, exigem OK do Keel/Atlas e teto).

## Flags do **cliente** — padrão LIGADO na v1.1 (FLAGS-ON-1, Flint, 05/11 01:40)

Antes, cada recurso novo do cliente nascia desligado (D-077) e só ligava com `localStorage = '1'`. Agora **todas as do escopo da v1.1 vêm LIGADAS** e `'0'` desliga. Leitor único: `packages/persona/client-ui-persona/src/client/flags.ts` (`readFlag`); prova: `tests/flags-defaults.client.spec.ts`.

**Precedência (a primeira que existir):**
1. `localStorage['persona.flag.<nome>']`: `'0'`/`'false'` desliga, `'1'`/`'true'` liga (a escolha explícita);
2. `window.__PERSONA_FLAGS__[<nome>]` (ou `[<chave inteira>]`): `false` desliga, `true` liga (o que um `addInitScript` do Playwright usa);
3. o padrão da tabela abaixo.

**Storage bloqueado** (janela privada, prévia) ou sem `window` = não há escolha explícita: vale o padrão (**LIGADO**). O leitor nunca lança. Para desligar uma flag (varredura, comparação antes/depois): `localStorage.setItem('persona.flag.bubbles', '0')` e recarregar, ou `window.__PERSONA_FLAGS__ = { bubbles: false }` antes do app montar.

| Nome (chave `persona.flag.<nome>`) | Padrão na v1.1 | Dono | O que liga | Motivo / observação |
|---|---|---|---|---|
| `navPlaces` | **ON** | Flint | A barra lilás única (CV-1), o trilho, o popover "Quem responde" (CV-3) | O Miguel pediu uma barra só ("por que 2 sidebars?") |
| `bubbles` | **ON** | Flint | Os balões em todos os chats (CV-9) | O Miguel pediu balões em todos os chats |
| `lampLight` | **ON** | Flint | A luz da luminária no chat, só no escuro | Aprovada pelo Miguel (20:21); só existe com os balões (`isLampLightEnabled` = esta + `bubbles`) |
| `workingControl` | **ON** | Flint | Fila do host, Parar, "Direcionou", balão que cresce, "está escrevendo…" (FL-11), canal e DM | Host do IV-5 entregue; sem as chamadas no host a tela cai sozinha para a de sempre |
| `teamwork` | **ON** | Prism / Ember / Lumen (D-090) | Bom dia, Pedido de opinião, linhas de passagem de trabalho, plano e entrega, chips do quadro | Há 2 leitores (`chat/teamwork-flag.ts`, `teamwork/teamwork-flag.ts`): ambos delegam ao leitor central. **Com o host ligado (acima) e esta desligada, o #geral mostra a mensagem do host como texto.** |
| `personaAsk` | **ON** | Ember (IV-10) | A pergunta estruturada com chips e o "Responder" | Sem as chamadas no host o fio mostra a frase simples |
| `taskProposal` | **ON** | Ember (P1-9) | O cartão "Proposta de {persona}" | Sem as 3 chamadas no host nada muda |
| `houseDecor` | **ON** | Lumen (BR-P4) | Os enfeites da casa e da noite | Sem a arte (`ILLUSTRATIONS`) cada enfeite devolve `undefined`/`null` e a tela usa a ilustração de sempre (teste em `flags-defaults.client.spec.ts`) |
| `figurinhas` | **ON** | Quill | As figurinhas (reações) | A pessoa as desliga em Configurações › Aparência (a antiga aba Personalidade, cena 22 da Muse) |
| `remoteTeamTab` | **OFF** (v1.1) | Quill (cena 20) | A aba Membros de Configurações | **DESLIGADA na v1.1** (decisão do Keel, 11/11): a equipe remota ainda não está ligada ao host de produção (deploy externo, E11). Sem a flag, a equipe fica no cartão "Equipe à distância", em Conexões. `'1'` liga a aba |
| `nextStep` | **OFF** (corte da v1.1) | Quill (P1-6) | A barra "Próximo passo" | **DESLIGADA no corte** (Muse 05/11 06:15, via Keel): sem prova visual da regra certa nas outras telas (a Muse viu só a de Aprovações); volta na v1.2. `'1'` liga |
| `settingsPersonas` | **ON** | Quill (HT-13) | A aba Configurações › Personas | **ON SEM condição** (Keel 05/11 04:19): a Muse ACEITOU Conexões, Ensinar e Configurações › Personas no bundle 3 (captura do Quill). Antes era condicional ao aceite visual; a condição caiu |
| `approvalsInboxV2` (chave **`persona.approvalsInbox.v2`**, fora do prefixo) | **ON** | Ember | Aprovações em 2 painéis | A Muse liberou como padrão (Keel, bundle 3). Entra no leitor central a pedido do Ember, para a faixa de testes cobrir (`approvals/inbox-flag.ts` vira `readFlag('approvalsInboxV2')`, feito por ele) |
| `engineEffort` | **ON** | Quill (EFF-1) | Modelo e Capricho por persona | |
| `actionPreview` | **ON** (D-095) | Prism / Ember (D-084 HT-9) | A prévia de ação externa, o "Desfazer" da ação direta, o pedido de iniciativa | **Virou ON no D-095** (Atlas/Keel 05/11 03:27: HT-9 provado, a v1.1 sai com o envio por permissão). Os 3 usos são no `GeneralChannelView` (`actionPreview`, `initiativeAsk`, `actionEvent`); nenhum cartão depende de OUTRA flag do cliente. `'0'` desliga |

**Fora do leitor:** `connectors` não existe como flag no cliente (só no host). O leitor do V2 de Aprovações (`approvals/inbox-flag.ts`) é do **Ember**: ele o troca para `readFlag('approvalsInboxV2')`; a linha da tabela já existe.

**Os arquivos `*-flag.ts`:** cada um continua exportando a mesma chave e a mesma função (`isBubblesEnabled`, `isPlacesNavEnabled`, …), agora um invólucro de uma linha (`return readFlag('<nome>')`): nenhum importador mudou. Para acrescentar uma flag: uma linha em `FLAGS` (`flags.ts`), um `*-flag.ts` fino se o recurso quiser uma função própria e uma linha nesta tabela.

**Faixa de testes:** `scripts/test-dom-environment.ts` chama `setFlagDefaults(false)` ao começar cada arquivo, para que as specs escritas quando tudo nascia desligado continuem valendo (as que ligam com `'1'` não mudam). Nada específico de teste existe no código de produção do cliente (`flags.ts` só expõe `setFlagDefaults`); quem prova o padrão de produção chama `setFlagDefaults(undefined)`. **Capturas:** as flags já vêm ligadas; para ver o "antes", `localStorage.setItem('persona.flag.<nome>', '0')` num `addInitScript`.

## Efeito para quem testa

- `PERSONA_TEAMWORK=1`, `PERSONA_FANOUT=1`, `PERSONA_PRODUCT_TOOLS=1`, `PERSONA_START_ON_BOARD=1` **ficaram desnecessárias** num host real (continuam aceitas, valem como "ligar").
- Para provar o caminho **desligado**: `PERSONA_<FLAG>=0` no ambiente do host, ou `config: { <flag>: false }` na criação do `PersonaHost`.
- Nas specs do host: o padrão sob Vitest segue desligado (nenhuma asserção foi apagada ou enfraquecida); quem quer a função liga com `new PersonaHost({ ..., teamwork: true })` ou `h.teamworkEnabled = true`, quem quer provar o desligado passa `false`.

## Prova

`persona-host/tests/host-flags.spec.ts`: `resolveHostFlag` (config > env > padrão, vazio/lixo no env, exceção do Vitest, override `production`), `resolveHostFlags`/`flagsBootLine`, um host real com `Config`/env/`flagDefaults` (`exportDiagnostics().flags`) e checagem estática de que `index.ts` não lê mais `config.<flag> === true` nem `process.env.PERSONA_<FLAG> === '1'` para estas quatro flags (um novo opt-in escondido quebra o teste).
