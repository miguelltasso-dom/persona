# Motor indisponível — FR-3

Dono do host: Anvil. Engine: Forge. Apresentação: Prism/Composer. O Remote é `persona`.

`getEngineStatus({workspaceId,projectId})` e `getOverview(...).engineStatus` retornam `{state: ready|checking|unavailable, reason: null|none_connected|login_required|quota_exhausted, pending:number}`. A leitura usa o cache e não espera detecção. `checking` não significa logout. Uma conexão utilizável prevalece sobre outras indisponíveis.

Ao postar sem motor pronto no cache, inclusive durante a primeira verificação, o host persiste a mensagem e o Trigger com roteamento adiado. Emite no próprio stream/assunto um evento único `no_engine_ready`, antes de resolver runner ou criar Tarefa. A mensagem projetada inclui `runError: {code:engine_unavailable,reason,triggerId}`; durante a verificação, o motivo é `none_connected` e o estado permanece `checking`. O cliente apresenta a verificação ou “Falta uma IA” conforme `engineStatus`, com a ação de conexão adequada ao motivo. A mensagem humana não é rejeitada nem apagada.

Enquanto houver mensagens retidas, o host reconfere conexões a cada 15 segundos (`engineRetryPollMs`, zero desliga). A conexão pronta libera cada Trigger uma vez, em ordem por stream, e retoma o roteamento sem novo `receive`. Novas mensagens com fila no mesmo stream também aguardam. A retenção é persistida pelo engine e reidratada no boot.

| Remote | Campos além do projeto | Efeito |
| --- | --- | --- |
| `retryEngine` | — | força uma reconferência e retorna `EngineStatusView`; execução posterior é assíncrona |
| `dismissEngineTrigger` | `triggerId` | dispensa uma vez; preserva a mensagem humana |
| `confirmEngineTrigger` | `triggerId` | reconfere conexão e confirma pessoalmente uma mensagem expirada; retorna estado |

Após 24 horas, a liberação automática para e o evento único `engine_confirmation_required` inclui `runError: {code:engine_unavailable,reason:expired,triggerId}`. A UI oferece confirmar ou dispensar. Apenas o autor humano ou dono do workspace pode confirmar/dispensar; o host aplica a ACL. A confirmação só libera a cabeça daquele stream e nunca confirma outras mensagens implicitamente. Não há argumentos de ferramenta ou segredos nesses eventos.

`engine-wait.host.spec.ts` cobre persistência, erro imediato, ausência de runner/Tarefa antes da liberação, reconferência, idempotência, reinício, expiração, dispensa e ACL com runners injetados; não usa modelos reais.
