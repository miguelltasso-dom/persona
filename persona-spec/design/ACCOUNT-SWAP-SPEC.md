# A troca de conta no limite, sempre visível (D-078)

Muse, 04/11.
- **Comportamento:** Tally (só troca sozinho se a pessoa escolheu "Usar a próxima quando esta chegar ao limite" ou "Dividir o uso" em Conexões).
- **Pintura:** Flint e Prism.
- **Forma:** Muse.
- **Primitivos e utilitários:** `UiIcon` (`trocar-conta`, que já existe), `Button`, `Notice`, `formatUntil`. Nenhum componente novo.

## 1. A linha da troca (no fio onde a persona trabalha)
Quando a troca automática acontece, entra **uma linha de evento** no fio, entre as mensagens, no lugar do instante da troca (uma vez por troca). Não é um Toast: fica como registro.

```
⇄  A Bia passou para a conta Pessoal: a do Trabalho chegou no limite até 18:30.   Desfazer
```
- O ícone `trocar-conta` 16 px fica em `ink-soft`; o texto, Nunito 600 13/18 `ink-soft`; o nome da persona e o da conta de destino vão em 700 `ink`.
- O Desfazer é um `Button size="s" variant="ghost"`. Sem fundo de cartão: é uma linha do fio, como os eventos de entrada ("Luna está acompanhando…").
- **"Desfazer" é honesto:**
  - ele volta para a conta de origem, e a persona **espera** até ela voltar;
  - o tooltip diz: "A Bia volta para a conta do Trabalho e espera até 18:30.";
  - depois do clique, a linha vira "A Bia voltou para a conta do Trabalho e espera até 18:30." (sem botão).
- **Na Visão geral › Agora:** a pílula da persona ganha, por 10 min, o subtítulo "na conta Pessoal". No cartão da persona, o "Agora" diz a mesma coisa.
- **A11y:** a linha entra numa `aria-live="polite"` única do fio. O botão tem o nome "Desfazer a troca de conta da Bia".

## 2. A política "Perguntar antes de trocar"
No fio, no lugar da linha, entra o `Notice tone="warning"`:
- "A conta do Trabalho chegou no limite até 18:30. A Bia pode continuar na conta Pessoal.";
- **[Continuar na Pessoal]** (primário s) · **Esperar até 18:30** (ghost).

A tarefa fica parada até a escolha. Isso conta como "Precisa de você" (DECISIONS-SPEC, `blocking: true`).

## 3. Todas as contas no limite: "No limite até {hora}" (P0-19)
- Uma **faixa acima do composer** (a mesma posição da faixa "Falta uma IA"):
  - o `spot-limite` a 48;
  - **"No limite até 18:30 · as tarefas esperam na fila."**;
  - o link "Ver uso e limites".
  - Se houver **outro motor** conectado: + "Usar {outro motor} enquanto isso" (secondary s).
- **O composer continua aceitando mensagens:** elas entram **na fila** (o balão tracejado do steer) e saem sozinhas quando a cota voltar.
  - O placeholder: "Escreva; sai quando a cota voltar às 18:30".
  - **Nunca** um composer desabilitado.
- **Quando a cota volta:** a faixa some com o Toast "A cota voltou · {n} mensagens saíram da fila".
- A hora vem do host. Sem hora, "No limite por enquanto", e nunca uma hora inventada.

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| swap.line | {persona} passou para a conta {to}: a {from} chegou no limite até {until}. | {persona} moved to the {to} account: {from} hit its limit until {until}. |
| swap.undo | Desfazer | Undo |
| swap.undoLabel | Desfazer a troca de conta de {persona} | Undo {persona}'s account switch |
| swap.undoHint | {persona} volta para a conta {from} e espera até {until}. | {persona} goes back to {from} and waits until {until}. |
| swap.undone | {persona} voltou para a conta {from} e espera até {until}. | {persona} went back to {from} and waits until {until}. |
| swap.ask | A conta {from} chegou no limite até {until}. {persona} pode continuar na conta {to}. | The {from} account hit its limit until {until}. {persona} can continue on {to}. |
| swap.askContinue | Continuar na {to} | Continue on {to} |
| swap.askWait | Esperar até {until} | Wait until {until} |
| limit.banner | No limite até {until} · as tarefas esperam na fila. | At the limit until {until} · tasks wait in the queue. |
| limit.bannerNoTime | No limite por enquanto · as tarefas esperam na fila. | At the limit for now · tasks wait in the queue. |
| limit.useOther | Usar {engine} enquanto isso | Use {engine} meanwhile |
| limit.placeholder | Escreva; sai quando a cota voltar às {time} | Write; it goes out when the quota is back at {time} |
| limit.back | A cota voltou · {n} mensagens saíram da fila | Quota is back · {n} messages left the queue |

O `{until}` é o `formatUntil` sem o "até" quando a frase já tem ("até 18:30" → "18:30"); use o `formatUntil` para "amanhã 09:00".

## Aceite
- Captura no shell real (D-074), claro/escuro, 960 e 200%, de:
  - a linha com o Desfazer, e depois do Desfazer;
  - o Notice "Perguntar";
  - a faixa "No limite" com 1 mensagem na fila.
- Teste: sem a política automática, nunca troca sozinho; a linha aparece 1× por troca.
