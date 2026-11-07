# Contrato — `@menções`, colaboradores da Tarefa e "Toda a equipe" (CV-5, CV-8)

Dono: **Bolt** (`mentions.ts`; depois `fanout.ts`/`fanout-plan.ts`), com o **Anvil** nos canais por equipe (CV-6, `contracts/team-channels.md`). UI: **Flint** (seletor "Quem responde", chip de custo), **Prism/Lumen** (cartão do quadro, linha do fio). Spec: `design/CONVERSAS-SPEC.md` (§3 e "Aprovado pelo Miguel"). Decisões da Muse e do Keel de 04/11 19:16–19:20 (resumidas em `reports/bolt.md`).

**Regras que valem para tudo:** sem subir o schema do store (os documentos são `screen_doc`; o v22 é do ISO-2) · o engine fica intacto na Fase A · **o colaborador nunca ganha mandato extra** (usa o próprio) · nada fica mudo (D-079): cada persona citada/consultada recebe UMA linha, de resposta, de estado ou de "limite/pausada".

## 1. CV-5 — quem é citado por `@nome`

`persona-host/src/mentions.ts` (`mentionsOf`, `firstMention`), usado no roteamento (`orchestration.ts`) e na checagem de acesso do `postMessage` (`assertCanAddress` de **cada** citada):

| Regra | Exemplo |
|---|---|
| o nome tem de estar **inteiro** (depois dele não vem letra, número nem `_`) | `@Anabela` não é a Ana; `@Leonardo` não é o Leo |
| o **mais longo** ganha no mesmo ponto | `@Ana Paula` é a Ana Paula, não a Ana |
| `@` colado a uma palavra não conta (e-mail) | `bento@Nina.com`, `@@Nina` |
| maiúscula/minúscula não importam; o acento é mantido | `@nina,` é a Nina; `@João.` é o João |
| várias citadas: cada uma **uma vez**, na ordem do texto | `@Nina @Bento, vejam` → Nina, Bento |

A mensagem **fica no canal**; a "Quem responde" escolhida continua sendo `responderId` e vence a menção.

## 2. Pedido de TRABALHO com 2+ menções → UMA Tarefa, "com {nome}" (Fase A)

- A **1ª citada** leva a Tarefa e é a responsável (como hoje). As **outras** (até 4) entram **"com {nome}"**: nunca "só citadas".
- Documento do host `ticket_collaborators` (`screen_doc`, chave = `ticketId`): `{ ticketId, leadId, personaIds[] }`.
- O worker recebe no contexto "Com você nesta tarefa: Bento." (nome só; sem mandato extra).
- **Linha de estado tipada** (id `coord-<id da mensagem>-with`, dita pela responsável; o corpo já é frase legível): `MessageView.taskWith = { ticketId, title, lead: {personaId, name}, with: [{personaId, name}] }`. A UI monta "Bento está com Nina em “{tarefa}”" e "Nina pegou a tarefa, com Bento" a partir do campo. **Nunca** soa como se a outra tivesse sido ignorada.
- Cartão do quadro e `listTasks`: `BoardCardView.collaborators?` e `TaskView.collaborators?` = `[{ personaId, name }]` (ausente quando não há colaboradores) → o cartão mostra "com Bento".
- Fase B (dois executores de verdade / "A Coordenação dividiu entre Nina e Bento") **não** faz parte disto: é mudança de engine/orquestração com Forge e Anvil, se um dia pedirem.

## 3. Conversa com 2+ menções e "Toda a equipe" (CV-8 — a seguir)

`postMessage({…, fanout?: 'everyone' | 'relevant'})` (vale só para aquela mensagem) e a conversa com 2+ menções viram um bloco de linhas **tipadas**, uma por persona:

`MessageView.fanout = { id, source: 'everyone'|'relevant'|'mentions', total, index, personaId, kind: 'reply'|'nothing'|'limit'|'paused'|'failed', until?, message? }` (`failed` = a persona cujo turno falhou ou voltou vazio: dito com uma frase honesta em `message`, nunca silêncio; "Quem tiver algo a dizer" sem ninguém escolhido = UMA linha `nothing` da Coordenação) — a UI localiza (`fanout.*` das chaves da Muse); `limit` leva a hora em que o limite acaba, **sem chamada**; `paused` também sem chamada; `nothing` = a persona respondeu a marca "nada a acrescentar". As chamadas passam pela fila de vagas do projeto. "Quem tiver algo a dizer": UMA chamada da Coordenação escolhe (≤ 5), só as escolhidas respondem. O colaborador de §2 também faz UM turno curto ("o que você traz para esta tarefa?") que aparece no bloco. O teto de 5 para pedir confirmação é **só da UI**; o host protege o dinheiro pelo orçamento de cada persona.

**Estimativa:** o Remote **existente** `estimateAsk` (Tally, `contracts/estimate-ask.md`) ganha `audience?: 'everyone' | 'relevant'` no pedido e `fanout?: { replies, asked, limited, paused, chamadas: {min, max} }` na visão. As chamadas são **exatas** (cada persona consultada faz uma chamada; "Quem tiver algo a dizer" = 1 + 0..5); quem está no limite ou pausada não conta; o colaborador de §2 conta 1 cada. `tokens`/`custo`/`tempo` seguem as regras de honestidade do contrato do Tally (só com medida).

