# M5 · acesso remoto pelo Tailscale — REQUISITOS DE SEGURANÇA (Lumen, 14:46, staging). Para o Bolt desenhar e o Lumen revisar/testar

Critério 5 do marco: "cliente web do host, só na rede Tailscale, pareamento por código, nunca exposto à internet aberta"; o web/celular é o MESMO app (Casa, estilo Discord); senha e Cofre só pelo PC. O desenho do Bolt ainda não está no repositório; isto é o que eu vou exigir dele, em forma de teste.

## A. Escuta (bind) — "porta fora do Tailscale recusa"
1. O servidor **escuta só no endereço Tailscale** do PC (IPv4 em `100.64.0.0/10`, IPv6 em `fd7a:115c:a1e0::/48`), obtido na subida; **nunca `0.0.0.0`, `::` nem `localhost` para o cliente remoto**. Se o Tailscale não está de pé, o servidor **não sobe** (nada de cair em 0.0.0.0) e a Estação diz por quê.
2. Defesa em profundidade: cada conexão aceita confere o endereço REMOTO (também dentro de `100.64.0.0/10`/`fd7a:…`); qualquer outro é fechado sem resposta.
3. `Host` e `Origin` conferidos (rebinding de DNS e WebSocket cross-site): só o IP Tailscale ou o nome MagicDNS do PC; `Origin` do WebSocket = o mesmo.
4. Teste: bind com endereço fora da faixa = erro; tentativa de conexão pelo endereço de loopback/LAN = recusada; `Host: evil.example` = 421; `Origin` alheia no WebSocket = fechado.

## B. Código de pareamento — rate-limit e trava (lockout)
1. Código **de uso único**, TTL curto (≤ 10 min), gerado e **mostrado só na tela do PC** (nunca por rede). Alfabeto sem ambíguos e entropia ≥ 40 bits (8 caracteres de 32 símbolos), OU 6 dígitos COM a trava abaixo; comparação em tempo constante.
2. **Trava:** 5 erros no mesmo código **queimam o código** (o dono gera outro); teto por endereço remoto (ex.: 10 tentativas/10 min) E global (ex.: 30/hora): acima disso `429` com `Retry-After`; backoff exponencial por endereço. **A trava e os contadores vivem no disco** (reiniciar o app NÃO zera a contagem) — o mesmo padrão do laço do quadro.
3. O código **nunca vai para log, URL, auditoria nem mensagem de erro**; nem o hash dele na resposta.
4. Parear exige **aprovação do dono no PC** ("O celular de Miguel quer entrar · Aprovar / Recusar", com o nome do aparelho e o endereço) — o código sozinho NÃO basta (um código fotografado não vira acesso). Notificação para o dono a cada pareamento novo.
5. Testes: 5 erros queimam o código; reiniciar o host no meio e continuar errando não reinicia a contagem; o código certo depois de queimado não entra; uso único; TTL vencido; aprovação negada não cria sessão; nenhum log/auditoria contém o código.

## C. Sessão e dispositivo
1. O pareamento emite um **token de dispositivo aleatório (≥ 256 bits)**, guardado só como **hash** no host; o cliente o guarda (cookie `HttpOnly; Secure-quando-HTTPS; SameSite=Strict` ou cabeçalho `Authorization`), **nunca na URL** (referer, histórico, logs).
2. Validade: absoluta (ex.: 30 dias) e por inatividade (ex.: 7 dias); **o dono lista os aparelhos e revoga um com 1 clique** (e revogar corta na hora os WebSockets abertos: reconferir a sessão a cada quadro e a cada segundo, como o `followMessages` já faz).
3. CSRF para cookie: `Origin`/`Sec-Fetch-Site` conferidos e um cabeçalho próprio nas chamadas que mudam estado.
4. Um token roubado só vale no Tailscale (A) e some na revogação; trocar o token a cada uso sensível é opcional.
5. Testes: token só como hash no banco; revogar corta o WebSocket em ≤ 2 s; token na URL é recusado; expirado = 401.

## D. ACL do cliente remoto = o papel do DONO, e nada além
1. A sessão remota age como o dono **dentro da lista de Remotes PERMITIDOS para o remoto** (lista de PERMITIDOS, não de proibidos): um Remote novo nasce **recusado** para o remoto até alguém marcá-lo. O funil do `RemoteGuard` ganha um modo `remote` (como o `surfaceOff`), com código estável `remote-not-allowed`.
2. Nunca pelo remoto: revelar senha/Cofre (digitar o código 2FA no cartão é o dono; ver o valor guardado não), **assumir/abrir o navegador do PC**, computer-use, escolher pasta/arquivo no disco do PC, atualizar/sair do app, gerir pareamentos além de **revogar**, exportar o Cofre, mudar a Estação.
3. Streams e `followMessages` reconferem a sessão do aparelho (revogado/expirado = cortado), e a ACL de DM/canal continua sendo a do membro (a sessão remota é o dono, mas a cerca de projeto/DM vale igual).
4. Mobile: o "segure para aprovar" funciona no toque, mas **aprovar envio/pagamento/exclusão pelo remoto pede um 2º gesto** (a decisão de maior dano), e o cartão diz de onde veio ("aprovado pelo celular").
5. Testes: tabela de Remotes (cada Remote do host classificado permitido/negado; um novo sem classificação FALHA o teste, como o `surface-table-complete`); a lista de "nunca" recusa pelo remoto; reconferência no stream.

## E. Superfície web
1. O host serve **só os arquivos do cliente empacotados** (resolve + prefixo; sem `..`, sem diretório listado, sem dotfile, sem symlink para fora); `Content-Security-Policy` estrita (sem `eval`, `connect-src` = a própria origem), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
2. Limites: tamanho de corpo, quadro de WebSocket, conexões por endereço e totais (o funil já limita carga e taxa por chamada; vale também na camada HTTP).
3. Transporte: o Tailscale já cifra (WireGuard); HTTP simples DENTRO do tailnet é aceitável para o dogfood, HTTPS por `tailscale cert` é o passo seguinte (sem ele o navegador trata a origem como "não segura": sem service worker/clipboard — não é falha de segurança, é limite do web).
4. Testes: caminho com `..`/`%2e%2e`/`\` = 404; cabeçalhos presentes; corpo gigante = 413.

## F. O que eu NÃO vou aceitar (bloqueio de candidato)
- escuta em `0.0.0.0`/`::` (mesmo "com firewall"); código reutilizável ou sem trava persistente; token em URL; o remoto com o mesmo alcance do desktop; pareamento sem aprovação do dono.

## G. Como eu entrego a revisão
Quando o desenho do Bolt entrar (arquivo em `persona-spec/contracts/` ou staging dele), eu respondo item a item (A–F) com **RED em staging** para cada requisito que o desenho não cobrir, e a lista de testes (acima) que o Gauge pode usar no e2e. Dúvida de arquitetura: Keel decide.
