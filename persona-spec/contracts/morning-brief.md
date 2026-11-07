# TEAM-7 — o resumo da manhã, "Bom dia" (função pura, sem IA)

Tally, 04/11 22:38. A porta é a que o Anvil propôs (22:28); eu fiz a função pura no engine e ele faz o host (rotina "Resumo da manhã" pausável, `MessageView.dailyBrief`, no máximo 1 por dia, teste LEAK-1 do cartão). Código: `persona-engine/src/morning-brief.ts`, exportado do `persona-engine`. Prova: `morning-brief.spec` (20). Spec: `design/EQUIPE-REAL-SPEC.md` (b); campos do fio: `team-real.md` §4/§7.

**Sem IA e sem custo, por construção:** é uma função pura (sem relógio, store, rede, nada assíncrono). Ela não consegue chamar modelo.

## A porta

```ts
buildMorningBrief({
  day: 'YYYY-MM-DD',                         // o dia local da pessoa
  yesterdayStartIso, todayStartIso,          // limites do dia local, em ISO (o host calcula com o fuso; ou use dayBounds)
  tasks: [{ taskId, personaId, title, state: 'running'|'waiting'|'review'|'done'|'failed'|'blocked', endedAt?, updatedAt }],
  needsYouCount,                             // aprovações + perguntas + revisões pendentes (a fila de atenção do host)
  lastBrief?: { at, signature },
  maxYesterday?,                             // padrão 3 (1..10)
}) => { yesterday: [{taskId, personaId, title}], yesterdayMore, today: [{taskId, personaId, title}], needsYou: { count }, signature } | undefined
```

`undefined` = **o host não posta nada** (não existe "dia calmo").

## Regras (todas testadas)

| Seção | Regra |
|---|---|
| **Ontem** | Tarefas `done` com `endedAt` em `[yesterdayStartIso, todayStartIso)` (início incluído, fim excluído); mais recente primeiro (empate: menor id); até `maxYesterday` linhas e `yesterdayMore` ("e mais {n}"). `failed`/`blocked` não "terminaram" |
| **Hoje** | `running`, `waiting` ou `review`; **uma linha por persona ocupada**, na Tarefa de `updatedAt` mais recente (empate: menor id, para o cartão não piscar); em ordem de `personaId` |
| **Precisa de você** | só a contagem do host |
| **Quando não posta** | nada terminou ontem, ninguém ocupado e `needsYouCount = 0` ⇒ `undefined` · a `signature` é igual à do último resumo **e** `needsYouCount = 0` ⇒ `undefined`. Se algo espera a pessoa, o resumo sai de novo mesmo com a mesma `signature` (a spec: "se nada mudou **e** nada espera a pessoa, não sai nada") |
| **signature** | hash estável dos ids de Ontem, das Tarefas de Hoje com o estado e da contagem; qualquer mudança nesses fatos a muda; a ordem da entrada não importa |
| **LEAK-1** | só `taskId`, `personaId` e o **título** da Tarefa (limpo de caracteres de controle e limitado a 120 caracteres) passam; qualquer outro campo da Tarefa (prompt, assignment) nunca sai |

## Extras puros e opcionais

- `dayBounds(day, offsetHoje, offsetOntem?)`: os dois limites ISO de um dia local (o segundo offset cobre a virada do horário de verão).
- `briefDueNow({ event: 'app-open' | 'tick', localMinutes, day, lastBriefDay? })`: a regra do "quando": a 1ª abertura do app no dia depois das **6:00**; se o app não abrir, o relógio posta às **9:00**; no máximo 1 por dia (`lastBriefDay === day` ⇒ `false`); relógio inválido nunca posta.
- `renderMorningText(brief, names)`: o corpo legível em português ("Bom dia. Ontem: Bia terminou X; Teo terminou Y e mais 1. Hoje: Bia: Z. Precisa de você: 2 coisas esperam você."). Persona sem nome na tabela sai da frase, nunca aparece como id.

## O que fica com o host (Anvil)

Rotina padrão da Coordenação, ligada em equipe nova e **só pausável** (pausada ⇒ não chama a função); guardar `lastBrief` (a `signature` e a hora); montar `needsYouCount`; o cartão `MessageView.dailyBrief` (`coordinatorPersonaId`, `routineId`, `paused`, `day`) com este resultado; conferir que o cartão não carrega texto interno.

## Dois cartões: "Bom dia · {dia}" de manhã, "Resumo do dia · {hora}" à mão depois do meio-dia (Muse, EQUIPE-REAL-SPEC §(b); 05/11)
O motor devolve `variant` no cartão (`'morning' | 'on-demand'`), para a tela nunca adivinhar:
- `briefVariant({ trigger, localMinutes })`: a rotina agendada é sempre `morning`; o pedido À MÃO (`postDailyBriefNow`) é `morning` antes das 12:00 e `on-demand` a partir das 12:00 (`BRIEF_ON_DEMAND_FROM_MINUTES` = 720); hora ilegível = `on-demand` (nunca um "Bom dia" dito às cegas).
- `briefTitle(variant, { weekday?, time? })`: `morning` → "Bom dia · {dia}" (ex.: "Bom dia · quinta"); `on-demand` → "Resumo do dia · {hora}" (ex.: "Resumo do dia · 15:40"); parte que falta = só a palavra-título. O dia da manhã não vaza para o outro cartão.
- `briefShowsSpot(variant)`: o spot do sol nascendo é só do `morning`.
- `buildMorningBrief({ …, variant? })` carrega o `variant` (padrão `morning`: o que a rotina monta) e `renderMorningText` abre com "Bom dia." ou "Resumo do dia." conforme o cartão (o corpo é o reserva do cartão: não pode cumprimentar a manhã às 15:00). A assinatura (o que mudou) NÃO depende do variant.
- **Quem liga:** o host (Anvil/Bolt) passa o `trigger` e a hora local ao `briefVariant`, põe o resultado em `MessageView.dailyBrief.variant` e na entrada do `buildMorningBrief`; a tela (Prism) escolhe título (`briefTitle`) e esconde o spot com `variant === 'on-demand'`. Texto da UI hoje: `daily.eyebrow` "Bom dia · {weekday}" → precisa de uma chave "Resumo do dia · {time}" (Muse aprova a frase).
