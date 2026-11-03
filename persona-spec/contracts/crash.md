# Consistência sob queda

Dono da suíte: **Forge** (`packages/persona/persona-engine/src/crash`, `tests/contract/crash.contract.ts`).
SQLite: **Anvil** — mesma fábrica, abortar a transação / matar no meio de `store.tx`.

```ts
defineCrashSuite(() => openPersonaStore({ path: ':memory:' }).repos('p'), 'sqlite')
```

`FaultyRepositories` conta cada `save` e lança `CrashError` depois de N escritas. O `atomic` deve desfazer o comando aberto. Resume não duplica Tarefa, efeito nem reply.
