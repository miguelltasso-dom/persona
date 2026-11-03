# Retenção e arquivo

Porto: `RetentionPolicy` / `RetentionStore` em `persona-engine` (`src/retention.ts`). A implementação em memória (`MemoryRetention`) e a suíte `tests/contract/retention.contract.ts` são o contrato. O Anvil implementa o mesmo porto em SQLite (VACUUM e FTS).

## Regras

- **Arquivar não apaga.** O registro continua legível pelo id; some das listas “vivas”.
- **Excluir é irreversível.** Depois de `delete`, não restam derivados, índices FTS, caches nem ponteiros `sourceIds` para o id.
- **Excluir é recusado** enquanto `derivativeIds` ainda apontam para o registro. Arquivar a fonte não apaga o derivado; quem deriva precisa ser arquivado ou excluído na própria janela.
- Janelas são por tipo. Ausência de `deleteAfterMs` = nunca excluir.

## Defaults

| Tipo | Arquiva após | Exclui após |
|---|---|---|
| trigger | 365 dias | nunca |
| disposition | 365 dias | nunca |
| decision | 365 dias | nunca |
| input | 365 dias | nunca |
| message | 365 dias | nunca |
| outbox | 90 dias | 365 dias |
| usage | 90 dias | 365 dias |
| effect | 30 dias | 90 dias |

O protótipo em memória não apaga sozinho: o host chama `applyRetention(store, policy, now)` num tique. SQLite (Anvil) aplica a mesma função e depois VACUUM / reconstrói FTS.

## O que é irreversível

- `RetentionStore.delete` — o conteúdo, o índice e o cache daquele id.
- Revogação de fonte (`purgeSource`) **não** é exclusão: arquiva vault/memória derivados.
- SyncLog e Mandate **não** entram neste porto (Mandate é imutável; SyncLog é o sequenciador).
