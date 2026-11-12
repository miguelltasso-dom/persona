# Contrato — Regras da casa e Janela de silêncio (HONEST-1)

Dono: **Bolt** (host) · gate: `persona-runners/src/resolve/permission-gate.ts` · telas: **Lumen** · toast: `apps/desktop`.

Regra de ouro (Atlas 11/11): **uma regra que a pessoa salva e o motor ignora é o pior tipo de mentira.** A tela só oferece o que o host OBEDECE; o resto é "anotado" e não promete nada.

## `getRuleKinds(scope) → RuleKindsView`

A lista FECHADA do que o host obedece. A tela mostra só estes tipos.

```ts
{
  kinds: [
    { kind: 'never-spend',   enforcedBy: 'gate' },     // "Nunca aprovar gasto sem mim"  → ferramenta de pagar (classe `pay`)
    { kind: 'never-send',    enforcedBy: 'gate' },     // "Nunca enviar sem mim"         → classe `send`
    { kind: 'never-publish', enforcedBy: 'gate' },     // "Nunca publicar sem mim"       → só os verbos publish/post/tweet/broadcast/share
    { kind: 'never-delete',  enforcedBy: 'gate' },     // "Nunca apagar sem mim"         → classe `delete`
    { kind: 'never-hire',    enforcedBy: 'harness' },  // "Nunca contratar sem mim"      → fecha o "Contratar direto"
  ],
  quietWindow: { enforced: true, holds: ['initiative', 'routine', 'plan', 'proposal', 'brief'], directRequestsAnswered: true },
}
```

## Regras (`listTriageRules` / `putTriageRule` / `deleteTriageRule`)

| Campo | Onde | Significado |
|---|---|---|
| `kind?` | `PutTriageRuleRequest`, `TriageRuleView` | Um dos 5 acima. **Só com `kind` o host obedece.** Outro valor ⇒ erro `rule-kind-unknown` (nada é gravado). |
| `enforced` | `TriageRuleView` | `true` só quando há `kind` que o host obedece. Regra só de texto = `false`: a tela NÃO promete nada nela ("Anotado; ainda não muda o que a equipe faz"). |
| `applied` | `TriageRuleView`, `QuietWindowView` | `{ total, thisWeek, lastAt?, lastWhat? }`: quantas vezes a regra/janela REALMENTE barrou/segurou. "Barrou 2 gastos esta semana" = `applied.thisWeek`. `lastWhat` ex.: `pagar pelo Gmail`. |

As travas valem para **toda a equipe, em todo turno** (o gate é rearmado a cada turno: salvar ou apagar a regra vale já no próximo turno).

### Como cada trava é cumprida (determinístico, sem instrução de texto)

- `never-spend` / `never-send` / `never-delete`: a classe sai do que a persona pode fazer SOZINHA (`ActionBridge.arm` tira a classe do `preAllow`, qualquer autonomia/permissão permanente). A chamada é negada pelo hook, vira UM cartão em Aprovações com o conteúdo real e a Tarefa espera a pessoa.
- `never-publish`: o gate recebe `askVerbs` (palavras inteiras do nome da ferramenta): `publish_page` e `send_tweet` pedem aprovação; `send_email` segue o caminho normal.
- `never-hire`: `persona_hire` nunca é direto; é sempre um cartão de contratação. Só conta na regra o que ela MUDOU (hire que seria direto).
- A trava para a PERSONA, nunca para a PESSOA: a aprovação dela no cartão deixa passar EXATAMENTE aquela chamada, uma vez (mesmo mecanismo de "aprovar = rodar de novo").
- `pay` e `delete` já eram sempre perguntados; a regra é uma segunda parede e conta o que segurou.
- CLIs sem hook de gate (não-Claude) só leem: as travas valem por construção.

## Janela de silêncio (`listQuietWindows` / `putQuietWindow`)

`quiet_window` = **silêncio da equipe inteira**, na hora LOCAL da pessoa (`timezoneOffsetMinutes`), mesma aritmética do silêncio da Coordenação (`proactivity.ts#silenceUntilOf`; janela noturna atravessa a meia-noite; o fim é exclusivo).

Dentro da janela a equipe NÃO começa nada sozinha: iniciativa (inclui eventos externos), rotina, plano da Coordenação, cartão de propostas e resumo da manhã. O que foi segurado continua devido e roda quando a janela acaba (regra de catch-up da própria rotina). **Pedido DIRETO da pessoa continua respondido** (`directRequestsAnswered`). Última parede: `postTeamRequest` recusa `initiative`/`plan` dentro da janela.

Não é "iniciativa" (e portanto não é segurado): recuperar Tarefa parada ou que falhou (`pull`/`retryFailed`) e proposta que a pessoa aceitou.

`QuietWindowView` traz `enforced: true` e `applied` (quantas coisas a janela segurou, 1 por coisa e por ocorrência da janela).

### Toast do desktop

O desktop só segura toast na janela que a pessoa salvou; sem janela salva, nada é segurado (o 22:00–07:00 que estava escrito no `main.ts` saiu). O renderer manda a lista INTEIRA no canal `attention` que já existe:

```ts
window.personaAlwaysOn?.attention({ kind: 'quiet', windows: [{ start: '20:00', end: '08:00' }] }) // HH:MM, até 16, no boot e a cada mudança
```

## Conhecido / fora desta entrega

- `getAttentionPolicy` / `putAttentionPolicy` (`quietStart`/`quietEnd`) seguem **só gravando**: nada lê. A janela que vale é `quiet_window`. A tela não deve oferecer esses campos.
- `simulateTriage` só escreve o log "Teria aplicado…"; texto livre de regra (`gateText`/`assessmentText`) não vira instrução: está `enforced: false`.
- A janela segura iniciativas e notificações novas; não interrompe uma Tarefa que já estava rodando quando a janela começou.
- Silêncio por persona (`autonomy.silenceStart/End`, em UTC) é outro mecanismo, anterior, e segue como estava (esse segura até o pedido direto da Coordenação).

## Estado por persona para a Muse (`quiet` / `paused`)

Dois fatos por persona, nos DOIS lugares que a tela lê, **presentes só quando `true`** (ausente = acordada; nunca um `false` inventado):

| Campo | Onde | Vale quando |
|---|---|---|
| `paused?: true` | `PersonaNowView` (`getOverviewNow`, faixa "agora") e `PersonaView` (`listPersonas`, roster) | a persona foi pausada de propósito ("Pausada") |
| `quiet?: true` | idem | a Janela de silêncio da equipe está ligada, OU a equipe inteira está pausada, OU a janela de silêncio da própria persona (`autonomy.silence*`) — "Descansando" |

São independentes: uma persona pausada dentro da janela traz os dois (a tela decide qual palavra vence). Leem as mesmas verdades que o host obedece (`persona_runtime.paused`, `teamState`, `HouseRules.quietNow`, autonomia), não uma cópia. O client (`ChannelPersonaMember.quiet?/paused?`) só precisa copiar `row.quiet`/`row.paused` em `mapPersonaNowRow`.
