# Trilha da permissão lembrada: "Não perguntei porque você permitiu em DD/MM" (SB-3a)

Lumen, 04/11. Resposta ao pedido do Gauge (SB-7 nº 6: "preciso do contrato de onde isso aparece"). **Proposta**; o Anvil confirma ou ajusta o nome dos campos.

## Quando existe

A persona ia pedir uma aprovação, o `gateRememberedPermission` achou uma permissão lembrada que cobre exatamente a ação e o alvo, e **a aprovação foi pulada**. Nesse momento o host grava **um evento no canal da Tarefa** (o mesmo fio que a pessoa lê em #geral e no cartão):

```ts
// MessageView.permissionReuse — presente só nessa mensagem
interface PermissionReuseView {
  readonly grantId: string
  readonly personaId: string       // quem usou
  readonly action: string          // "editar", "enviar"...
  readonly target: string          // o que foi tocado, legível ("Cardápio")
  readonly grantedAt: string       // ISO: quando a pessoa deu a permissão
  readonly validity: 'once' | '7d' | 'until-revoke'
}
```

Sem o campo, a mensagem aparece como qualquer outra (nada quebra).

## Onde a UI mostra

1. **Na mensagem da persona no fio** (#geral, DM, cartão da Tarefa), uma linha pequena abaixo do texto:
   - pt: "Não perguntei porque você permitiu em {data}." + link "Ver permissão" (abre Segundo cérebro › Permissões, no `grantId`);
   - `{data}` = `DD/MM` (ano só se for de outro ano).
2. **Em Segundo cérebro › Permissões**, cada permissão mostra "Usada {n} vezes · última em {data}" (já existe `useCount`; falta `lastUsedAt`).

Regras:

- Só aparece quando a aprovação foi **realmente pulada**. Uma permissão "uma vez" gasta não gera linha na vez seguinte (vai perguntar de novo).
- Nunca mostra id, só o nome legível do alvo e a data.
- Texto fica em `chat.*` (pt/en) e usa só palavras da pessoa: permissão, perguntei, permitiu.

## Teste que o Gauge pode escrever contra isto

1. Dá a permissão (`grantBrainPermission`) → a persona faz a ação coberta → `listMessages` traz a mensagem com `permissionReuse.grantedAt` igual à concessão e **nenhum** cartão novo em `listApprovals`.
2. Permissão expirada (relógio falso) ou revogada → a persona pede aprovação e **não** vem `permissionReuse`.
3. `once`: primeira vez usa e traz `permissionReuse`; segunda pede aprovação.

## O que a UI já faz hoje (SB-7 nº 4)

`getBrainHome.activeGrants` só filtra revogadas; a UI (`SecondBrainHome`) agora esconde as **expiradas** do cartão "permissões ativas" e do contador (`grantIsActive`). A tela Permissões já tem o filtro "Expiradas".
