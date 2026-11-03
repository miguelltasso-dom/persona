# Contrato — onboarding (S5)

Dono: **Anvil** (`persona-host`). Consumidor: **Prism** (overlay).

O overlay deixa de ser autoridade. `localStorage` (`persona.onboarding.complete.v1`) é cache otimista até `getOnboarding`.

## `getOnboarding(scope) → OnboardingState`

| Campo | Significado |
|---|---|
| `hasPersonalProject` | Existe Pessoal |
| `firstUse` | `!completed` |
| `personalProjectId` | Id do Pessoal (vazio se ainda não existe) |
| `completed` | `completeOnboarding` já correu neste store |

Workspace ausente: `{ hasPersonalProject: false, firstUse: true, personalProjectId: '', completed: false }` — não lança.

## `completeOnboarding(request) → OnboardingState`

Idempotente, numa transação de produto:

1. Cria workspace + Pessoal se faltarem.
2. Membro `owner` a partir de `displayName` se a workspace estiver vazia.
3. Canal `#geral` se faltar.
4. Personas: `team[]` se vier preenchido; senão `templateIds` via `createDraftDriver` (Rivet, fake em testes) com `fallbackDraft` se o driver falhar. Sem coordenador no rascunho — `systemRoles` só entram se o overlay as mandar.
5. `cofreSeed` vira **proposta** de memória (`proposeMemory`), nunca gravação direta no Cofre.
6. Mensagem de boas-vindas em `#geral`: texto da primeira persona com função Coordenação; se não houver, texto de sistema (`actorId: system`).
7. Marca `completed` no store.

Nenhum nome de função hardcoded (D-043). Kanban permanece vazio até o primeiro pedido.

```ts
interface CompleteOnboardingRequest {
  workspaceId: string
  personalProjectId: string
  displayName: string
  team: OnboardingPersonaSpec[]
  templateIds: string[]
  runnerChoices: string[]
  cofreSeed: string  // vazio = nenhuma proposta
}
```
