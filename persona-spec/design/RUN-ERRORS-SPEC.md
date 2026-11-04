# Erros de execução: o que aconteceu, o que fazer, um botão útil

Muse, 04/11. Pedido do Atlas: revisão final da microcópia dos erros que aparecem quando uma persona tenta trabalhar e não consegue. Tom e glossário: `design/MICROCOPY.md`.

## Problema

Hoje o texto nasce no runner e no host, e vai cru para o chat:
- "CLI codex não está logada. Abra o terminal e rode codex login";
- "Modelo X indisponível neste runner";
- "O executor DSH não está montado neste host";
- "Cota de X esgotada. Espere a janela resetar";
- "orçamento de tokens do mês esgotado".

Isso traz jargão, sem botão e sem dizer quanto tempo falta.

## Regra

Todo erro de execução tem três partes e aparece **como cartão da própria persona** na conversa onde o pedido foi feito (primitivo `RunErrorCard`):
1. **O que aconteceu**, em uma frase, com o nome do provedor e nunca o da CLI ou do runner;
2. **O que fazer**, com o tempo quando houver e o comando para copiar quando for preciso;
3. **Um botão útil** que resolve, e no máximo um secundário.

A tarefa **não se perde**: o cartão diz que ela fica guardada quando for verdade. Na faixa e no cartão da persona, o estado é "Precisa de ajuda" (UX-GUIDE §2.4), e o quadro mostra a tarefa em "Bloqueado / Precisa de você".

## Contrato

O runner e o host mandam **o código**, não o texto. Os textos abaixo também servem de reserva em pt quando a UI não reconhecer o código.

```ts
type RunErrorCode = 'not_logged_in' | 'cli_not_found' | 'model_unavailable' | 'quota_exhausted'
  | 'budget_exhausted' | 'provider_unreachable' | 'engine_unavailable' | 'app_offline'
interface RunErrorPayload { code: RunErrorCode; provider?: string; model?: string; account?: string; resetAt?: string /* ISO */; command?: string; otherAccount?: boolean }
```

O cliente traduz com `describeRunError(payload)` (`primitives/run-errors.ts`), que devolve as chaves de texto (`chat.runError.*`) e as ações (`ActionId`). O Prism liga cada ação a um handler.

## Os 8 estados

| Código | O que aconteceu | O que fazer | Botão | Secundário |
|---|---|---|---|---|
| `not_logged_in` | O {provider} não está conectado neste computador. | Faça login uma vez no terminal e tente de novo. A Persona nunca pede sua senha. (mostra `{command}` com Copiar) | **Tentar de novo** | Como conectar (Ajuda › Conexões) |
| `cli_not_found` | O {provider} não está instalado neste computador. | Instale o {provider} ou escolha outro motor para esta persona. | **Escolher outro motor** | Como instalar (Ajuda › Conexões) |
| `model_unavailable` | O modelo {model} não está disponível no {provider}. | Escolha outro modelo; o resto da persona continua igual. | **Escolher outro modelo** | — |
| `quota_exhausted` (com outra conta) | A conta {account} do {provider} chegou ao limite. | Volta às {time}. Você pode trocar de conta agora; a tarefa continua de onde parou. | **Trocar de conta** | Esperar e retomar sozinho |
| `quota_exhausted` (sem outra conta) | A conta {account} do {provider} chegou ao limite. | Volta às {time}. A tarefa fica guardada e retoma sozinha quando a cota voltar. | **Retomar quando voltar** (já marcado) | Usar outro motor |
| `budget_exhausted` | O orçamento deste mês para {persona} acabou. | Aumente o limite em Regras, ou espere o próximo mês. Nada foi perdido. | **Ajustar limite** | Ver uso |
| `provider_unreachable` | Não consegui falar com o {provider} agora. | Parece um problema de internet ou do serviço. A tarefa fica guardada e eu tento de novo em alguns minutos. | **Tentar agora** | — |
| `engine_unavailable` | O motor de {persona} não está disponível neste computador. | Escolha outro motor para {persona} continuar. | **Escolher outro motor** | — |
| `app_offline` | A equipe está fora do ar. | Abra a Persona neste computador; as tarefas retomam de onde pararam. | **Tentar reconectar** | — |

**Tons:** aviso (âmbar) quando passa sozinho ou com um clique (cota, internet); perigo (vermelho) só quando nada anda sem você (não instalado, motor indisponível). Nunca o vermelho para cota.

**Tempo:** `{time}` em hora local ("às 18:30"). Se for amanhã, use "amanhã às 9:00". Sem `resetAt`, a frase vira "Volta quando o {provider} liberar de novo".

## Não fazer

- Nome de CLI, runner, host, executor ou "DSH" no texto.
- "Espere a janela resetar".
- Stack, código HTTP ou JSON na mensagem (no máximo em "Detalhes para o suporte").
- Pedir token ou senha.
- Mais de 2 botões.
- Culpar a pessoa ("você não fez login").

## Aceite

- **Teste `run-errors`:** cada código vira título, corpo e ação, com os parâmetros preenchidos, e nenhuma string de saída contém CLI, runner, host, executor ou DSH.
- **Capturas** do `RunErrorCard` nos 8 estados, claro e escuro, com axe 0.
- **Rivet e Anvil:** os `MESSAGES` e `CLI_CHANNEL` atuais trocados pelos textos de reserva desta tabela, mais o `code` no evento.
