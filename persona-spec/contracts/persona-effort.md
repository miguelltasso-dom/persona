# Contrato — modelo e esforço da PERSONA chegam à CLI (EFF-1, D-088)

Tally (runner) · Anvil (campo e Remote do host) · Quill/Prism (menu na tela). v1.1. Provas: `persona-runners/tests/persona-effort.spec.ts` (10), `model-menu.spec.ts` (4).

## Regra

O modelo e o **esforço de raciocínio** que a pessoa escolheu para uma persona são o que a CLI roda. **Sem escolha = o padrão do motor**: nenhuma flag é enviada, nada é inventado. O que a tela oferece vem do **motor**, nunca de uma lista fixa (hoje a tela grava `sonnet` fixo: não funciona).

## O menu vem do motor

`detectConnections` (cartão por CLI) ganha `modelMenu?: { id, label?, efforts?, defaultEffort?, disabled? }[]` ao lado de `models: string[]` (que não muda). Medido na CLI real 2.1.318: cada modelo traz nome, descrição e os **níveis de esforço que aceita** (`default/opus/fable/sonnet/haiku`: `low · medium · high · xhigh · max`; modelos antigos como `claude-opus-4-6` e `claude-sonnet-4-6` **não têm** `xhigh`; `claude-haiku-4-5-20251001` não tem esforço nenhum). A tela mostra, para o modelo escolhido, **só** os níveis dele; sem `efforts` = sem escolha de esforço para aquele modelo. `disabled: true` = o motor lista o modelo mas se recusa a rodá-lo (a razão do motor nunca vai à tela).

## O que o host passa

`PersonaRunnerSpec` (CLI) ganha `effort?: string`; o host copia o valor gravado da persona (campo novo da persona, Anvil) para o spec. `StartTurnInput.effort?` é o mesmo valor por turno.

| situação | o que a CLI recebe |
|---|---|
| tarefa (modelo próprio da persona) com esforço escolhido | `--model <id>` e `--effort <nível>` |
| sem esforço escolhido | só `--model <id>` (ou nada, se o modelo é `default`) |
| conversa/triagem (modelo barato de conversa) | **sem** esforço: o esforço é do modelo próprio da persona, não do barato |
| Codex, OpenCode, Cursor | **sem** esforço por enquanto (cada um tem outro botão; sem prova, não se manda uma opção que ele pode recusar) |
| o motor **recusa** o esforço (modelo sem menu de esforço) | a sessão **reabre sem ele**, a chamada não falha e o uso registra `effortDropped: '<nível pedido>'` |

## Interações

- **AO-1 (`answer-only`)**: o isolamento restaura o esforço que a pessoa tem no Claude dela (as `modelSettings` somem com `--setting-sources project`); quando a **persona** escolheu um esforço, o dela **vence** e o restaurado não é enviado (`--effort` nunca aparece duas vezes).
- **Sessão quente**: o esforço entra na chave da sessão (`warmKey`) e do pool (`sessionPoolKey`, sem mudar a chave antiga quando não há esforço). Trocar o esforço nunca reaproveita uma sessão aberta com o antigo.
- **Registro**: `RunnerUsage.effortDropped?` quando o motor recusou. O esforço pedido e o aplicado ficam visíveis; nada some em silêncio.

## O que falta (outros donos)

Anvil: campo `effort` na persona (store/Remotes `createPersona`/`updatePersona`) e cópia para o spec; Quill/Prism: o seletor de modelo e de esforço a partir de `modelMenu`, e parar de gravar `sonnet` fixo; Muse: a forma. Teste seco combinado: o argv leva `--model`/`--effort` da persona e, sem escolha, o padrão do motor (já coberto no runner).
