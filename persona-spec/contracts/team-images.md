# TEAM-5 — imagem até o runner (D-090 #4)

Tally, 04/11 22:15. Para o Bolt (host: anexo → pedido do runner), o Rivet (runner/OAR) e o Anvil (ferramenta "pedir opinião"). Código: `persona-runners/src/{contract,oar/turn-images,oar/adapter,oar/claude}.ts`. Provas: `tests/turn-images.spec.ts` (10), `scripts/team5-image-dry.ts` (CLI Claude REAL, endpoint falso, zero modelo, zero gasto; brutos `reports/team5-image-dry.json`).

## O que o host faz

```ts
runner.start({ ..., prompt: 'Dê sua opinião sobre este rascunho.', images: [{ path: '<caminho absoluto do anexo já salvo>' }] })
```

- `images?: readonly { path: string; mediaType?: string }[]` em `StartTurnInput` (aditivo). `path` é o ARQUIVO do anexo que o host já salvou nesta máquina; `mediaType` sai da extensão quando falta (png, jpg/jpeg, gif, webp).
- O host NÃO põe caminho nem base64 no `prompt`. O runner entrega a imagem como a entrada de imagem nativa do OAR (`InputOptions.images`): a CLI recebe um BLOCO DE IMAGEM na mensagem do turno.
- `images` não é "pegajoso": vale só para aquele turno. Mas a sessão quente guarda a conversa: uma imagem enviada num turno continua no histórico dos turnos seguintes da MESMA sessão (e custa entrada em cada pedido, mais barato se houver cache). Para uma rodada de opinião, o orçamento (TEAM-4) conta a imagem uma vez por pedido da sessão em que ela está.

## O que o runner garante

| Garantia | Prova |
|---|---|
| A imagem chega à CLI Claude como bloco `image` (base64, `image/png`), com os **bytes idênticos** (sha256) ao arquivo, na mesma mensagem do texto, e o caminho do arquivo **não aparece no texto** | `team5-image-dry` one-image |
| Duas imagens chegam em dois blocos, na ordem | two-images |
| O turno seguinte sem imagem não leva imagem | not-sticky |
| Recusa **antes de abrir sessão** (nenhuma requisição chega ao endpoint) e em palavras humanas: motor que não lê imagem (`engine`), mais de 4 imagens (`count`), arquivo acima de 5 MB (`size`), não é png/jpg/gif/webp (`type`), arquivo ausente ou ilegível (`unreadable`) | refuse-* (4 de 5 motivos na CLI real) + `turn-images.spec` (os 5) |
| Nada é descartado em silêncio: o turno inteiro é recusado | `checkTurnImages` nunca devolve lista parcial |

## Recusa (o que o host trata)

`start()` rejeita com `ImagesRefusedError { code: 'images_refused', reason: 'engine'|'count'|'size'|'type'|'unreadable', message }`. A `message` já é pt-BR, sem caminho nem termo interno, pronta para o fio ("Este motor não lê imagem. Peça a opinião a uma persona que use um motor que leia imagem, ou descreva a imagem em texto."). O host decide o que fazer (mostrar a linha, pular essa persona na rodada, mandar só o texto); o runner nunca manda o texto sozinho fingindo que a imagem foi.

## Quais motores leem imagem

`runner.capabilities().images`: `'available'` só no **Claude** (provado). Codex, OpenCode e Cursor ficam sem o campo (= indisponível) até uma prova própria; o host usa isso para escolher quem entra numa rodada de opinião com imagem e para a mensagem honesta (`reason: 'engine'`). Limite do runner: 4 imagens e 5 MB por imagem (o limite da API); dimensão grande a CLI reduz sozinha.

## O que NÃO está provado

O transporte foi provado a seco. **Depois, 2 chamadas reais no haiku (Atlas, 04/11 22:40; `reports/image-cost-real.md`) provaram o resto:** a persona DESCREVEU a imagem corretamente ("faixa azul-clara em cima, faixa verde embaixo") e uma imagem 1500×1000 custou **2.018 tokens** de entrada a mais (3.031 → 5.049), cobrada como escrita de cache. Uma medição só (um tamanho, haiku, CLI 2.1.318); o tempo de uma rodada com vários colegas segue sem medida. O orçamento usa isso (`contracts/opinion-budget.md`).
