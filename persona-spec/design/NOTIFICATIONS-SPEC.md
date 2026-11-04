# Avisos só quando importa (UX-PHASE nº 9)

Muse, 04/11.
- **Conteúdo e regra:** Muse.
- **Implementação:** Rivet (`apps/desktop/src/notifications.ts`, `locale.ts`, `main.ts`), com o Anvil (os eventos e o `getAutonomy`).
- **Referências do refcat** (as telas estão bloqueadas; uso o fluxo e os textos-chave):
  - Slack "Notifications" (iOS, 04/06/2024): por tipo de evento;
  - Microsoft Teams "Updating meeting notification settings" (iOS, 18/10/2023): "Notify me for…";
  - GitHub "Customize your experience" (iOS, 09/11/2021): "Working Hours", ou seja, silêncio por horário.
- O padrão comum: escolher **por tipo de evento**, mais **horas de silêncio**. É o que a base do Rivet já tem (orçamento, silêncio, agrupamento) e o que falta no conteúdo.

## O que já existe (Rivet)
`DesktopNotifications`, com:
- o orçamento diário (padrão 3);
- a janela de silêncio (padrão 22h–7h);
- o modo `summary`/`ping`;
- o agrupamento ("{count} updates while you were busy");
- os links internos para a tarefa;
- o dedupe por id.

Os eventos são só `needs-you` e `review`, com títulos genéricos ("Precisa de você", "Pronto para revisar"), sem rosto e sem o nome de quem fez.

## 1. Quais eventos avisam (e nenhum outro)

| Evento (`kind`) | Quando | Respeita o orçamento? | Respeita o silêncio? |
|---|---|---|---|
| `needs-you` | Uma decisão `blocking` nova (DECISIONS-SPEC) | não: sempre conta, mas nunca é cortado | sim (guarda para o resumo) |
| `question` (novo) | Uma persona fez uma pergunta direta à pessoa num fio | não | sim |
| `failed` (novo) | Uma tarefa falhou com um código da RUN-ERRORS-SPEC | não | sim |
| `done` (novo) | Uma tarefa **pedida pela pessoa** terminou | **sim** | sim |
| `review` | Um rascunho está pronto para revisar (SW-7) | sim | sim |

**Nunca avisam:** mensagem de persona para persona, progresso ("leu o Cofre…"), rotina que rodou sem nada de novo, contratação proposta sem `blocking`, ou qualquer coisa que a própria pessoa acabou de fazer.

## 2. Silêncio com a janela em foco
- Se a janela da Persona está **em foco** e visível, **nenhum aviso nativo** aparece; o app já mostra tudo.
- Com a janela minimizada, em segundo plano ou na bandeja, o aviso aparece.
- O evento ainda conta para a bandeja ("Precisa de você · 2").

**Hoje o `ingest` não confere o foco.** Proposta: o `DesktopNotificationsOptions` ganha `isAppFocused: () => boolean`, com `mainWindow.isFocused() && mainWindow.isVisible()`, como o `update-attention.ts` já faz.

## 3. Forma do aviso

**Rosto:** o ícone é o avatar da persona.
- O Windows não lê webp no `nativeImage`, então são PNGs de **128²** por bicho, os 17 mais os novos, gerados pelo `build-assets` (Muse) em `apps/desktop/resources/notify-avatars/{id}.png` (~10 KB cada).
- No agrupado e nos eventos sem persona, o ícone é o do app.

**Título:** o nome da persona + o verbo. **Corpo:** o nome da tarefa, entre aspas tipográficas, no máximo 80 caracteres e com "…".

| `kind` | Título pt-BR | Título en | Corpo |
|---|---|---|---|
| `done` | {persona} terminou | {persona} finished | "{tarefa}" |
| `review` | {persona} deixou mudanças para você revisar | {persona} has changes for you to review | "{tarefa}" · Nada muda na sua pasta até você aplicar. |
| `needs-you` | {persona} precisa de você | {persona} needs you | {título da decisão} |
| `question` | {persona} perguntou | {persona} asked | {o começo da pergunta, até 80 caracteres} |
| `failed` | {persona} não conseguiu terminar | {persona} couldn’t finish | {o texto curto do código da RUN-ERRORS-SPEC}, ex.: "O Claude não está conectado neste computador." |
| agrupado | Enquanto você estava fora | While you were away | {n} coisas esperam você · {m} entregas | {n} things need you · {m} deliveries |

