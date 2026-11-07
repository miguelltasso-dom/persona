# Configurações › Personas — contratos do host (Anvil, D-088/D-090, 04/11 22:20)

Para o **Quill** (a aba) e quem mais lê. Tudo isto **já está no tree**, com teste (`persona-host/tests/engine-effort.spec.ts`, `teamwork-settings.spec.ts`, `connector-grants.spec.ts`). Regra única da aba: **a pessoa decide; o host só guarda e informa**. Nada é escolhido por ela, nada tem selo "Recomendado".

## Onde a aba lê

`listPersonas` / `listTeam` devolvem `PersonaView` (`persona-host/src/types.ts`). Campos novos, todos aditivos:

```ts
PersonaView.canRecruit: boolean                 // "Pode contratar" (já existia)
PersonaView.engine?: {                          // EFF-1: a escolha de motor/modelo/capricho
  runnerKind: 'dsh' | 'cli'
  runnerCli: string                             // '' no motor embutido
  runnerModel: string | null                    // null = "Padrão do motor" (nenhum --model)
  runnerEffort: 'low'|'medium'|'high'|'xhigh'|'max' | null   // null = "Padrão do motor" (nenhum --effort)
}
PersonaView.teamwork?: {                        // D-090/TEAM-3 — só com Config.teamwork ligada
  canAskColleagues: boolean                     // "Pode pedir ajuda a colegas" (padrão: ligada)
  askCapPerDay: number                          // "Até {n} pedidos a colegas por dia", 1..20 (padrão 6)
  askedToday: number                            // quantos já fez hoje (a opinião também conta)
  maxOpinionRounds: number                      // rodadas de opinião por Tarefa, 1..3 (padrão 2)
}
```

## (1) Ajuda a colegas, teto diário e rodadas — `setPersonaTeamwork`
```ts
setPersonaTeamwork({ workspaceId, projectId, personaId, canAskColleagues?, askCapPerDay?, maxOpinionRounds? }): PersonaView
```
- Só o que é nomeado muda. Fora da faixa (0, 21, 2,5; rodadas 0 ou 4; tipo errado) → `invalid-payload` com frase curta; **nada é gravado pela metade**.
- Quem pode: o responsável ou o dono do workspace (`forbidden` para membro comum). Registra auditoria `persona_audit`.
- `askedToday` vem do registro de pedidos do engine (Forge, `handoffs.ts`): zero até ele ligar. O teto "chegou ao limite" **não vira linha no fio**, só texto no detalhe da Tarefa.

## (2) Modelo e capricho (EFF-1)
```ts
setPersonaEngine({ workspaceId, projectId, personaId, runnerKind, runnerCli,
  runnerModel: string | null,                    // null = Padrão do motor
  runnerEffort?: 'low'|'medium'|'high'|'xhigh'|'max' | null   // null = Padrão; omitido = mantém só se motor E modelo não mudaram
}): PersonaCardView                              // card.engine = { runnerLabel, modelLabel, runnerModel, runnerEffort }
createPersona({ ..., runnerEffort?: ... | null })   // persona nova: nenhum dos dois (null)
```
- A **lista do que o motor aceita** vem em `listConnections()` → `ConnectionView.models?: { id, label, effortLevels[], defaultEffort? }[]` e `ConnectionView.defaultEffortLevels?: nível[]` (os níveis do "Padrão do motor", o `default` do próprio motor). **Resposta à pergunta do Flint: opção A** — o host manda `defaultEffortLevels`, a tela não adivinha.
- Sem `models` (o motor não disse): a tela mostra só "Padrão do motor" e "Este motor não deixa escolher o capricho". Sem `effortLevels` num modelo = aquele modelo não tem escolha de capricho. **Não existe campo `recommended`; não existe `hint`** (o motor não manda descrição; dica de velocidade/custo é texto da tela). Modelo `disabled` no motor **não aparece**.
- O host **não trava** combinação: guarda qualquer um dos 5 níveis; se o motor recusar na hora, o runner cai no padrão e registra `effortDropped` (Tally). Nível desconhecido (`turbo`) → `invalid-payload`. Trocar o motor/modelo **encerra a sessão quente** da persona (a próxima rodada abre com a nova escolha).
- Só motor `cli` guarda capricho; no motor embutido (`dsh`) ele é descartado.

