# Contrato (PROPOSTA) — `grantConnectorByName`: marcar o 1º rosto de "Quem pode usar?" sem conhecer o conector (item 26)

Autor: Flint (UI, 12/11 07:00). Dono do host: Anvil/Zinc/Forge (depois de 00:00, ou Flint se o Keel liberar; é um gancho pequeno em `index.ts`, arquivo quente). Base: `connector-grants.md` (D-084), `getConnectorCatalog` (26.4).

## O problema
O painel "Quem pode usar?" da aba Ferramentas (item 26, fatia 2) só consegue MARCAR mais um rosto reusando o `ConnectorRef` (`cli`, `id`) de uma concessão que já existe. Uma ferramenta ligada na conta do Claude, mas que ninguém ainda recebeu, não tem concessão: a UI só conhece o NOME do cartão ("Mercado Livre"), e hoje diz "ligue de novo pelo botão Conectar". Não existe Remote que liste os `ConnectorRef` disponíveis, e **não devemos criar um**: o `id` de um conector da conta é a URL do proxy ("nunca mostrado à pessoa", `connector-grants.md`), e passá-lo pela tela só para devolvê-lo ao host é vazamento sem ganho.

## A proposta: o host resolve pelo NOME
```ts
/** Dá a UMA persona uma ferramenta do catálogo, pelo nome do cartão. Só o dono do workspace. */
@Remote grantConnectorByName(request: GrantConnectorByNameRequest): ConnectorGrantView
interface GrantConnectorByNameRequest { workspaceId; projectId; personaId: string; name: string; access?: 'read' | 'write' /* padrão 'read' */ }
```
- **Resolução (no host):** `availableConnectors(<cli da persona>)`, casando o nome como o catálogo casa o `linked` (sem acento e sem caixa; um contém o outro). Preferir a igualdade exata; mais de um candidato sem igualdade exata = recusa `ambiguous`.
- **Depois da resolução é o MESMO caminho de `grantConnector`** (`connectorGrants.grant`): mesmas recusas tipadas (`not-grantable`, `isolation-partial`, `limit-reached`), mesma auditoria ("Nina passou a usar Mercado Livre", Desfazer = `revokeConnector`), `confirm` padrão `ask` para `send`/`pay`/`delete`. Nada de classe dispensada por este Remote.
- **Recusas novas, tipadas, com a frase pronta para a tela:** `not-available` ("A conta ainda não tem Mercado Livre: ligue pelo botão Conectar."), `ambiguous` ("Achei mais de um com esse nome."), além das de `grantConnector`. Só o dono (`requireGovOwner`), como o `grantConnector`.
- **Idempotente:** marcar quem já tem devolve a concessão existente.

## O que muda na UI (Flint, ~15 linhas)
`ConnectedWho.onToggle`: sem `ref` conhecido, e se o host tem `grantConnectorByName`, chama-o com `card.name` (detecção por `typeof`, como as outras chamadas); sem ele, a lista segue como hoje (leitura, "ligue de novo pelo Conectar"). Os `ref` por concessão continuam valendo (nenhum caminho antigo muda).

## Testes que o host deve trazer
1. dono concede por nome → `ConnectorGrantView` com `cli`/`connectorId` certos; não-dono é recusado; 2. nome sem conector na CLI da persona → `not-available` e NADA gravado; 3. dois candidatos sem igualdade exata → `ambiguous`; com igualdade exata, ganha ela; 4. repetir → idempotente (1 concessão); 5. `confirm` fica `ask` nas três classes; 6. o `id` do conector NUNCA aparece na resposta de erro nem no log; 7. a auditoria é a mesma do `grantConnector`.

## Alternativa descartada
`listConnectorRefs` devolvendo `cli`/`id`/`nome` à UI: expõe a URL do proxy (o `id` das contas), obriga a UI a repetir a regra de casar nomes e abre uma 2ª forma de errar o conector. Se o Keel preferir mesmo assim: devolver só `{ refId opaco, name, cli }` e aceitar `refId` no `grantConnector`.
