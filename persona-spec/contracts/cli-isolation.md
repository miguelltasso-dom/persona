# Contrato — ambiente controlado pelo produto nas chamadas da Persona (D-081: ISO-1 isolamento, ISO-4 contadores)

Tally, 04/11 (relógio real; revisado com a prova a seco do Claude e as condições do Keel). Decisão do Atlas (D-081): **as chamadas da Persona rodam num ambiente controlado pelo produto, não no ambiente pessoal da pessoa.** Motivo principal: mandato e privacidade (uma persona só tem o acesso que `persona.tools`, a autonomia e o Cofre concedem); tokens são consequência, medida depois (OPT-10b). Este arquivo é só desenho e fatos verificados **a seco** (zero chamada de modelo). Nenhum código foi escrito: vale o congelamento D-082. Donos: runners = Tally (autorizado pelo Atlas, revisão do Rivet depois), concessão por persona = Anvil + Tally (ISO-2), tela de concessão = Muse define, Quill faz (ISO-3).

## 0. ATUALIZAÇÃO D-084 / D-085 (Miguel + Atlas, 04/11 19:55–20:10): "isolar por padrão" virou "carregar só o necessário"

**Substitui a regra de produto das seções 1–4 abaixo; o MECANISMO técnico fica.** Os conectores da pessoa (MCP locais e conectores da conta do Claude) **estão disponíveis** para as personas, sem proibição nem lista escondida: **pedido explícito = autorização** daquele pedido; iniciativa própria só com permissão permanente; ações externas irreversíveis seguem a autonomia (prévia "Sugere e espera" / "Age dentro de limites"). O que o produto controla é o que **uma chamada carrega**. As skills pessoais ficam por opção (desligada). Donos: eu = o mecanismo e o roteador (HT-10); Anvil = concessões permanentes e prévia no host.

**Por que isso importa em tokens (medido seco, argumentos reais do produto, `reports/iso-dry-product.json`):** uma chamada SEM ferramentas (`--tools ''`: conversa, triagem, 1ª entrega) abre, na config nativa desta máquina, com **377 321 tokens** de definições MCP (21 servidores, 397 ferramentas) que ela **nunca** poderia usar (`dontAsk` as nega), contra **1 608** com nada carregado. Com `--tools ''` a CLI deixa de adiar as definições MCP e carrega todas, inteiras, em toda requisição. Era UMA requisição enorme, não "7 requisições" (o 305 652 da pareada real); a variação 2×–7× vem de os conectores da conta chegarem de forma assíncrona. Chamada COM ferramentas: nativo 28 223 (diferido) contra 31 414 isolado, igual.

