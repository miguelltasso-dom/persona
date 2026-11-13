# Marco dogfood — acesso remoto: a porta HTTP de stream do celular (Bolt, 12/11)

Contrato curto para o cliente do celular (Cobalt). O portão remoto **recusa WebSocket de propósito**; o celular segue streams (um canal, as grants) por UMA rota HTTP autenticada, com o protocolo do viewer do Liveshare (`viewer-carrier.ts`): um poll por chamada. Chamada unária continua em `/api/*` (relay do Gateway como o Peer do aparelho).

## Rota

`POST /remote/rpc` — corpo JSON ≤ 64 KB, `content-type: application/json`.

| Exigência | Resposta se faltar |
|---|---|
| cookie `persona-device` válido (aparelho pareado e vivo, no endereço a que foi ligado) | `401` |
| cabeçalho `x-persona-remote: 1` (mesma cerca de toda escrita) | `403` |
| portão com a tabela de streams ligada | `404` |
| corpo JSON objeto com `op` conhecido e `id` inteiro | `400 { error:'bad-request' }` |
| corpo ≤ 64 KB | `413` |
| ≤ 12 chamadas desta rota em voo por aparelho | `429` + `Retry-After: 1` (o carrier trata 429 como perda retentável) |

Só existe na interface Tailscale (o mesmo portão de `/remote/me`, `/remote/pair`, `/api`).

## Operações

Todas respondem `200` com JSON, exceto onde dito. `id` é um inteiro positivo ≤ 2³¹−1 que **a página** numera (um número por stream aberto; reabrir o mesmo `id` fecha o anterior).

- **`{ op:'stream-open', id, endpoint, payload }`** — abre o stream do Gateway para o Peer do aparelho (o MESMO funil, ACL `paired` e Caller de toda chamada: o Gateway pergunta a política antes de resolver o endpoint, e o host fixa o membro do aparelho). `endpoint` = nome do stream (`^[A-Za-z][A-Za-z0-9/_.:-]{0,120}$`; ex.: `followMessages`, `remoteAccess/follow`).
  - ok: `{ opened:true }`
  - recusa ou falha de abertura (política diz não, endpoint desconhecido, limite): `{ failure:{ code, message, details? } }` — **terminal**, não reabrir (um `code` como `remote-access/denied`, `stream-limit`). Só `stream-not-found` e `gateway/cancelled` são "perda do stream" (reabrir).
  - `400` `bad-request` (id ou endpoint mal formado), `401` `device-revoked`, `503` `remote-unavailable`.
- **`{ op:'stream-next', id }`** — um poll. Espera até ~10 s pelo PRIMEIRO valor e responde com ele **junto com o que já estava na fila** (até 64):
  - `{ values:[…] }` (ordem preservada, nada se perde entre polls)
  - `{ pending:true }` (nada veio no prazo: pergunte de novo de imediato)
  - `{ end:true }` (o stream terminou; o `id` some)
  - `{ failure:{ code, message, details? } }` (o stream falhou; o `id` some)
  - `404 { error:'stream-not-found' }` (o `id` não existe mais: **reabra**); `401` se o aparelho foi revogado
  - `204` sem corpo: o poll foi abandonado (a página saiu); o stream guarda o que já puxou.
- **`{ op:'stream-cancel', id }`** → `{}` (idempotente; de stream que não é seu, silencioso).

## Limites que a página precisa respeitar

- **No máximo 16 streams abertos por aparelho** (`stream-limit` depois disso). Um poll ocupa UMA conexão por até 10 s e o navegador abre ≤ 6 por origem em HTTP/1.1: **siga poucos streams ao mesmo tempo (até ~3: o canal aberto, as grants, no máx. um a mais)**, e feche (`stream-cancel`) o que a tela não mostra mais.
- Um stream que ninguém consulta por **60 s** é fechado pelo host (a página sumiu); depois disso `stream-next` dá `404` e a página reabre.
- Aparelho **revogado**: todos os streams caem juntos; o próximo pedido dá `401` (não existe frame `{type:'revoked'}` de socket: trate `401` ou fim de stream seguido de `401` como revogado → "Ligar ao PC").
- Persona/recurso proibido ao celular: a falha vem como `failure` da política (`pc-only`, `remote-access/denied`), igual às chamadas unárias.

## Parar uma execução

`POST /remote/computer/stop`, cookie do aparelho + `x-persona-remote: 1`, corpo `{ runId }` (≤ 1 KB) → `200 { ok:true }` (parou ou já tinha acabado), `403 { ok:false }` (este aparelho não pode comandar), `400` (sem `runId`), `401`, `404` (enquanto o host não ligar o `stopRun`).

## Bundle

O portão serve a pasta do build remoto (`PERSONA_REMOTE_WEB_DIR`, o `dist-remote` empacotado como `remote-web/`); CSP sem inline, sem service worker, tudo do mesmo origin. Tenant: `GET /remote/me` → `workspace.id`; o `projectId` real vem de `listProjects` (ver recado de 12/11 20:21).

## Provas e limites

Provado no host: `remote-stream.spec` (14: ordem, lotes ≤ 64, poll abandonado sem perder valor, falha vira frame, dono do stream, revogação, teto, ocioso), `remote-gate-rpc.spec` (7: cerca, repasse ao aparelho do cookie, 204/404 refletidos, 400/413, abort no meio do poll, 429), `remote-dispatch.spec` (`peerFor`: o MESMO Peer das chamadas unárias). **Não provado:** um follow de longa duração do Gateway real com um celular de verdade (o Gateway é falso nos specs); entra no teste ao vivo quando o bundle remoto existir.
