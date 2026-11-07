# ISO-5 — conceder um conector de CONTA do claude.ai a UMA persona, sem copiar credencial (D-083 item 2): investigação seca

Tally, 04/11 (relógio real). Pergunta do Atlas: dá para a persona que recebeu a concessão (e só ela) usar um conector da conta **sem** `--strict-mcp-config`, restringindo por permissão (`--allowedTools`/`--disallowedTools`) a só o servidor concedido, sem copiar credencial? A CLI aceita a restrição por servidor? `mcp_status`/`initialize` mostram o efeito?

**Veredito: VIÁVEL, e com uma forma mais forte do que a pedida.** A restrição por **regras de permissão não é o mecanismo certo** (ela não tira o conector do contexto nem o desconecta). O que funciona, fail-closed, só com **argumentos de lançamento** (nenhum pedido de controle, nenhum patch no OAR, nenhuma credencial copiada) é uma **lista de permissão de servidores MCP por URL**, mais a fonte de configuração `local`. Brutos em `iso5-dry.json` (só contagens).

## Como foi medido (zero modelo, login real)

`claude -p --input-format stream-json --output-format stream-json --verbose --no-session-persistence` em pasta vazia, só pedidos de **controle**: `initialize`, `mcp_status`, `get_context_usage` (o custo em tokens de cada parte do contexto, calculado localmente) e `mcp_toggle`. Nenhuma mensagem de usuário. Nada impresso além de contagens. O estado persistido em `~/.claude.json` foi conferido depois (nativo continua 21 servidores).

## Achados, na ordem em que ajudam a decidir

1. **Os conectores da conta chegam de forma assíncrona**, ~1–3 s depois do `initialize` (imediatamente: 0 servidores). Quem aplicar uma regra ou um `mcp_toggle` "no começo" deixa passar os que chegam depois. **Regra estática de lançamento não tem essa corrida.** (Minhas primeiras sondas leram 0 por isso; refeitas com espera.)
2. **Qual fonte de configuração carrega cada escopo** (`--setting-sources`): nativo/`user`/`user,project` = 21 servidores (dynamic 11, user 3, claudeai 7) e 104 comandos; `project` ou vazio = 0 servidores; **`local` = só os 7 conectores da conta** (sem os 3 MCP do usuário, sem os 11 dinâmicos, 49 comandos pessoais a menos). Ou seja: `--setting-sources local` já tira o ambiente pessoal e deixa só os conectores da conta, que é a base certa para conceder um deles. (Comportamento observado na 2.1.318, não documentado: ver risco 2.)
3. **Regras de permissão sozinhas não restringem o que o contexto enxerga.** `--permission-mode dontAsk --allowedTools mcp__<concedido>__*` deixa os 7 conectores e as 362 ferramentas no contexto (+2 875 tokens por chamada). Elas só decidem no momento da chamada de uma ferramenta, o que exige um turno de modelo para provar (fora desta investigação); como camada extra continuam úteis.
4. **Lista de negação de ferramentas** (`--disallowed-tools mcp__<servidor>`, nome de servidor simples; com `__*` a regra é inválida e **tudo some**): tira as ferramentas dos outros do que o modelo vê (362 → 8; pool diferido de 355 mil → 2 mil tokens), mas **as instruções dos servidores negados continuam no prompt** (2 065 contra 631) e eles continuam conectando. Depende de enumerar os outros servidores: um conector que chegue depois não está na lista (fail-open).
5. **`mcp_toggle` funciona** (6 desligados, 1 conectado, instruções e ferramentas sumiram), mas é um pedido de controle que o OAR **não expõe** (só `prompt`/`queue`/`abort`) e tem a corrida do achado 1. Descartado como mecanismo principal.
6. **Lista de permissão de servidores por URL — o mecanismo:** `--settings '{"allowedMcpServers":[{"serverUrl":"<url do concedido>"}]}'` com `--setting-sources local`:
   - sobra **1 servidor** (o concedido), `connected`, 8 ferramentas, **estável depois de 4 s** (nenhum atrasado);
   - por **nome** (`serverName`) **não casa** para conectores do claude.ai (0 servidores); por URL casa. A URL vem de `mcp_status.config.url` (transporte `claudeai-proxy`);
   - **fail-closed:** URL inexistente → 0; lista vazia → 0; com `--strict-mcp-config` junto → 0 (o strict vence);
   - o CLI emite um aviso em stderr "claude.ai MCP servers blocked by enterprise policy: <nomes dos bloqueados>": **nomes pessoais; o stderr da sessão não pode chegar à tela nem a log** (item de implementação).