**Dependência (Anvil, CV-6):** `teamPersonasOf(projectId, channelId): StoredPersona[]` (interna; com pausadas; ordem por nome e id). Postar em canal arquivado é recusado com `channel-archived`.

## Prova

CV-5 (**entregue, 04/11 19:58**; 7 + 5 testes verdes, `check-pkg` host OK, Typert regenerado, processo real fases 1–9 PASS): `tests/mentions.spec.ts` (resolvedor puro) + `tests/mentions-routing.spec.ts` (host: `@Anabela`≠Ana no roteamento e no acesso, e-mail não aciona ninguém, 2 menções de trabalho = 1 Tarefa + `ticket_collaborators` + linha `taskWith` + `collaborators` no cartão e em `listTasks`, `responderId` vence a menção, a mensagem fica no canal) + `check-pkg persona-host`. CV-8: no contrato de fechamento dele.

### 3-b. Linhas `failed` e "ninguém" (Muse, 04/11 20:41) — v1.1, atrás de flag
- `kind:'failed'`: a UI escreve "{nome} não conseguiu responder agora." (cor neutra, no lugar e na ordem do bloco). `message` é **sempre uma frase fixa e sem jargão** (nunca o texto cru do erro): "Houve um problema ao responder. Tente de novo em instantes." ou, se a resposta veio vazia, "A resposta veio vazia. Tente de novo."; vai no tooltip.
- **Tentar de novo:** a ação só aparece se o host aceitar repetir **aquela** persona. Hoje **não existe** Remote para isso (futuro: `retryFanoutReply({ fanoutId, personaId })`, idempotente, uma tentativa por vez); sem ele a linha sai **sem botão**. Não inventar atalho.
- "Quem tiver algo a dizer" sem ninguém escolhido: UMA linha `nothing` da Coordenação; a UI escreve "Ninguém tem algo a acrescentar agora."

## 9. CV-8 ENTREGUE no host (Bolt, 04/11 21:05) — atrás de `Config.fanout` (DESLIGADA por padrão)
- **Como liga:** `Config.fanout` / `Orchestration.fanoutEnabled`. Desligada, nada muda (duas menções = só a 1ª responde; `postMessage.fanout` é ignorado e a mensagem segue a rota normal).
- **Pedir o bloco:** `postMessage({…, streamKind:'channel', fanout:'everyone'|'relevant'})`. O host monta a audiência com `teamOf(projectId, channelId)` (hoje: todas as personas do projeto; **troca pelo `teamPersonasOf` do Anvil/CV-6** ao chegar) e **tira as que quem enviou não pode endereçar** (uma mensagem a "toda a equipe" não acorda quem a pessoa não alcança). Audiência vazia → a mensagem segue a rota normal (nunca fica muda).
- **O bloco:** uma linha por persona, id `coord-<msg>-fan-<persona>`, dita por ela, com `MessageView.fanout = { id:'fan-<msg>', source, total, index, personaId, kind:'reply'|'nothing'|'limit'|'paused'|'failed', until?, message?, nobody? }` e o corpo legível como fallback. **Sem chamada** para pausada e no limite (`limit.until` = quando a janela da cota abre; o teto de tokens do dia também conta como limite). Falha/vazia = `failed` com a frase FIXA. "Quem tiver algo a dizer": 1 chamada de pick da Coordenação (≤ 5) e só as escolhidas respondem; ninguém → UMA linha `nothing` com `nobody:true`. Pool de 3 chamadas ao mesmo tempo; o trabalho entra na fila do host (`flush` espera).
- **2+ menções em conversa** (flag on): bloco `source:'mentions'`, na ordem do texto. **Pedido de trabalho com 2+ menções:** além da linha "com {nome}" do §2, cada colaborador faz UM turno curto ("o que você traz para esta tarefa?") no bloco.
- **A mensagem que abre um bloco** recebe a marca `fanoutId` (síncrona, antes de qualquer linha): a varredura de recuperação (`recoverTalks`) não a responde de novo (mesma regra do CONV-2).
- **`estimateAsk`** estendido (Remote existente): pedido ganha `audience?:'everyone'|'relevant'`; a visão ganha `fanout?: { source, replies, asked, limited, paused, chamadas:{min,max} }` — chamadas exatas, "relevant" = 1 + 0..5, pausada/no limite não contam, duas menções de trabalho contam só o colaborador, uma persona só = ausente, flag desligada = ausente.
- **Prova:** `fanout-host.spec` 9 (caminho real roteirizado; pausada+limite sem chamada; nada/falha; 2 menções; flag desligada = antigo; relevante e ninguém; colaborador; estimateAsk) · `fanout-run.spec` 5 · `fanout-plan.spec` 5 · `check-pkg` (meus arquivos sem erro) · Typert regenerado · processo real `proactivity-live.ts` **fase 10** PASS.
- **Falta (não é desta entrega):** `retryFanoutReply` ("Tentar de novo"), o `teamPersonasOf` do Anvil no lugar do `teamOf` padrão, a UI (Flint/Prism/Muse).
