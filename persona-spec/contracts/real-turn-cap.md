# Limitador de turnos reais (D-069)

Rivet, 04/11. Código: `packages/persona/persona-runners/src/resolve/real-turn-cap.ts`; ligação em `resolveRunner` (ramo CLI). Testes: `tests/real-turn-cap.spec.ts`.

## Para que serve
Garante, **dentro do app instalado**, que a execução real nunca gasta mais turnos pagos do que o combinado, e o garante **antes** de o CLI iniciar o turno (não depois, como o `DeliveryCallBudget` do script do host, que fica fora do NSIS).

## Ligar (ambiente do processo do app)
| Variável | Valor | Efeito |
|---|---|---|
| `PERSONA_REAL_TURN_CAP` | inteiro ≥ 1 | liga o limitador. **Ausente = comportamento de hoje (zero efeito)** |
| `PERSONA_REAL_TURN_LEDGER` | caminho **absoluto** de arquivo, fora do home temporário | onde a contagem persiste |

A harness do Probe usa um arquivo por tentativa com `CAP=1`: 1 turno pago por tentativa; as 3 tentativas são limitadas pela própria harness.

## O que conta
- Cada **turno de modelo** de um **CLI real** (claude, codex, cursor, opencode): `start`, `startTurn` e `resume`. Sessão quente que recebe vários turnos conta cada um.
- Conta **ao iniciar** (conservador): reserva a vaga e só então delega ao CLI. Se o turno falhar depois, a vaga continua gasta.
- **Não conta:** `prime` (abre a sessão sem turno de modelo), `dsh`, fake e scripted (nunca passam pelo ramo CLI), nem o stand-in scripted do triage.
- Fica na camada mais interna do runner: as retentativas da recuperação de infra também passam pelo limitador.

## Falha fechada (recusa tudo, CLI nunca é iniciado)
- `CAP` definida mas vazia, `0`, negativa, fracionária ou texto (`abc`, `1e3`, `0x10`).
- `LEDGER` ausente, vazia ou relativa.
- Arquivo ilegível, diretório, JSON inválido, forma errada (`version` ≠ 1, `turns` não inteiro ≥ 0, `entries` não array), pasta não criável, trava não obtida em 5 s, falha ao gravar.
- Arquivo ainda inexistente = ledger vazio (primeira tentativa).

O erro é `RealTurnCapError` (`code: 'real_turn_cap'`, `reason`: `cap_reached` · `misconfigured` · `ledger_unavailable` · `ledger_corrupt`). A promessa de `start/startTurn/resume` **rejeita** com ele, antes do CLI. Mensagem pt-BR sem jargão:
- `Precisa de você: o limite de execuções reais desta rodada foi atingido (1 de 1). Nada foi iniciado.`
- `Precisa de você: não consegui conferir o limite de execuções reais desta rodada, então não iniciei nada.`

## Formato do arquivo (exato)
Um único JSON, reescrito inteiro a cada reserva:

```json
{"version":1,"turns":1,"entries":[{"at":"2026-11-04T19:20:00.000Z","kind":"start","ticketId":"t1","assignmentId":"a1","personaId":"nina"}]}
```
- `turns`: total de turnos reservados (é o número que vale). `entries`: últimos 100, `kind` = `start` | `resume` (`startTurn` conta como `start`).
- Leitores externos (Probe/Forge): leiam `turns`; não escrevam no arquivo.

## Atomicidade
- Trava exclusiva entre processos (`<ledger>.lock`, criação `wx`; trava com mais de 30 s é de processo morto e é retomada).
- Leitura, checagem e gravação sem `await` no meio (sem corrida dentro do processo).
- Gravação em arquivo temporário irmão, `fsync`, `rename` por cima (leitor nunca vê arquivo pela metade; no Windows tenta de novo se o antivírus segurar). Sobra de escritor morto (`*.tmp`) é ignorada.

## Como o Probe confirma que o exe tem o limitador
O texto `PERSONA_REAL_TURN_CAP` está no código do host empacotado (constante `REAL_TURN_CAP_ENV`). A varredura do asar/runtime deve achá-lo; se não achar, o exe é anterior ao limitador e não serve à execução real.
