# TEAM-4 (host) — a persona pede a opinião do time: o motor da rodada

Bolt, 04/11 23:35. Código: `persona-host/src/opinion-run.ts` (`TeamOpinions.run`), tipos `OpinionView`/`MessageView.opinion` em `types.ts`, flag em `message-flags.ts`, `PersonaHost.opinions`. Atrás de `Config.teamwork`. A ferramenta `ask_team_opinion`, `roundsUsed`/`asksToday`, o orçamento e o teto são do Tally (`opinion-host.ts`, `opinion-budget.md`): ele chama `opinions.run` DEPOIS de o orçamento dizer `ask`.

## O que uma chamada faz (UMA rodada)

1. Linha `request`: autor = quem pede, corpo = a pergunta; `MessageView.opinion` leva o rascunho (`draftText`, `attachmentIds`, `alt`), `audience`, `estimate`, `replierPersonaIds`, `noVision` e o `budget` do Tally (`rodape`, `round`, `roundsCap`, `skipped`).
2. Uma linha `reply` por colega chamado (autor = o colega), conforme cada um termina (pool de 3): turno curto, sem ferramenta, na sessão `opinion-<requestId>-<persona>`; recebe a imagem do rascunho como imagem do turno (`StartTurnInput.images`) quando o motor lê. Marca no começo da resposta: `[gostei]` `[sugestão]` `[atenção]` `[nada]` → `liked | suggestion | attention | nothing` (sem marca = sugestão; vazio = FALHA, nunca "nada a acrescentar").
3. UMA consolidação pela quem pediu (modelo dela): 1–2 linhas; se o texto mudou, `NOVA VERSÃO:` + texto → `version { k, before, after }` ("Antes · Depois"). Linha `consolidated`.
4. Devolve a quem pediu `{ state, replies[], consolidation?, version?, noVision[], ignoredAttachmentIds[] }`. NUNCA inicia outra rodada.

Chamadas EXATAS: uma por colega chamado + uma consolidação.

## Garantias

- **Idempotente** em `requestId` (o id da chamada da ferramenta): repetir não repete chamada de modelo nem linha; devolve o que as linhas dizem e termina só o que falta. Repetição simultânea espera a primeira (uma rodada só).
- **Ninguém some em silêncio:** colega pausada/no limite → linha `reply` com `failed: true` e frase honesta (não é chamada); turno que falha ou volta vazio → `failed` ("X não conseguiu responder agora."). Colega cujo motor não lê a imagem → não é chamada e vai em `noVision`/`budget.skipped` (`no-vision`) na linha do pedido, mesmo quando só se descobre ao abrir o motor; nunca responde "às cegas".
- **Falha parcial:** todas falharam → `failed` sem consolidação (nenhuma chamada gasta nela); consolidação falhou → `partial`, as respostas ficam no fio e voltam à persona, que segue sozinha.
- **Integridade:** recusa (sem linha, sem chamada) se a chave está desligada, a Tarefa não é de quem pede/já terminou, a pergunta ou o rascunho é vazio, ou não há colega. Quem pede nunca responde ao próprio pedido; no máx. 10 colegas e 4 imagens; anexo que não existe no projeto é ignorado e DITO (`ignoredAttachmentIds`). A imagem vai só aos colegas, não à consolidação.
- **O fio:** as linhas são mensagens de persona (nunca absorvidas nem tratadas como resposta da pessoa — BUG-RT-1); nenhum prompt interno chega ao fio (LEAK-1, testado). Com `Config.teamwork` desligada depois, as linhas ficam mas o campo `opinion` não é entregue.
- **Gancho de teste/diagnóstico:** `orchestration.imageTurns` (últimos 100: persona, sessão, `{path, mediaType}` das imagens entregues a turnos curtos). No roteirizado a visão é considerada disponível (stand-in do Claude); no real só `capabilities().images === 'available'`.

## Limites ditos com franqueza

1. Cada resposta de modelo é cortada em 100 palavras (`answerOnce`): "NOVA VERSÃO" muito longa é cortada.
2. A consolidação só versiona TEXTO; não produz imagem nova (o `after` de imagem fica para uma ferramenta de arquivo).
3. Não há teto de rodadas aqui (é do Tally); a rodada é uma.
4. Não provado: chamada vinda de dentro de um turno VIVO de Tarefa (a ferramenta ainda não está ligada no `index.ts`); `answerOnce` não usa a corrente de trabalho (`this.work`), então não deve travar, mas a prova é da rodada real. Que o MODELO descreva a imagem: só na rodada real (Tally mediu 2 chamadas no haiku).
5. Persona em Codex NATIVO (home da pessoa) não recebe ferramentas de produto (Rivet, `ht0-transport.md`): a ferramenta nem é oferecida; os colegas Codex também não leem imagem (`no-vision`).

## Provas

`opinion-run.spec` 19 (marcas, prompts, rodada, idempotência, simultânea, pausa/limite, falha, consolidação que falha, sem a própria autora, recusas, imagem, sem visão, orçamento, host real: linhas como `MessageView.opinion`, chave desligada, desligada depois, imagem como arquivo + tipo, LEAK-1, sem Tarefa nova) · processo real `proactivity-live.ts` fases 11 (TEAM-13) e 12 (TEAM-4) PASS · `check-pkg persona-host` OK · Typert regenerado (40) · suíte do host 153 arquivos verdes, 853 testes; 6 vermelhos só em `opinion-tool.host.spec.ts` (WIP do Tally: decisão `propose` por autonomia e `setAutonomy` do teste dele).
