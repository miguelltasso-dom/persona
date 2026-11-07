# Contrato — quais conectores um pedido precisa (HT-10, D-084): `connectorsNeededBy`

Tally, 04/11. **v1.1**: a função está em código e provada (`persona-engine/src/connectors-needed.ts`, `tests/connectors-needed.spec.ts` 56 testes; exportada no índice do engine). Depende do ISO-5 (carregar o conector pedido por URL, `reports/iso5-dry.md`) e do AO-1 (`cli-isolation.md` §0). Consumidor: o roteamento do host (Bolt/Anvil); dono da função: Tally; testes secos: Tally.

## O que resolve

D-084 (Miguel): os conectores da pessoa **estão disponíveis**; "envie um email para X" **já autoriza** aquela persona a usar o conector **para aquele pedido**. Por custo e foco o runner carrega **só o conector que o pedido exige**; conversa simples carrega nenhum. Medido: um conector de 8 ferramentas custa ~+1 464 tokens por chamada (ISO-5), e carregar todos custa 377 mil (AO-1). Alguém tem que decidir, **por pedido, sem modelo** (para ser barato, testável e à prova de injeção), **quais** conectores a tarefa precisa.

## A função

```ts
// persona-engine/src/connectors-needed.ts  — pura, determinística, sem modelo (irmã de wantsWork)
interface AvailableConnector { id: string; name: string }          // da ponte (mcp_status); id = URL de proxy ou nome local
type HumanText = string & { readonly __human: unique symbol }      // marca: SÓ a mensagem da PESSOA (guarda-corpo do Keel no HT-8)

interface ConnectorsNeeded {
  chosen: readonly { id: string; rule: 'named' | 'intent'; kind: ConnectorKind }[]    // ordem estável (a da lista disponível)
  ambiguous: readonly { kind: ConnectorKind; candidates: readonly string[] }[]         // ids; o host pergunta UMA vez e lembra por persona
  missing: readonly ConnectorKind[]                                                    // pediu "email" e não há conector de email: a persona diz isso, não inventa
  capped: boolean                                                                       // havia mais de 3: pede para a pessoa restringir
}
connectorsNeededBy(text: HumanText, available: readonly AvailableConnector[]): ConnectorsNeeded
```

## Regras (todas determinísticas)

1. **Texto**: minúsculas, sem acento, espaços colapsados, palavras inteiras (`drive` não casa `driver`). **Endereços de email e links são dados, não serviços**: saem do texto antes de casar ("para ana@gmail.com" não escolhe o Gmail; o `.com` de um endereço não escolhe um conector "Cal.com"); sufixos como `com`, `org`, `io` e palavras de até 2 letras nunca contam como marca.
2. **Nomeado** (`rule: 'named'`): um conector entra se a **marca** dele aparece como palavra inteira no texto. A marca sai do `name` do conector (sem prefixos como "claude.ai" e "mcp"): `Gmail`, `Google Drive`→`drive`, `Slack`, `GitHub`, `Notion`… Vale em pt e en.
3. **Intenção** (`rule: 'intent'`): frases do léxico apontam para um **tipo**: `mail` (email, e-mail, caixa de entrada, inbox, rascunho de email, responder o email), `calendar` (agenda, calendário, reunião, evento, compromisso, horário livre), `files` (drive, planilha, documento na nuvem, pasta compartilhada), `code` (repositório, pull request, issue, commit, branch), `chat` (slack, canal, mensagem no canal), `deploy`, `db`, `shop`; `tasks` (Linear, Jira, Asana…) e `chat` (Slack, Discord, Teams…) **só entram pelo nome**, porque "tarefa", "sprint", "canal" e "pedido" são palavras do próprio produto. O tipo de cada conector vem de uma **tabela de marcas conhecidas** (Gmail/Outlook→`mail`, Calendar→`calendar`, Drive→`files`, GitHub→`code`, Slack→`chat`, Vercel→`deploy`, Supabase→`db`, Shopify→`shop`); marca desconhecida é `other` e **só entra por nome**, nunca por intenção.
4. **Um só do tipo** ⇒ `chosen`. **Vários do tipo** ⇒ `ambiguous` (o host pergunta "Gmail ou Outlook?" uma vez e lembra). **Nenhum** ⇒ `missing` (a persona avisa que não tem conector daquele tipo ligado).
5. **Negação**: o léxico de intenção é ignorado se uma negação (`não`, `nao`, `nunca`, `don't`, `do not`, `without`) estiver até 3 palavras antes ("não envie email" não pede `mail`). Um nome explícito continua valendo ("não use o Gmail" **exclui** o Gmail).
6. **Teto** de 3 conectores por chamada (custo); acima disso `capped: true` e nada é carregado além dos 3 primeiros em ordem estável.
7. **Nunca** lê descrição, instruções nem nome de ferramenta de um servidor (texto não confiável da CLI); **nunca** devolve algo que não esteja em `available`; **nunca** olha conteúdo ingerido: a assinatura exige `HumanText` e o host só cria `HumanText` a partir da mensagem da pessoa (teste de injeção no host, do Anvil).
8. **Escolher o conector não autoriza a ação.** A autorização é o pedido explícito; a classe da ferramenta (`classifyTool`: ler/alterar/enviar/pagar/apagar) e a prévia seguem valendo (`connector-grants.md`).

## Como o runner usa (ISO-5)

Cada conector em `chosen` vira uma entrada `{"serverUrl": id}` em `allowedMcpServers` (`--setting-sources local --settings …`), com o custo medido no pré-voo. Sem `chosen`, a chamada continua no piso (`answer-only`/`needed`: nada carregado). Um conector concedido que não aparece em `available` (some da conta) não é carregado, e a persona diz "o {nome} não está conectado".

## Prova seca (sem modelo, sem rede)

- tabela de ≥ 40 pedidos pt/en: "envie um email para o João" → `mail` (Gmail); "o que tenho na agenda amanhã?" → `calendar`; "salve no Drive" → `files`; "abra um pull request" → `code`; "oi, tudo bem?" → nada; "não envie email, só resuma" → nada; "use o Outlook" com Gmail e Outlook → Outlook; "responda o email" com Gmail e Outlook → `ambiguous`; "driver da impressora" não casa `drive`;
- propriedades: `chosen ⊆ available`; resultado independe da ordem dos sinônimos; mesma entrada ⇒ mesma saída; texto vazio ⇒ vazio; nunca mais de 3;
- injeção: nenhum texto que o conector devolva (descrição, nome de ferramenta) muda o resultado; a função não aceita `string` comum (erro de tipo).

## Custo e limites declarados

Léxico fechado, pt e en: pedidos em outras línguas ou muito indiretos ("manda um oi para ela") caem em `missing`/nada e a persona **pergunta** em vez de adivinhar. Crescer o léxico é aditivo e testado. A decisão por modelo (barata, mas não determinística) fica fora; se um dia entrar, entra **depois** desta função, só para o que ela deixar `ambiguous`/`missing`, e com o mesmo teto.
