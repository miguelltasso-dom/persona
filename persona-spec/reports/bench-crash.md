# Consistência sob queda

Nenhum N falhou. Transação aborta; resume não duplica.

`FaultyRepositories` conta cada `save`. Queda no meio do `atomic` desfaz o comando. Reinício chama `evaluateDue` de novo. Sem Tarefa perdida/duplicada, sem reply duplicado, Mandate intacto.

| passo | escritas | menor N que falhou |
|---|---:|---:|
| receive | 4 | — |
| eval | 2 | — |
| decide | 5 | — |
| ticket | 5 | — |
| assignment | 1 | — |
| runner | 0 | — |
| report | 1 | — |
| outbox | 1 | — |
| reply | 1 | — |
| archive | 0 | — |

Runner 0: `assignmentStarted` já entrega os inputs. Archive 0: retenção é outro store (Anvil conta o `tx` SQLite na mesma suíte).

Anvil: `defineCrashSuite` + `persona-spec/contracts/crash.md`.
