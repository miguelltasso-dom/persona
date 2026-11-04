# Deploy Cloudflare (persona-edge) — só com liberação do Atlas

Dono: Anvil. Conta e `wrangler login`: Atlas / Miguel. **Ninguém mais faz login nem `wrangler deploy`.**

Este arquivo é o passo a passo quando a conta existir. Até lá: testes locais (Miniflare) + `wrangler deploy --dry-run`.

## O que sobe

| Peça | Binding | Uso |
|---|---|---|
| Worker | `persona-edge` | Convites, webhook GitHub, proxy para o DO |
| Durable Object | `WORKSPACE_HUB` | Uma instância por `workspaceId`; sequência por stream; WebSocket |
| D1 | `DB` (`persona-edge`) | Log compartilhado, convites, deliveries |
| R2 | `BLOBS` (`persona-edge-blobs`) | Anexos compartilhados |

DM / privado **não** sobe sem `shared: true`. Credenciais nunca saem do desktop.

## Segredos (`wrangler secret put`)

| Nome | Obrigatório | Onde |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | sim (produção) | HMAC do webhook GitHub |
| `PERSONA_SYNC_WRAP_KEY` | não | Chave de cifra do payload (32 bytes hex) |
| `PERSONA_INVITE_PEPPER` | não | Hash dos tokens de convite |

Nunca commitar valores. Local usa `[vars]` de desenvolvimento em `wrangler.toml`.

## Migrações D1

Arquivos em `apps/persona-edge/migrations/`:

1. `0001_init.sql` — `sync_envelope`, `invite`, `webhook_delivery`

Aplicar local: `wrangler d1 migrations apply persona-edge --local`.
Produção (só Atlas): `wrangler d1 migrations apply persona-edge --remote`.

## Passo a passo (quando o Miguel liberar)

1. Atlas cria a conta Cloudflare (free) e confirma gasto.
2. Neste checkout: `cd apps/persona-edge && wrangler login`.
3. Preencher `account_id` em `wrangler.toml` (saída de `wrangler whoami`).
4. `wrangler d1 create persona-edge` → colar o `database_id`.
5. `wrangler r2 bucket create persona-edge-blobs`.
6. `wrangler secret put GITHUB_WEBHOOK_SECRET` (e os opcionais).
7. `wrangler d1 migrations apply persona-edge --remote`.
8. Conferir: `wrangler deploy --dry-run` (já deve estar verde hoje, sem login).
9. `wrangler deploy` — **só Atlas**.
10. Apontar o desktop (`persona-sync`) para a URL do Worker. Sem credenciais no payload.

## Dry-run (já válido sem conta)

```
cd apps/persona-edge
pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry
```

Não cria recurso, não pede login se `account_id` estiver vazio. O Worker empacota e o comando sai 0.

## Custo estimado (Cloudflare, região US, 2026)

Valores de tabela pública; conferir no dashboard na hora do deploy.

| Recurso | Free / mês | Pago (Workers Paid ~US$ 5/mês) | Uso Persona v1 (1 workspace, ~2 pessoas) |
|---|---|---|---|
| Worker requests | 100k/dia | 10 M inclusos + US$ 0,30 / milhão | dezenas/hora → free |
| Worker CPU | 10 ms/req | 30 M GB-s | DO hibernation; free |
| Durable Objects | não no free (precisa Paid) | 1 M requests + 400 k GB-s inclusos | **Paid é o piso** se houver DO em produção |
| D1 | 5 M reads / 100 k writes / 5 GB | 25 B reads / 50 M writes / 5 GB + excedente | log compartilhado cabe no free **depois** do Paid do DO |
| R2 | 10 GB + 1 M Class A / 10 M Class B | 10 GB + mesmo, depois US$ 0,015/GB | anexos leves → free |
| Egress |  | R2 sem taxa de saída | |

**Conclusão:** desenvolvimento local = US$ 0. Produção com Durable Object = **Workers Paid (~US$ 5/mês)** + folga grande no free D1/R2 para um workspace pessoal. US extra só se o sync disparar milhões de writes (improvável na v1). Plano B documentado: fly.io (D-034) se o Paid for recusado.

## O que não fazer

- `wrangler login` / `deploy` sem o Atlas.
- Colocar `account_id` real ou secrets no git.
- Subir DM ou stream `private`.
- Apagar D1/R2 de produção sem backup.
