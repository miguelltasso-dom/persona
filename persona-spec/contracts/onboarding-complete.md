# Contrato — `completeOnboarding`

Dono do tipo: **Forge** (`persona-core` `CompleteOnboardingWire`). Remote: **Anvil** (`persona-host` `CompleteOnboardingRequest` — as mesmas chaves). Consumidor: **Prism** (`persona-live-store` + overlay).

## Payload

```
workspaceId, personalProjectId, displayName,
team: OnboardingPersonaWire[],
templateIds: string[],
runnerChoices: string[],   // vazio ⇒ ['dsh']
cofreSeed: string          // vazio = sem proposta de Cofre
```

Construir com `completeOnboardingWire(...)`. Validar entrada não confiável com `parseCompleteOnboardingWire`.

## Recusado (Padaria DF-002)

O live store mandava `{ roster, projectId, memberId }`. O host ignora `roster` e não grava `screens.completed` → `firstUse` fica true → overlay remonta.

- `roster` ⇒ `INVALID_PERSONA` / `ONBOARDING_WIRE_ROSTER`
- `projectId` sem `personalProjectId` ⇒ `ONBOARDING_WIRE_PROJECT_ID`

O seed (`seed-default-team.ts`) já manda este contrato. O dismiss do overlay tem que usar o mesmo.

## Dependência

Prism troca o body do RPC. Anvil não muda o Remote. Forge não toca `client-ui-persona`.