**Os três modos** (`PERSONA_CLI_ENV`; decisão do Atlas D-085): `native` (padrão HOJE: nada muda) · `answer-only` (**AO-1, aprovado como padrão no HASH FINAL**, não no H2 #3: só chamadas Claude SEM ferramentas carregam nada; zero perda funcional) · `needed` (todas as chamadas, com o roteador HT-10 decidindo os conectores da tarefa por URL, ISO-5; passo B, depois, com teste seco e o OK do Atlas). **VIRADO em 04/11 20:30 (AO-1, entra no corte final): `DEFAULT_CLI_ENV_MODE = 'answer-only'`** (a mudança foi uma constante e os testes do padrão). Um modo só vale para uma chamada depois de PROVADO para a versão da CLI instalada; até lá, e se a prova falhar, a chamada roda `native` e o motivo fica registrado (`IsolationDecision.reason`, `RunnerUsage.envMode`/`envModeRequested`). A PRIMEIRA chamada de uma versão nunca provada (instalação nova = a entrega de boas-vindas) **espera a prova, com limite**, e já sai isolada: `resolve-runner` chama `IsolationRuntime.settle` antes de `decide` (limite `settleMs` = 45 s, contado do INÍCIO da prova: as chamadas simultâneas de uma entrega esperam a mesma prova uma vez só, e uma prova que já passou do limite não segura mais ninguém). Medido na CLI real (2.1.318, a frio, 05/11): veredito 13 s + paridade 3,6 s = ≈ 17 s, zero modelo; com store vazio a 1ª chamada saiu `answer-only/verified` (`reports/first-call-isolated-real.json`). **Fail-safe**: se a prova não conclui no limite (lenta, travada, conta deslogada, CLI ausente) a chamada roda `native` como antes, sem travar a entrega, e a prova segue em segundo plano; a falta de login na hora da prova NÃO condena a versão (recuo de 10 min). **Pré-aquecimento**: `prewarmCliIsolation({ modelArgs })` (zero modelo, nunca lança) roda no boot real, quando a CLI é detectada e a cada versão nova (o host liga no `handleReadyEngines`, nunca no construtor), de modo que a 1ª entrega quase nunca espera. Os `modelArgs` têm de ser os mesmos que o `resolve-runner` usa (a paridade é por versão + modelo).

**Condições do Atlas para o `answer-only`, todas em código e provadas:**
1. **Zero mudança de modelo E de esforço.** Medido: isolar sem mais nada mantinha o modelo (o padrão da assinatura coincidia) mas **derrubava o esforço de `xhigh` para `medium`** (as `modelSettings` do usuário somem com `--setting-sources project`). O runner pergunta à própria CLI (`get_settings.applied`) o que o lançamento nativo aplica e passa `--model <id>` (persona com modelo `default`) e `--effort <nível>` explícitos quando o isolado divergiria. Prova real (`reports/iso-dry-ao1.json`): persona `default` nativo = opus/`xhigh`, isolado com `--model claude-opus-5-5 --effort xhigh` = opus/`xhigh`; persona `haiku` = haiku/`medium` nos dois, sem argumento extra.
2. **Login igual:** `loggedIn` verdadeiro em todas as variantes (a prova só usa pedidos de controle).
3. **Regressão por versão da CLI, fail-safe:** `IsolationRuntime.decide` (síncrono) só aplica o modo se o veredito da **versão** instalada for `ok` e a paridade do **modelo + estado das settings** estiver provada; senão a chamada roda `native` (registrado, com o motivo) e a verificação corre em segundo plano para a próxima (o chat nunca espera uma sonda; o host pode aquecer no início com `warm`). Versão nova ⇒ prova de novo; `iso-dry.ts` roda a mesma coisa à mão.
4. **O modo de cada chamada fica anotado:** `RunnerUsage.envMode` (o EFETIVO) e `envModeRequested` (só quando caiu para `native`). Falta a coluna no `turn_ledger`/UsageStore (Anvil/Forge): pedido feito.

---

## 1. A regra, em cinco linhas

1. **MCP:** só os concedidos à persona (config gerada pelo produto + `--strict-mcp-config` ou o equivalente da CLI). Nada do ambiente pessoal entra calado.
2. **Skills e comandos:** só os da Persona; os pessoais ficam fora.
3. **Memória automática pessoal e recursos de segundo plano da CLI:** desligados.
4. **Autenticação:** continua a da pessoa (assinatura ou conta já logada). **O isolamento não pode quebrar o login nem copiar credencial** (regra WAVE2 do Rivet: "never copies native credentials"); testar isso a seco primeiro.
5. **Escape explícito (ISO-2/3):** em Conexões a pessoa **concede** um conector ou MCP dela a **uma persona** ("Dar a Nina acesso ao meu Google Drive"); só então ele entra nas chamadas dela. Sem concessão = nada. Não existe "herdar tudo" como padrão (existe uma chave de desenvolvimento, §7).

## 2. O que "ambiente pessoal" é nesta máquina (fatos lidos, só contagens)

| CLI | o que o host herda hoje | de onde |
|---|---|---|
| Claude (2.1.318) | **MEDIDO a seco (`mcp_status`/`initialize`, sem modelo): 21 servidores MCP e 412 ferramentas** (escopos `dynamic` 11, `user` 3, `claudeai` 7; 8 conectados, 9 pedindo autenticação, 4 falhados) e **104 comandos** (55 nativos + 49 skills/plugins), mais o `settings.json` do usuário (modelo padrão, permissões); 0 hooks, 0 plugins, sem `CLAUDE.md` de usuário | `oar/native-cli-env.ts` remove `CLAUDE_CONFIG_DIR`: usa o `~/.claude` nativo |
| Codex (0.166.0) | **4 MCP**, plugins, hooks, skills, `AGENTS.md` do home, marketplaces | `~/.codex/config.toml` + pastas; o OAR abre `codex app-server` |
| OpenCode (1.19.3) | config global (`~/.config/opencode`) com plugins (`package.json`), agentes; 0 MCP aqui | `opencode acp` |
| Cursor | SDK embarcado (`@cursor/sdk`, em processo, sem argv); MCP só pelo que o OAR passa; **não instalado aqui** | `oar/runtimes/cursor/session.js` |

## 3. Mecanismo por CLI (o que cada uma permite) — com o que já foi provado

Legenda do estado: **provado** = verificado a seco nesta máquina; **a provar** = o mecanismo existe mas o efeito só se vê com o teste seco descrito em §5; **sem mecanismo** = não achei jeito seguro.

### Claude — nível `full` (PROVADO a seco, 04/11; `reports/iso-dry-claude.json`)
Mantém o diretório de configuração **nativo** (o login fica intocado: credenciais não são "settings") e tira o resto por argumentos e ambiente (já suportados: o OAR repassa `launchArgs` e `env`, só recusa os que ele gerencia).
- `--strict-mcp-config` + `--mcp-config` só com os concedidos (o OAR já gera o arquivo a partir de `SessionOptions.mcpServers` e o apaga ao sair). **Provado:** com `--strict-mcp-config` os 21 servidores viram **0**, nos três escopos (`dynamic`, `user` **e `claudeai`**): cobre os conectores do claude.ai.
- `--setting-sources project` (fora: settings, hooks, plugins, permissões e `CLAUDE.md` do usuário). *A provar:* que o `CLAUDE.md` do **projeto** continua entrando (é conhecimento do projeto). **Provado:** o login continua o mesmo (assinatura detectada) em todas as variantes.
- `--disable-slash-commands` (skills e comandos pessoais). **Provado:** 104 comandos viram 0 (junto com o item acima).
- Ambiente (entram no padrão): `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_DISABLE_AGENT_PROGRESS_SUMMARIES=1`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, `CLAUDE_CODE_DISABLE_ORG_MEMORY=1`. **Provado:** uma a uma, não mudam modelos, agentes, login nem MCP. Efeito sobre tokens: OPT-10b.
- **NÃO entra no padrão:** `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. **Provado** que ele encolhe o catálogo de modelos de **13 para 5** e os agentes de 6 para 5 (corta o que vem da rede): pode quebrar um alias como `haiku`. Só como braço do OPT-10b, depois de conferir os aliases.
- `--bare` **não serve** (exige chave de API; a assinatura nunca é lida nesse modo).
- Já valem hoje, não mudam: `--tools ''` em `deny`, `--permission-mode`, `--disallowed-tools`.

### OpenCode — nível `full` (provado a seco)
Sua configuração (MCP, plugins, agentes) mora em `XDG_CONFIG_HOME/opencode`; o **login mora em outro lugar** (`~/.local/share/opencode/auth.json`).
- **Provado a seco:** com `XDG_CONFIG_HOME` apontando para uma pasta vazia, `opencode mcp list` responde "No MCP servers configured" e `opencode providers list` continua mostrando a credencial (`1 credentials`). Isto é o isolamento sem tocar no login.
- Produto: `XDG_CONFIG_HOME=<pasta do produto>` (com o `opencode.json` gerado: só os MCP concedidos) em `SessionOptions.env` (o `nativeSessionEnv` zera essa variável por padrão e aceita `extra`), mais `--pure` para plugins externos. Os prompts já viajam em `OPENCODE_CONFIG_CONTENT`.

### Codex — nível `partial` (MCP pessoal NÃO isolável sem tocar no login)
- **Provado a seco (negativo):** `codex -c 'mcp_servers={}' mcp list` lista **os mesmos** servidores (a sobrescrita mescla, não limpa); `-c mcp_servers.<nome>.enabled=false` é rejeitado como configuração inválida. **Não existe `--ignore-user-config` no `app-server`** (só no `exec`, que o OAR não usa).
- Dá para desligar por recurso (`--disable hooks`, `--disable plugins`, `--disable apps`, `--disable skill_search`; existem no `codex features list`), mas **não há recurso que desligue os MCP do `config.toml`**.
- O único caminho completo é um `CODEX_HOME` do produto (config gerada, só MCP concedidos) com o `auth.json` copiado. **Não o faço por padrão:** o token de atualização do ChatGPT pode girar, e uma cópia que se atualiza invalida a original (a pessoa perderia o login no Codex dela). Só entra se o teste seco de §5 provar que a cópia e a original convivem; até lá, o Codex fica `parcial` e **a tela diz isso** (Conexões mostra "Codex usa as configurações do seu Codex"), em vez de afirmar um isolamento que não existe.

### Cursor — nível `none` até haver teste real (não instalado aqui)
SDK em processo: não há argv. O MCP vem de `SessionOptions.mcpServers`; o que o SDK lê do `~/.cursor` (e se `CURSOR_CONFIG_DIR` o redireciona) precisa de teste com a instalação real. Enquanto isso o Cursor segue com a regra D-018 ("sem MCP = `mcpTools: unavailable`") e fica **fora** da promessa de isolamento. Prova real é do Probe.

### Níveis expostos (honestidade na tela) — nomenclatura do Keel
`RunnerCapabilities.isolation: 'full' | 'partial' | 'none'` por CLI, **registrado no host** para a UI (Quill/Muse) mostrar. "Isolado" nos títulos acima = `full`. O nível é o que o produto **entrega agora**: enquanto o ISO-1 não estiver ligado no código, toda CLI responde `none`.

Condições do Keel (aceitou o Codex como `partial` sob elas): (1) a tela e o relato dizem **o que NÃO está isolado** (o nível vem com `notIsolated: string[]`, ex.: Codex → `['MCP pessoais', 'AGENTS.md do home']`); (2) o estado fica registrado por CLI no host; (3) **o `auth.json` do Codex NUNCA é copiado**: prefere-se "parcial honesto" a quebrar o login.

## 4. Concessão por persona (ISO-2, Anvil + Tally)

- Modelo: `persona.grants.mcp = [{ id, label, source: 'personal' | 'product' }]`, vazio por padrão. `personal` aponta para um conector/MCP **da pessoa pelo nome** (Drive, Gmail, …); o segredo **não** vai para o banco da Persona.
- Na hora de abrir a sessão o host lê (somente leitura) a definição do servidor no ambiente nativo, gera o `--mcp-config` temporário só com os concedidos e o apaga ao fim (o OAR já tem `handOverMcpConfig`).
- Toda concessão é visível e revogável em Conexões, vai para a trilha de auditoria e respeita o Cofre (nada de segredo em prompt).
- Persona de atendimento com Gmail concedido a *outra* persona não o vê: a concessão é por persona, nunca por equipe.

### Portas que o runner fornece ao host (assinaturas fixas; Anvil as consome no ISO-2)

```ts
// persona-runners, só leitura, sem efeito, nunca loga env/segredo, nunca devolve a definição
type ConnectorDefinition = 'local' | 'account' | 'remote' | 'missing'
connectorDefinitionOf(cli: string, id: string, source?: string): ConnectorDefinition
cliIsolation(cli: string): 'full' | 'partial' | 'none'
cliIsolationReport(cli: string): { level: 'full' | 'partial' | 'none'; notIsolated: readonly string[] }   // o que a tela diz
connectorCostOf(cli: string, id: string): Promise<{ extraTokens: number; percent: number; basisTokens: number } | undefined>   // ISO-5: pré-voo só de controle (zero modelo, ~5 s); undefined = não medido
```
- `connectorDefinitionOf`: **`local`** = há uma definição que o runner consegue copiar para a config gerada, lida na config da CLI neste computador (Claude: `mcpServers` de `~/.claude.json` e `.mcp.json` do projeto; OpenCode: chave `mcp` da config global), qualquer que seja o transporte. **`account`** (ISO-5, D-083) = conector **da conta** (Claude: escopo `claudeai` do `mcp_status`, transporte `claudeai-proxy`; Gmail, Drive…): sem definição local, mas **concedível por política de URL** (receita abaixo), sem copiar credencial; a tela avisa o custo em tokens. **`remote`** = existe para a pessoa mas **não há como conceder** (Claude: escopo `dynamic`/plugin). **`missing`** = não achei. `source` é só a dica de rótulo que a ponte do Rivet leu do `mcp_status` (`claudeai`, `dynamic`, `user`…): ela pode refinar `missing` em `remote`, **nunca** promover algo a `local`. Leitura de arquivo síncrona (só no momento de conceder). Codex/Cursor/`dsh`: `missing`.
- `cliIsolation`: tabela do que está **ligado**: Claude `full`, OpenCode `full`, Codex `partial`, Cursor `none`, demais `none`; tudo `none` com `PERSONA_CLI_ENV=native` ou enquanto o ISO-1 não estiver no código. O host recusa conceder com `isolation-partial` quando o nível não é `full` (nada gravado).
- **Consequência da prova a seco (revisada pelo ISO-5, `reports/iso5-dry.md`):** com o isolamento padrão os conectores do claude.ai saem do ambiente da persona. **Agora (D-083 item 1)** a tela de concessão lista só o que dá para conceder de verdade; para conector de conta mostra a linha honesta ("Este conector vive na sua conta do Claude. Para uma persona usar, veja a opção abaixo", ou "ainda não pode ser dado a uma persona" se o ISO-5 não for ligado). **ISO-5 provado a seco como viável:** conector de conta concedido a UMA persona = `--setting-sources local` + `--settings {"allowedMcpServers":[{"serverUrl":"<url>"}]}` (lista de permissão **por URL**: por nome não casa; fail-closed; sem credencial copiada; custo medido +1 464 tokens/chamada para um conector de 8 ferramentas, a tela avisa o número real do pré-voo). O `connector_id` guardado pelo host para `account` é essa URL de proxy. `local` continua por `--strict-mcp-config` + `--mcp-config`; combinar os dois no mesmo lançamento fica fora até haver prova (o strict vence a lista de permissão).
- **O stderr da sessão Claude carrega nomes pessoais** ("claude.ai MCP servers blocked by enterprise policy: <nomes>"): nunca vai à tela, ao relato nem a log.

### ISO-5 aprovado pelo Atlas (D-083 item 2): condições de ligação

Liga **depois do ISO-1**, com o `--strict-mcp-config` como padrão. Condições (Atlas, 04/11):
1. **Regressão a cada versão da CLI:** `iso-dry.ts` roda (só controle, zero modelo) quando a versão instalada da CLI muda. Se o comportamento mudar (a fonte `local` deixar de trazer só os conectores da conta, ou a lista de permissão por URL deixar de casar), o runner **volta ao `--strict-mcp-config`** (fail-closed) e a tela diz que o conector ficou **indisponível**. O resultado do teste vale por versão (guardado junto da versão testada); versão desconhecida = strict.
2. **O stderr nunca vaza nomes:** o aviso "claude.ai MCP servers blocked by enterprise policy: <nomes>" e qualquer stderr da sessão Claude **nunca vão à tela nem a log** (o runner descarta/oculta o stderr dessas sessões; teste: o stderr sintético com nome de conector não aparece em nenhum `RunEvent`, relato nem log).
3. **O pré-voo mede o custo real:** `connectorCostOf(cli, id)` (porta acima) abre uma sessão só de controle com a política do conector e compara `get_context_usage.totalTokens` com e sem ele. A tela mostra "{persona} vai gastar ~+X% por chamada" **antes** de a pessoa confirmar a concessão. Sem medida, a tela não escreve número.
4. **Concessão por persona e por conector (URL), revogar em 1 clique** (Anvil grava, Quill faz a tela, Muse dá a forma). O `connector_id` de conector da conta é a URL de proxy; revogar evicta a sessão quente (fingerprint no `warmKey`).

### ISO-5 — EM CÓDIGO (runner), provado a seco com a CLI real (Tally, 04/11 21:40)

**O que a chamada faz.** Modo `needed` + chamada COM ferramentas + o roteador (HT-10) escolheu conectores da conta: o runner lança `claude` com `--setting-sources local,project --disable-slash-commands` (SEM `--strict-mcp-config`: o strict vence e bloqueia todos) e UM `--settings {"allowedMcpServers":[{"serverUrl":<url>}]}`. O `--settings` é único: a lista de permissão por URL e o gancho do gate (HT-8/9) são mesclados (`mergeFlagSettings`: ganchos concatenados, listas unidas). Só Claude; outras CLIs e os modos `native`/`answer-only` nunca carregam conector.

**Como o host liga (assinaturas reais; difere do esboço da porta acima porque a prova é por versão da CLI e por URL):**
```ts
resolveRunner({ ..., accountConnectors: readonly string[] })        // URLs de proxy que ESTA chamada precisa (roteador); vazio = chão
const iso = defaultIsolationRuntime(installation.command)          // um por comando; guarda as provas em arquivo
await iso.connectorCostOf({ version, url })   // ConnectorProbe | undefined — pré-voo da TELA, antes de confirmar
await iso.connectorsReady({ version, urls })  // { usable, dropped } — a prova que o runner faz sozinho, 1x por versão e conector
```
`ConnectorProbe = { ok, status: 'connected'|'needs-auth'|'failed'|'absent'|'many'|'no-login', extraTokens?, percent?, basisTokens? }`. A tela escreve "a {persona} vai gastar ~+{percent}% por chamada" só com `ok` e `percent`; sem número (`undefined`/sem `percent`) a tela não inventa. `connector_id` = a URL de proxy (`mcp_status.config.url`); revogar evicta a sessão quente (o pool inclui o fingerprint dos conectores na chave).

**Garantias (testes `account-connectors.spec`, 22):**
- **Falha fechada.** Conector que pede login, que falhou, que sumiu da conta, perda do login, ou a CLI deixar de respeitar a lista (aparece mais de um servidor) ⇒ `ok:false` ⇒ o conector é DESCARTADO e a chamada roda no chão com os demais; o uso registra `connectorsLoaded` e `connectorsDropped`. Versão desconhecida da CLI ⇒ nada é provado ⇒ nada é carregado.
- **Prova por versão (condição 1 do Atlas).** Cache por (versão, hash da URL): "usável" vale para a versão; "não usável" é revisto após 5 min (a pessoa pode ter autenticado). Pré-voo que não responde em 40 s derruba o conector em vez de pendurar a chamada. Só o HASH da URL vai ao arquivo de provas, nunca a URL nem nome de conector.
- **Sem vazamento (condição 2).** `redactCliStderr` nos dois pontos de erro do adaptador; o stderr dos pedidos de controle é descartado.
- **Custo real (condição 3).** Medido com o código do produto contra a CLI 2.1.318 (`reports/iso5-preflight-dry.json`, zero modelo): três conectores reais conectados custam **+1.464 / +375 / +445 tokens por chamada** sobre um chão de 31.414 (+4,7% / +1,2% / +1,4%). A prova inline do primeiro uso leva 8–13 s (uma vez por versão e conector): a tela chama `connectorCostOf` ANTES do confirmar e a chamada já encontra o cache.
- **Convivência com o gate.** `ownServers` (o host passa `[DEFAULT_TOOL_SERVER]`): o gate não opina em `mcp__persona__*` (ACL/aprovação do gateway HT-0 decidem; combinado com o Rivet); nome parecido (`personal`, `persona2`) continua controlado.

**Limites conhecidos.** Só controle foi provado a seco com conector real; a chamada de modelo com o conector carregado (o conector responde de verdade, o custo medido pelo vendor) é o passo B (`needed`), depende do OK do Atlas. O `--settings` de gate + conector junto está provado por teste de argumentos e pelo gate contra a CLI real separadamente, não por uma sessão com os dois ao mesmo tempo. Conectores que não são de proxy do claude.ai (MCP local do `~/.claude.json`) seguem pelo `--mcp-config` do ISO-2, não por aqui.

### HT-11 — skills pessoais por opção, EM CÓDIGO (runner), provado a seco com a CLI real (Tally, 04/11 22:00)

**Regra.** "Usar minhas skills do Claude" é uma opção de Configurações, **desligada por padrão**. Desligada: nenhuma skill pessoal (o chão tem `--disable-slash-commands`, e a fonte `user` nunca é pedida). Ligada: as skills da pessoa entram, e **só elas**.

**Mecanismo (medido, `reports/ht11-skills-dry.json`, `-dry2.json`, `-dry3.json`, `ht11-skills-preflight.json`; zero modelo).** A saída óbvia, pedir a fonte `user` (`--setting-sources user,project`), traz as skills mas também o `settings.json` da pessoa: mudou o esforço aplicado (`medium` → `xhigh`) e carregaria a lista `permissions.allow` dela. **Descartada.** O que funciona: uma pasta do PRODUTO com `.claude/skills/<nome>` apontando (junção no Windows, link simbólico nos outros) para cada pasta de skill da pessoa, passada com `--add-dir <pasta>`, e `--disable-slash-commands` removido. Ponteiro, não cópia: o produto só lista o diretório e confere se existe `SKILL.md`, nunca lê o conteúdo e nunca escreve na pasta da pessoa; tirar um ponteiro não toca a skill (testado). Nesta máquina: 21 skills apontadas, 21 comandos a mais, modelo e esforço idênticos, zero servidor MCP a mais.

**Quando vale.** Só modo `needed`, só chamada COM ferramentas, só Claude. No `answer-only` (padrão do corte final) a tarefa roda nativa e já tem tudo; a opção só passa a decidir de verdade quando o `needed` ligar. Chamada sem ferramentas nunca recebe a pasta.

**Prova por versão (mesma regra do ISO-5).** `IsolationRuntime.skillsReady({ version, root })`: abre dois lançamentos de controle (com e sem a pasta) e só aceita se a pasta acrescentou comandos E modelo, esforço e servidores MCP ficaram iguais (senão `leaks-settings`/`none`/`no-login`, fail-closed). Cache por versão, "não" revisto em 5 min, 40 s de limite. Reprovada ou sem skills: a chamada roda no chão e o uso diz `personalSkills: 'dropped'`; carregada: `'loaded'`; opção desligada: o campo não existe.

**Como o host liga.** `resolveRunner({ ..., personalSkills: true })` (ou `{ source?, root? }` nos testes). A chave do pool inclui as skills (trocar a opção evicta a sessão quente). Custo: o total de contexto de abertura medido NÃO sobe (23.899 com ou sem as skills pessoais: a CLI desloca ferramentas embutidas para "adiadas" quando há skills); o custo real por chamada com o modelo só um passo B mede. **A tela não promete percentual para skills**; pode dizer quantas skills serão carregadas (`syncSkillsRoot().count`, ponteiros contados) e que a pessoa pode desligar a qualquer hora.

**Correção do meu ISO-5 achada aqui.** O modo conector usava `--setting-sources local` sozinho, e a fonte `local` **derruba o `CLAUDE.md` do projeto** (projeto de teste: 419 tokens de memória no chão, 0 com `local`, 419 de volta com `local,project`; `reports/ht11-skills-dry3.json`). A persona perderia as instruções do projeto justo nas chamadas com conector. Agora `local,project`: o conector continua sendo o único servidor, o servidor do `.mcp.json` do projeto não carrega, o `CLAUDE.md` volta, e a pasta de skills também carrega junto (necessária para o HT-11). Custos dos três conectores reais idênticos (+1.464/+375/+445). Teste de regressão em `account-connectors.spec`.

**Limites.** Uma skill pode declarar `allowed-tools` no próprio cabeçalho: isso é da skill da pessoa e vale quando a pessoa a liga; as regras de recusa da persona (`disallowedTools`) e o gate de MCP continuam valendo por cima. A prova é de CONTROLE: nenhuma skill foi invocada por um modelo.

## 5. Testes secos primeiro (zero chamada de modelo, login real)

Provar **antes** de ligar qualquer coisa, em ordem:
1. **Claude, login preservado — FEITO (04/11, zero modelo; `reports/iso-dry-claude.json`).** `claude -p --input-format stream-json --output-format stream-json --verbose --no-session-persistence`, só `initialize` e `mcp_status`, em pasta vazia, 0 quadros de modelo. A: nativo = 21 MCP / 412 ferramentas / 104 comandos, logado (assinatura). B (`--strict-mcp-config`): 0 MCP em todos os escopos, logado. C (+ `--setting-sources project --disable-slash-commands`): 0 comandos, logado. D (+ 5 chaves de ambiente): 0 e logado, **mas** modelos 13→5; separando, o culpado é só `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Fica provado que o isolamento por argumentos **não toca no login e cobre os conectores do claude.ai**. Falta, para os concedidos: abrir com `--mcp-config` de um servidor local conhecido e ver que só ele aparece no `mcp_status` (teste do `iso-dry.ts` depois do hash).
2. **OpenCode:** repetir o que já foi provado, agora pelo caminho do OAR (`opencode acp` com `XDG_CONFIG_HOME` do produto): credencial presente, 0 MCP pessoais.
3. **Codex:** `codex login status` com `CODEX_HOME` nativo (baseline) e, **numa cópia descartável do `auth.json`**, o efeito de uma atualização de token sobre a original (se o ambiente de teste permitir sem tocar na conta real); sem prova, fica `parcial`.
4. **Regressão offline:** `scriptedRuntime` do OAR (Rivet: testes de `resolve-runner` passam `options.env` explícito, não mexem em `process.env`): o plano de isolamento gera exatamente os argumentos e o ambiente do §3, e `--tools ''`/`deny` continuam presentes.
5. **Censo local** (`scripts/census-cli-requests.ts`, servidor Anthropic falso): confirmar que as flags não quebram a abertura da sessão e que continua 1 requisição por chamada.

## 6. ISO-4 — contadores do laço principal e resumo do `system/init` (aprovado sem gasto, D-081 a)

- `RunnerUsage` ganha **opcionais**: `mainLoopInputTokens?`, `mainLoopOutputTokens?` (ao lado do `total`, que não muda) e `environment?: { tools, mcpServers, skills, slashCommands, plugins, model? }` (**só contagens**, sem nomes: nome de conector é dado pessoal).
- Fonte, sem estimar nada: `session.usage().value`. O laço principal é o `byAgent` do agente raiz (`agentPath.length === 0`); sem `byAgent` e sem `unattributed`, o total **é** o do agente raiz; com `unattributed` e sem entrada raiz, o campo fica **ausente** (nunca um palpite). O auxiliar é `total − laço principal` (o OAR já o expõe como `unattributed`).
- Resumo do ambiente: `session.records()` → quadro `system/init` (`native.tools`, `mcp_servers`, `skills`, `slash_commands`, `plugins`, `model`) → contagens.
- Aditivo no `withUsageMeter` (Rivet: acrescentar junto de `meterCacheOf`/`durationMs`, sem reformatar) para chegar ao `MeasuredUsage`; **colunas do livro** (migração) ficam para depois, com Anvil/Forge; o harness da OPT-8b e da OPT-10b lê direto do `RunnerUsage`.
- Provas: `scriptedRuntime` com `byAgent`/`unattributed` fabricados (raiz só; raiz + auxiliar; sem raiz) e `records()` com um `system/init` fabricado.

## 7. Plano de arquivos (assim que o Keel anunciar o fim do congelamento)

Arquivos **novos** em `persona-runners` (Keel/Rivet: só aditivo nos existentes):
- `src/oar/usage-detail.ts` — puro: `mainLoopOf(usage)`, `environmentOf(records)`.
- `src/oar/isolation.ts` — puro: `isolationPlan({ cli, grants, native })` → `{ launchArgs, env, mcpServers, level }`; não lê nem escreve nada fora do que recebe.
- `tests/usage-detail.spec.ts`, `tests/isolation-plan.spec.ts`.
- `scripts/iso-dry.ts` — o teste seco do §5.1/§5.2 (login real, zero modelo; trava `check`, nunca `real`).
Aditivos nos existentes: `contract.ts` (campos opcionais de `RunnerUsage`, `isolation` em `RunnerCapabilities`), `oar/adapter.ts` (`usageOf` lê `byAgent`/`records`; **nenhuma** mudança de comportamento), `resolve/cli-policy.ts` e `resolve/resolve-runner.ts` (o plano de isolamento entra na política e no `env` da sessão), `usage-meter.ts` (repasse).

Ordem: **ISO-4** (pequeno, sem efeito no comportamento) → **ISO-1** plano puro + teste seco de login → ligar por padrão. Chave de desenvolvimento/suporte `PERSONA_CLI_ENV=native` volta ao comportamento antigo; **não** é o escape do produto (o escape é a concessão).

## 8. Riscos declarados

- **Login:** qualquer cópia de credencial é proibida por padrão (token que gira). Claude e OpenCode não precisam de cópia (provado a seco); Codex fica `partial` por isso.
- **Cobertura do `--strict-mcp-config` para os conectores do claude.ai:** PROVADA a seco (§5.1). O efeito colateral é de produto: esses conectores não são concediveis (§4).
- **Qualidade:** tarefas que dependiam de skill ou MCP pessoal deixam de tê-los **por desenho**. O critério de pronto das 3 tarefas do `pair-real` roda com o isolamento como um dos braços (OPT-10b) antes de qualquer afirmação de ganho.
- **Efeito em tokens:** hipótese, não resultado. Nada disto promete corte: OPT-10b mede.