## (3) Conectores da pessoa — concessões (D-084)
Contrato completo: `connector-grants.md`. Remotes: `listConnectorGrants({…, personaId?})` → `ConnectorGrantView[]` (`confirm {send,pay,delete}: 'ask'|'never'`, `loadedAlways`), `grantConnector({…, personaId, connector, access, confirm?})` (**dono**), `revokeConnector(…)` (idempotente), `estimateConnectorGrantCost(…)` (pré-voo medido; sem medida a tela não escreve número). Pay e delete **sempre perguntam**, salvo dispensa explícita própria.

## (4) Quem pode contratar — `setPersonaCanRecruit`
```ts
setPersonaCanRecruit({ workspaceId, projectId, personaId, canRecruit: boolean }): PersonaView
```
- É "Pode contratar": a persona pode propor gente nova ao time; **cada contratação ainda pede a permissão da pessoa** (D-084). Responsável ou dono; `forbidden` para membro comum; persona inexistente → `persona-not-found`.

## Flags e contrato de leitura
`Config.teamwork` (padrão **desligada**): com ela desligada `PersonaView.teamwork` não vem e nada do TEAM vira evento. A aba mostra o bloco de equipe só quando o campo vem.

## (5) EFF-1 NO CORTE: o menu de modelos e de Capricho do Claude (Anvil, 05/11 06:35; Atlas 06:21: não sai desligado)
- **O que faltava:** o host real devolvia o menu do Codex (32 modelos, níveis por modelo) mas do **Claude** devolvia `models: []` e `defaultEffortLevels: []` — o `detectConnections` não lê o menu do Claude. A CLI já o diz: o `initialize` de controle (nenhuma mensagem de usuário: sem modelo, sem gasto) traz os modelos com `supportedEffortLevels` (claude 2.1.318: 13, níveis `low/medium/high/xhigh/max`; Opus 4.6 e Sonnet 4.6 sem `xhigh`; haiku-4-5 sem nível).
- **Agora:** `ConnectionProbe` completa o cartão do Claude com esse menu (`persona-host/src/claude-menu.ts`), **uma vez por versão** instalada. `ConnectionView.models[]` (`id`, `label`, `effortLevels[]`, `defaultEffort?`) e `defaultEffortLevels` (o menu do "Padrão do motor", a entrada `default` da CLI) por motor, como o tipo já tinha. Medido no host real: Claude `models: 12`, `defaultEffortLevels: 5`.
- **Origem:** `ConnectionView.source` = `'cli'` (o motor disse) | `'static'` (a CLI não respondeu — ausente, lenta, ou uma versão que não lista modelos — e vale a TABELA ESTÁTICA `STATIC_CLAUDE_MENU`: `default`/`opus`/`sonnet`/`fable`/`haiku` × `low…max`). A tela NÃO mostra; o diagnóstico (`exportDiagnostics().menus`) e os testes sim. Uma resposta estática não é lembrada: a CLI pode responder na próxima passada. Não há "recomendado" em lugar nenhum e nenhum modelo fixo nosso.
- **Escolha → runner:** já era gravada e entregue: `setPersonaEngine` guarda `runnerModel` (`'default'` = "Padrão do motor", nada de `--model`) e `runnerEffort` (`null` = nada de `--effort`); `specOfPersona` copia os dois para o spec do runner; o Tally os passa como `--model`/`--effort`. Provas: `engine-effort.spec` ("the choice reaches the runner of a Task turn; without a choice the spec carries no effort; a change opens a fresh session") e `persona-runners/tests/persona-effort.spec` (argv).
- **Prova:** `tests/engine-menu-claude.spec.ts` (6): o menu lido do `initialize` com a forma real (níveis por modelo, modelo sem nível = sem escolha, só níveis que o host guarda), CLI responde → `cli`, CLI ausente/lenta/sem modelos → `static` e nunca lança, o cartão do Claude traz `models` + `defaultEffortLevels` + `source`, o Codex não é tocado, cache por versão, motor não instalado não é perguntado.

