# Contrato — credenciais OAuth de MCP no Cofre (item 26, onda B)

Quem lê: Lumen (proxy MCP local, 26.1/26.2). O que existe hoje no host: `persona-host/src/oauth-vault.ts`, testado em `tests/oauth-vault.spec.ts`. Sem rede e sem IA nesta fatia: o fluxo OAuth em si (descoberta, DCR, PKCE, callback) é do 26.2 e usa este armazenamento.

## Duas metades, de propósito

| O quê | Onde | Quem lê |
|---|---|---|
| Segredo: `accessToken`, `refreshToken`, `tokenType`, `expiresAt`, `scope` | slot selado `oauth:<provider>:<account>` no Cofre (DPAPI), via `CofreSecrets` | **só o host** |
| Metadado: `provider`, `account`, `scope`, `expiresAt`, `updatedAt` | `screen_doc` kind `oauth_credential`, id = o mesmo slot | tela, por `listOAuthCredentials` |

`provider` é o host do servidor MCP (`mcp.notion.com`); `account` é quem a pessoa conectou (e-mail ou rótulo dado pelo provedor). Nenhum dos dois é segredo.

## API do host (não é remote)

```ts
const vault = new OAuthVault({ screens, secrets, now })

await vault.save(projectId, { provider, account, tokens })   // sela e grava o metadado
await vault.tokens(projectId, provider, account)             // OAuthTokenSet | undefined
await vault.rotate(projectId, provider, account, refresh)    // uma rotação por conexão, ver abaixo
await vault.drop(projectId, provider, account)               // apaga o selado e o metadado
vault.list(projectId)                                        // OAuthCredentialView[] (sem token)
```

O único remote é `listOAuthCredentials({ workspaceId, projectId })`, que devolve `OAuthCredentialView[]`. **Não existe remote** que devolva token, e nenhum evento, linha do fio ou prompt carrega um.

## Rotação: uma de cada vez

O provedor que roda refresh token recusa a segunda tentativa. `rotate` serializa por conexão: duas chamadas concorrentes para o mesmo `(projectId, provider, account)` fazem **uma** chamada de rede; a segunda espera e recebe o mesmo resultado. O `refresh` recebido é quem faz a rede (o 26.2) e devolve o `OAuthTokenSet` novo; o host sela e atualiza `expiresAt`/`updatedAt`.

Quando o proxy leva `401` de um servidor MCP, o caminho é `rotate`; se `tokens` voltar `undefined`, a conexão não existe mais e a pessoa precisa entrar de novo.

## Falhas

- Valor selado ilegível → `OAuthVaultError` com frase PT ("O acesso guardado está ilegível; entre de novo no serviço.").
- `provider`/`account` vazios ou `accessToken` vazio → `OAuthVaultError` com a frase do campo.
- Sem cofre (DPAPI indisponível) → o `CofreSecrets` recusa com `VaultUnavailableError`; nada é gravado.

## O que o 26.2 acrescenta (fora desta fatia)

Descoberta pelo `WWW-Authenticate`/`.well-known/oauth-protected-resource`, RFC 8414, DCR (RFC 7591) com cliente público, PKCE S256, `resource` (RFC 8707), retorno em `http://127.0.0.1:<porta>/callback`, guarda de rede (só https, sem IP privado). Ao final do fluxo: `vault.save(...)`. Nenhum token passa por servidor nosso (R2) e o OAuth é o da conta do fornecedor, não uma chave de modelo (R3).
