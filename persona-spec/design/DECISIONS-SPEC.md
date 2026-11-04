# Uma decisão, um lugar: Aprovações e "Precisa de você"

Muse, 04/11. Item 4 do `design/UX-PHASE.md` (UX-01, UX-02, DF-010). Combinado com o Lumen. Implementação: Lumen (Aprovações, Visão geral, live store) e Anvil (id e estado no host).

## O que já existe (Lumen)

- **Aprovações:** resumo diário agrupado (com o recolher acima de 3 propostas), lista reativa "Precisa de você agora", e o `ApprovedStamp` com rajada de patinhas e saída do cartão em 750 ms (`ACCEPT_EXIT_MS`).
- **Visão geral:** o cartão "Precisa de você" recebe `attentionTitles: string[]`, ou seja, só títulos. Cada linha tem um "Revisar" que abre Aprovações.

## Os dois problemas

1. **A mesma decisão aparece duas vezes** (UX-01): no resumo de iniciativa e em "Precisa de você agora".
2. **A Visão geral não sabe qual decisão é qual.** Com títulos soltos, ela não tem como tirar a linha quando você decide em Aprovações, nem como abrir o cartão certo.

## Regra 1 · Fonte única

Um só array no live store, que alimenta as duas telas:

```ts
interface Decision {
  id: string                  // id estável do host (proposta, ticket ou attention)
  kind: 'hire' | 'vault' | 'skill' | 'proactive' | 'blocker'
  title: string               // "Contratar Lia · Redatora"
  requester: { personaId: string; name: string }
  blocking: boolean           // alguém está parado esperando você
  risk: 'low' | 'normal'      // low = dá para aprovar direto da Visão geral
  createdAt: string
  state: 'pending' | 'deciding' | 'accepted' | 'declined' | 'failed'
}
```

- **Deduplicação no store, nunca na tela:** mesmo `id` aparece uma vez só. Se o mesmo pedido chega como proposta de iniciativa e como attention, a attention vence (`blocking: true`) e a proposta some do resumo.
- **Onde cada uma aparece:**
  - `blocking: true` → "Precisa de você agora" (Aprovações) e o topo da Visão geral;
  - `blocking: false` → só o resumo diário.
- `attentionTitles` sai. A Visão geral passa a receber `decisions.filter(d => d.blocking && d.state === 'pending')`.

## Regra 2 · Decidiu, saiu de todas as listas, na hora

O ciclo é o mesmo em qualquer tela. Aprovar na Visão geral ou em Aprovações dá o mesmo resultado nas duas.

| Estado | O que a pessoa vê | Tempo |
|---|---|---|
| `pending` | O cartão normal | — |
| `deciding` | Os botões ficam desabilitados e o clicado vira `loading` (com nome acessível) | até o host responder |
| `accepted` | `ApprovedStamp animate` 1× + `PawBurst` (cooldown de 2,5 s, que já existe). O cartão sai com fade e 4 px para cima; os irmãos sobem com FLIP de 220 ms | 750 ms (`ACCEPT_EXIT_MS`) |
| `declined` | Sem carimbo: o chip neutro "Deixado de lado" e saída em 220 ms | 400 ms |
| `failed` | O cartão volta a `pending` com uma linha: "Não consegui registrar a decisão agora." + "Tentar de novo" | — |

- **Otimista e único:** o store muda para `deciding` antes de chamar o host. O cartão some de **todas** as listas ao mesmo tempo, porque elas derivam do mesmo array.
- **O contador cai junto:**
  - o chip "2 pendentes" da Visão geral;
  - o selo "Aprovações · 2" do rail;
  - o estado "precisa de você" da bandeja (Rivet), que lê o mesmo número.
- **Desfazer:** um Toast "Aprovado: Contratar Lia · Desfazer" por 6 s, **só** quando o host marca a decisão como `reversible`. Sem isso, não aparece "Desfazer" falso.
- **Foco:**
  - depois da saída, o foco vai para o próximo cartão da mesma lista ou, se ela esvaziar, para o título da seção;
  - a região `aria-live="polite"` anuncia "Aprovado: Contratar Lia".
- **Reduced-motion:** o carimbo aparece parado, sem patinhas, e a saída vira um fade de 120 ms, sem FLIP.

## Regra 3 · A Visão geral resolve o fácil e leva ao resto

Cada linha de "Precisa de você" tem:
- o retrato de quem pede e o título;
- **uma** ação:
  - `risk: 'low'` (pedido de Cofre, skill pequena): **Aprovar** direto na linha, com o mesmo ciclo da Regra 2;
  - `risk: 'normal'` (contratação, gasto, acesso): **Revisar**, que abre Aprovações **no cartão certo**, com rolagem, foco e um realce de 1,2 s (`approvals?focus=<id>`).

No máximo 3 linhas, com "Ver todas (n)" quando houver mais. O vazio continua o atual: "Nada esperando por você".

## Regra 4 · Contratação só para função que se repete (UX-02)

O cartão "Contratar {nome}?" mostra o **porquê** em uma linha, vinda do host: "Toda semana chegam contratos para revisar". Uma tarefa pontual não vira contratação, vira cartão no quadro (regra do Forge no `recommend`). Sem o porquê, a proposta **continua aparecendo**, só sem a linha. **Uma decisão pendente nunca some da tela por falta de dado**: escondê-la prende quem espera, sem aviso. A forma estrita (contratação sem porquê nem chega a ser proposta) é regra do Forge no `recommend` e do host (`ApprovalView.reason`, Anvil), não da UI. (Revisado em 04/11, achado do Lumen.)

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| decision.approve | Aprovar | Approve |
| decision.review | Revisar | Review |
| decision.declined | Deixado de lado | Set aside |
| decision.failed | Não consegui registrar a decisão agora. | I couldn’t record the decision right now. |
| decision.retry | Tentar de novo | Try again |
| decision.undoToast | Aprovado: {title} | Approved: {title} |
| decision.undo | Desfazer | Undo |
| decision.live.accepted | Aprovado: {title} | Approved: {title} |
| decision.live.declined | Deixado de lado: {title} | Set aside: {title} |
| overview.seeAllDecisions | Ver todas ({count}) | See all ({count}) |

## Aceite

1. **Teste do store:** uma proposta e uma attention com o mesmo `id` viram 1 decisão. Decidir muda as duas telas e os três contadores num único render.
2. **Teste de UI:** aprovar na Visão geral tira o cartão de Aprovações, e vice-versa. O foco vai para o próximo cartão. A região live anuncia.
3. **`failed`:** o host rejeita, o cartão volta com "Tentar de novo" e nada some sem confirmação.
4. **Capturas** antes e depois (UX-01), claro e escuro, com axe 0. Reduced-motion sem patinhas e com 0 animações infinitas.