## (6) EFF-1 NO LEDGER: o modelo e o Capricho de cada turno (Anvil, 07/11 13:10; SEM migração, pedido do Keel)
- **O que o runner diz** (Tally, `MeasuredUsage` de `persona-runners/src/resolve/usage-meter.ts`): `modelRequested` e `effortRequested` (a escolha da pessoa, só quando há uma), `modelDropped` (modelo que o motor não oferece: a chamada rodou no padrão, a Tarefa não se perde) e `effortDropped` (nível que o modelo recusou), além de `model` (com o que a chamada começou; `default` = o do motor). "Padrão do motor" não manda nada e não diz nada.
- **A linha do ledger** (`TurnLedgerEntry` no core = `TurnLedgerView` no fio) ganha os 5 opcionais `model`, `modelRequested`, `effortRequested`, `modelDropped`, `effortDropped`. O host mapeia no sink (`persona-host/src/engine-choice.ts` → `orchestration.ts`, ao lado de `envMode`/`envModeReason`). `model` sozinho NÃO é guardado (só ao lado de uma escolha ou de uma queda). Valor que não é identificador curto (`/^[A-Za-z0-9][\w.:[\]/-]{0,79}$/`: `claude-opus-5-5`, `opus`, `opus[1m]`, `xhigh`) fica de fora; a medição do turno nunca se perde por isso. O core recusa (`INVALID_TOKEN_LEDGER`/`ENGINE_CHOICE`) quem gravar prosa pelo Remote `recordTurnLedger`.
- **Onde fica (sem coluna nova, schema continua 25):** um JSON de detalhe em `screen_doc` (`kind = 'turn_engine'`, `id` = id da linha, `project_id` da linha), gravado na MESMA transação do `turn_ledger` e só quando há escolha ou queda; regravar a linha sem escolha apaga o detalhe. `TurnLedgerRepos.list` devolve os campos junto (LEFT JOIN); detalhe estragado sai campo a campo, a leitura nunca lança.
- **Para a prova real (Tally, Opus + Máximo):** `host.ledger.list({ projectId, personaId })` → a linha do turno traz `modelRequested: 'opus'`, `effortRequested: 'max'`, sem `modelDropped`/`effortDropped`. No banco: `turn_ledger` + `screen_doc WHERE kind = 'turn_engine'`.
- **Provas:** `persona-host/tests/eff1-ledger.host.spec.ts` (5: Opus+Máximo chega ao spec e à linha; Padrão do motor = spec sem esforço e linha muda, zero `turn_engine`; modelo/nível recusados = Tarefa segue e a linha guarda as duas quedas; valor-prosa fica de fora sem perder a linha; `engineChoiceOf`) — pelo avesso, sem o mapeamento 3 falham; `persona-store/tests/turn-ledger.spec.ts` "EFF-1: keeps the model and effort…" (gravação/leitura por projeto, sem migração, regravação apaga, prosa recusada, detalhe estragado).