7. **Login** igual em todas as variantes (assinatura detectada). Nenhuma credencial lida, copiada ou escrita por nós.

## Custo para a persona concedida (o aviso da tela)

Contexto inicial medido com ferramentas padrão: **isolado 32 114 tokens**; **só o conector concedido 33 578 (+1 464, ≈ +4,6%)**; os sete 34 989 (+2 875); o nativo de hoje 28 220 (menos, porque com muitas ferramentas MCP a CLI adia as ferramentas do sistema; o total é maior em número de ferramentas, não em prompt). O +1 464 é o do conector testado (8 ferramentas): **varia com o conector** (instruções do servidor + ferramentas carregadas). O pré-voo mede o número real de cada conector com `get_context_usage` (zero modelo) e a tela mostra "{persona} vai gastar mais ~{N} tokens por chamada". As definições das ferramentas (1 980 tokens aqui) entram só quando a persona as usa (diferidas).

## Receita para o runner (ISO-5)

Para uma persona Claude com conector de conta concedido:
`--setting-sources local --disable-slash-commands --settings {"allowedMcpServers":[{"serverUrl":"<url>"} …]} --permission-mode dontAsk --allowedTools mcp__<servidor normalizado>__* [--disallowed-tools <write tools>]`, mais as chaves de ambiente de segundo plano do ISO-1. Sem concessão de conta: `--strict-mcp-config` (ISO-1, como já provado). Misturar local + conta: `--strict-mcp-config` **vence** a lista de permissão, então os MCP locais concedidos entram por `--mcp-config` **somente** quando não há conector de conta; combinar os dois no mesmo lançamento fica fora até haver prova própria.

## Riscos e o que NÃO foi provado

1. **Aplicação em chamada de ferramenta** (`dontAsk` + `allowedTools` negando um servidor não concedido) não foi provada: exige um turno de modelo ou um endpoint falso que fale OAuth. A garantia aqui é mais forte e já provada: os outros **nem são registrados** (política de lançamento), e o concedido é o único que existe.
2. **Comportamento não documentado:** conectores da conta carregando sob a fonte `local` e a política casando por URL são observações da 2.1.318. Mitigação: teste seco de regressão `iso-dry.ts` na versão instalada (controle apenas) que **volta ao `--strict-mcp-config`** se o resultado mudar; e fixar a versão testada no relato de cada rodada.
3. **Janela de conexão:** os conectores continuam sendo buscados na partida; os não concedidos são bloqueados antes de registrar ferramentas, mas é a CLI (com a credencial da pessoa) que decide isso, não nós. Aceito: nenhuma credencial sai da CLI.
4. **Leitura somente (`access: read`)** para conector de conta usa o mesmo pré-voo de anotações (`readOnlyHint`) do ISO-2, agora sobre a lista de ferramentas do único servidor liberado.
5. **Latência:** ~1–3 s de espera pelos conectores a cada sessão fria (o pré-voo de anotações soma outro processo curto).
6. **Cursor/Codex:** não se aplica (Codex `partial`, Cursor `none`).

## Consequência para os contratos

`contracts/cli-isolation.md` §4: `connectorDefinitionOf` ganha o valor **`account`** ("conector da conta; concedível por política de URL; custa tokens por chamada"); `remote` fica para o que não tem como conceder (escopo `dynamic`/plugin). O id guardado pelo host para um conector de conta é a **URL de proxy** (`connector_id` do Anvil; o `name` guarda o rótulo). A tela de concessão lista os conectores da conta com o aviso de custo, como o Atlas pediu.
