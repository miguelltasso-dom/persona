# "Proposta de {persona}" no #geral (P1-9): a forma

Muse, 04/11.
- **Contrato e regras:** Forge (`persona-spec/contracts/task-proposals.md`).
- **Tela:** **Flint** (realocado do Ember pelo Keel/Atlas, 23:21, para encurtar o caminho crítico). O cartão mora no `GeneralChannelView` do Prism, então o Flint combina a integração com ele. O que o Ember já tiver feito passa ao Flint por tell.
- **Primitivos:** `Card`, `Avatar`, `Button`, `Chip`, `UiIcon`, `formatWhen`. Nenhum componente novo.

## 1. A pergunta: o tom
O "Posso {verbo} {objeto}?" está **no tom**: é primeira pessoa e pede licença, como alguém da equipe. Três ajustes em 2 das 5:

| Fato | Pergunta (final) | Motivo (1 linha, só fato) |
|---|---|---|
| Parado com pergunta aberta | Posso destravar "{título}"? | {a pergunta que trava, até 90 caracteres} |
| Sem progresso há > 2 dias | Posso retomar "{título}"? | Está parado há {n} dias. |
| Prazo/evento | **Posso adiantar "{título}"? Vence {formatUntil sem "até"}.** | {o fato} |
| Erro recorrente | **Posso resolver o erro que se repete em "{título}"?** | {o fato: "Falhou 3 vezes esta semana."} |
| Objetivo parado | Posso dar o próximo passo em "{objetivo}"? | O objetivo está aberto e nada está andando. |

Os motivos:
- "cuidar do prazo" é vago; "adiantar" + quando vence diz o que acontece;
- "corrigir o erro recorrente" é técnico; "o erro que se repete" é como a pessoa fala.

As aspas são as tipográficas "…". O título é cortado em 60 caracteres, com "…".

## 2. O cartão único: "Proposta de {persona}"
É uma mensagem da persona no fio, com o **cartão dentro** (como o do plano do Gestor):
```
[rosto 32] Nina · hoje 09:10
┌───────────────────────────────────────────────┐
│ ✦ PROPOSTA DA NINA                              │
│ Posso retomar "Relatório de sexta"?             │   ← Nunito 700 16
│ Está parado há 3 dias.                          │   ← ink-soft 14
│ [Aceitar]  [Agora não]                          │
└───────────────────────────────────────────────┘
```
- **O cartão:** `Card padding="s"`, a borda esquerda de 3 px em `--persona-brand`, sem sombra de sticker (é sugestão, não pendência).
- **O eyebrow:** "PROPOSTA DA {NOME}", em Nunito 800 11, caixa alta, `brand`, com o `UiIcon` `sparkle` 14.
- **Aceitar** é `Button size="s" variant="primary"`; **Agora não** é `Button size="s" variant="ghost"`.
- **Com estimativa medida** (`estimateAsk`), uma linha `ink-soft` 12 abaixo do motivo: "≈ 1 tarefa média · uns 2 min". Sem medida, a linha não existe.

## 3. O resumo: "Propostas da equipe" (até **3** itens)
- **Até 3, que é o teto de abertas do contrato.** Com 2 itens, o leitor ainda decide sem rolar.
- É uma mensagem da **Coordenação**, com o cartão:
  - o eyebrow "PROPOSTAS DA EQUIPE · {n}";
  - **uma linha por item**: o `Avatar portrait 24` de quem propõe + a pergunta (Nunito 700 15) + o motivo (`ink-soft` 13) + os 2 botões `size="s"` alinhados à direita (Aceitar primário, Agora não ghost);
  - a divisória `--persona-outline-soft` entre os itens.
- **Abaixo de 560 px:** os botões descem para baixo do motivo.
- O teclado: a ordem natural de Tab, linha por linha. O cartão é uma `list` (`role="list"`, e cada item é `listitem`).

## 4. Depois de decidir (o estado vivo de `listTaskProposals`)
O item **vira uma linha**, com o otimismo do DECISIONS-SPEC (`deciding` → o botão em `loading`):
- **Aceita:** o `UiIcon` `check` `success` + "Aceita · virou a tarefa **{título}**", onde o título é um link que abre o cartão no quadro.
- **Agora não:** "Deixei para depois" em `ink-soft`, mais "Desfazer" (ghost s) por 6 s. O Desfazer reabre a proposta, se o host deixar; se não, sem Desfazer.
- **Expirada:** "Esta proposta expirou." em `ink-soft`, sem ação.
- **Falha ao decidir:** o item volta a aberto com "Não consegui registrar agora. Tentar de novo".
- **No resumo, cada item muda sozinho.** Quando todos foram decididos, o cartão encolhe para as linhas de estado.
- A região `aria-live` anuncia "Aceita: {pergunta}" / "Deixada para depois: {pergunta}".

## 5. A frase simples, para os clientes antigos (o texto antes do `[[task-proposal:…]]`)
- **Único:** "{persona} sugeriu: {pergunta} ({motivo})"
  - ex.: "Nina sugeriu: Posso retomar "Relatório de sexta"? (Está parado há 3 dias.)"
- **Resumo:** "A equipe tem {n} sugestões para você. Abra a Persona para responder."
- Sem emoji e sem marcação.

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| proposal.eyebrow | Proposta de {name} | Suggestion from {name} |
| proposal.digestEyebrow | Propostas da equipe · {count} | Team suggestions · {count} |
| proposal.accept | Aceitar | Accept |
| proposal.decline | Agora não | Not now |
| proposal.accepted | Aceita · virou a tarefa {title} | Accepted · became the task {title} |
| proposal.declined | Deixei para depois | Left for later |
| proposal.expired | Esta proposta expirou. | This suggestion expired. |
| proposal.failed | Não consegui registrar agora. | I couldn't record that right now. |
| proposal.retry | Tentar de novo | Try again |
| proposal.undo | Desfazer | Undo |
| proposal.live.accepted | Aceita: {question} | Accepted: {question} |
| proposal.live.declined | Deixada para depois: {question} | Left for later: {question} |
| proposal.plain.single | {name} sugeriu: {question} ({reason}) | {name} suggested: {question} ({reason}) |
| proposal.plain.digest | A equipe tem {count} sugestões para você. Abra a Persona para responder. | The team has {count} suggestions for you. Open Persona to reply. |

As perguntas por fato (§1) também entram nas duas línguas, no engine (Forge).

## Aceite
- Captura no shell real (D-074), claro/escuro, 1440, 960 e 200%, de:
  - o único;
  - o resumo com 3;
  - depois de aceitar 1 e deixar 1 para depois;
  - a expirada.
- axe 0.
- Teste: Aceitar cria 1 tarefa (a idempotência é do host); o item muda sem recarregar.