## (7) P0-1 "ARTE VIRA ARQUIVO" NO HOST: a persona salva arquivos no rascunho (D-099; Anvil, 07/11 16:40; Atlas aprovou o padrão)
- **Por quê:** na tentativa 3 as personas do onboarding nasceram com `tools = {}`: `cliPermissionOf('task', {})` é `deny` e a CLI subia SEM nenhuma ferramenta (`--tools ""`); a arte foi colada no texto. O runner já separava `files`/`shell`/`web`: `files:'write'` + sem shell = `--permission-mode acceptEdits` dentro do cwd, Bash/PowerShell/WebFetch/WebSearch negados (Tally). Faltava o PADRÃO e o interruptor no host.
- **Padrão:** toda persona que o produto cria nasce com `tools = { files: 'write' }` — onboarding, contratar (`proposeHire`/`decideHire`), Gestor (prévia do plano) e `createPersona`. **A persona contratada por outra nunca tem mais acesso que a contratante:** só ganha `files:'write'` se a contratante pode salvar arquivos (teto D-081/083; `harness-hiring.spec`, `j03-hire.spec`). **MIGRAÇÃO (Keel 15:28): personas JÁ existentes (homes do H2, `tools = {}`) ficam como estão** (`canSaveFiles: false`); a pessoa liga o interruptor se quiser.
- **A trava é POR TAREFA, não por criação (`file-tools.ts`):** `toolsForTask` — numa CLI a concessão de arquivo só vale quando a Tarefa tem PASTA DE RASCUNHO (`ticket.execution.directory` diferente do `.` que é o marcador de "sem rascunho"); sem rascunho a Tarefa é só texto (a chave do runner aquecido leva `:files`, então um runner montado com a concessão nunca é reaproveitado numa Tarefa sem rascunho). Por isso o padrão pode nascer ligado SEMPRE: o onboarding cria as personas antes de a pasta existir, e quem decide é a Tarefa. Conversa, triagem e a 1ª entrega (answer-only) seguem só-texto de propósito. O motor embutido (dsh) mantém as ferramentas como estão.
- **Rascunho para quem trabalha a pedido de colega:** `prepareReview` pulava toda Tarefa com rota (`first_delivery_route`); agora a rota `mode: 'task'` (passagem, parte de plano — onde a "arte" do time acontece) ganha rascunho quando a persona executora salva arquivos; a 1ª entrega (`mode` ausente/`first-delivery`) e a persona que não salva arquivos seguem sem rascunho.
- **Nível do gateway das ferramentas PRÓPRIAS:** `gatewayToolLevel` (persona-runners, Tally) = o maior grant EXCETO as chaves de arquivo (`files`/`write`/`edit`); `index.ts` o usa em `productToolsOf` e `offeredToolsOf`. `files:'write'` sozinho deixa o gateway em `none` (só ferramentas de coordenação): nada de e-mail, navegador, computador, Telegram ou relatório. `runner.ts` segue com `toolLevelOf` (o nível NATIVO).
- **Contenção no rascunho:** `ActionBridge.arm(runner, ticketId, draftRoot)` passa `ticket.execution.directory` ao `PermissionGate.arm({ draftRoot })` (o gate nega Write/Edit/MultiEdit/NotebookEdit que saia do rascunho — realpath, `..`, outra unidade, junção); sem rascunho o gate usa o cwd do turno.
- **Interruptor "Pode salvar arquivos no rascunho" (EQUIPE-REAL-SPEC §(e)):** Remote `setPersonaCanSaveFiles({ workspaceId, projectId, personaId, canSaveFiles })` → `PersonaView` (Responsável ou dono; `forbidden`; `persona-not-found`). Ligar grava `tools.files = 'write'` (tira as chaves-apelido `write`/`edit`); desligar tira as chaves de arquivo (as demais concessões ficam). Derruba a sessão aquecida da persona. Auditoria `files`. Leitura: `PersonaView.canSaveFiles` (sempre) e `PersonaView.canSaveFilesAvailable` (sempre; `false` = o projeto da persona não tem pasta → a tela mostra o interruptor desabilitado com a frase da Muse).
- **Imagens no Revisar (contrato com o Lumen):** `ReviewFileView.afterImage` (o arquivo no rascunho), `beforeImage` e `folderImage` (o mesmo arquivo na pasta da pessoa agora; só existe se já existia lá) = data URI `png|jpeg|webp|gif|svg+xml` de até 262 144 caracteres (o teto da própria tela); maior, ou não-imagem, fica ausente ("Prévia indisponível"). Leitura confinada (`review-images.ts`): caminho relativo, sem `..`, realpath dentro da pasta (um link que sai não é seguido). O SVG sai como imagem (a tela o desenha com `<img>`, nunca inline).
- **Limites conhecidos:** (a) em pasta que é repositório git o provedor Git do engine (`persona-engine/src/review/git.ts`) lista só `git diff --numstat` e não inclui arquivo NOVO não rastreado; a pasta comum de uma pessoa (histórico privado) não é afetada; (b) personas existentes não ganham o padrão (acima); (c) "projeto sem pasta → só texto, e a persona diz isso com honestidade" depende do texto da Muse/Forge no guia da persona.
- **Provas:** `tests/file-tools.host.spec.ts` (8): puro (gateway não sobe com `files`, Tarefa sem rascunho é só-texto); padrão ligado + interruptor + ACL; Tarefa SEM pasta sem concessão de arquivo (avesso provado: sem a trava o teste falha) e COM pasta com a concessão; rascunho para rota `task` só se a persona salva arquivos; teto da contratante; leitura confinada de imagens; Revisar com `cartaz.svg` + `cartaz.png` no rascunho → `afterImage` nos dois. `harness-hiring.spec` e `j03-hire.spec` ajustados ao teto.