**Regras do texto:**
- nada de "Notification", "Persona App" nem "Alerta";
- nada de culpa ("Você esqueceu…");
- nunca o id da tarefa;
- "{persona}" é o nome dado pela pessoa ("Bia"), nunca o bicho ("raposa").

**Clique:** abre a Persona **no lugar exato**:
- `done`, `question` e `failed`: o fio da tarefa;
- `review`: o Revisar;
- `needs-you`: Aprovações com `focus=<id>`;
- o agrupado: a Visão geral.

O aviso some sozinho; nunca fica fixo na tela.

## 4. Orçamento e resumo
- O orçamento diário (padrão 3) vale só para `done` e `review`. Passou do limite, eles vão para o resumo.
- `needs-you`, `question` e `failed` sempre avisam fora do silêncio, porque alguém está parado.
- **Fim do silêncio:** um **único** aviso agrupado, nunca uma rajada. O resumo diário (opcional, desligado por padrão) é esse mesmo aviso, numa hora escolhida.
- **Dedupe:** o mesmo id avisa uma vez só. Se o evento já foi resolvido no app antes de o aviso sair (por exemplo, decidido em outro computador), ele não aparece.

## 5. Configurações (Configurações › Avisos)
`ChoiceCards`, com a legenda "Quando avisar fora do app":
1. **Só o que precisa de mim** (recomendado): "Decisões, perguntas e falhas. Entregas ficam para o resumo."
2. **Também as entregas**: "Inclui quando uma tarefa sua termina, até {n} por dia."
3. **Nada fora do app**: "Você vê tudo quando abrir a Persona."

Abaixo:
- o `Switch` **"Silêncio à noite"**, com o horário (22h–7h);
- o `Switch` **"Resumo diário"**, com o horário.

Texto do rodapé: "Com a Persona aberta na tela, não aparece aviso."

## 6. Texto novo (locale do desktop e do client)

| Chave | pt-BR | en |
|---|---|---|
| notify.done.title | {persona} terminou | {persona} finished |
| notify.review.title | {persona} deixou mudanças para você revisar | {persona} has changes for you to review |
| notify.review.body | "{task}" · Nada muda na sua pasta até você aplicar. | "{task}" · Nothing changes in your folder until you apply. |
| notify.needsYou.title | {persona} precisa de você | {persona} needs you |
| notify.question.title | {persona} perguntou | {persona} asked |
| notify.failed.title | {persona} não conseguiu terminar | {persona} couldn’t finish |
| notify.grouped.title | Enquanto você estava fora | While you were away |
| notify.grouped.body | {needs} coisas esperam você · {done} entregas | {needs} things need you · {done} deliveries |
| settings.notify.legend | Quando avisar fora do app | When to notify outside the app |
| settings.notify.needsOnly | Só o que precisa de mim | Only what needs me |
| settings.notify.needsOnlyBody | Decisões, perguntas e falhas. Entregas ficam para o resumo. | Decisions, questions and failures. Deliveries wait for the summary. |
| settings.notify.withDone | Também as entregas | Deliveries too |
| settings.notify.withDoneBody | Inclui quando uma tarefa sua termina, até {n} por dia. | Includes when your task finishes, up to {n} a day. |
| settings.notify.none | Nada fora do app | Nothing outside the app |
| settings.notify.noneBody | Você vê tudo quando abrir a Persona. | You’ll see everything when you open Persona. |
| settings.notify.quiet | Silêncio à noite | Quiet at night |
| settings.notify.digest | Resumo diário | Daily summary |
| settings.notify.focusNote | Com a Persona aberta na tela, não aparece aviso. | No notifications while Persona is on screen. |

O plural do agrupado ("1 coisa espera você", "1 entrega") usa as formas `.one`.

## Aceite
1. **Teste de unidade do `DesktopNotifications`:**
   - em foco → 0 avisos;
   - `failed` com o orçamento esgotado → avisa;
   - `done` com o orçamento esgotado → resumo;
   - o fim do silêncio → 1 aviso agrupado;
   - o mesmo id 2× → 1 aviso.
2. **Captura do aviso no Windows** (Rivet ou Probe), com o rosto e o título "{persona} terminou", em pt e en.
3. **O clique** abre o fio certo (E2E com deep link).
4. **Nenhum aviso** fora da lista do §1 (teste com um evento de progresso → 0 avisos).
