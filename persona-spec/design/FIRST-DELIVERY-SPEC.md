# Primeira entrega no onboarding: sem caminho que termine no vazio

Muse, 04/11. Fase A, item 1 do `design/UX-PHASE.md`. Implementação: Prism (`onboarding/OnboardingFirstDeliveryStep.tsx`), com Forge e Anvil para a tarefa e os eventos. Texto: `design/MICROCOPY.md`.

## O que já existe (Prism)

O passo 5 já é "Primeira entrega": mostra o pedido proposto (`step5.taskPreview`) e tem os botões "Pedir agora" e "Entrar sem pedir agora". Depois vem o estado "Equipe trabalhando" e, por fim, a celebração com o `MilestoneCard`.

## O buraco

A fase só tem `intro | working | celebrate`. **Não existe saída quando dá errado:**
1. **Sem motor pronto:** "Pedir agora" leva a "Equipe trabalhando" sem ninguém para trabalhar.
2. **Falha da execução** (não logado, cota, rede): a pessoa fica em "trabalhando" para sempre.
3. **Demora** (1º uso, motor lento): não há sinal de progresso nem permissão para seguir.

Isso explica os dois dogfoods: 0/20 execuções reais, sem nenhuma mensagem para quem usa. RCD: *Deliver the promised result before teaching mechanics*, *Never ship a blank dashboard*, *Celebrate the activation moment*.

## Fases (máquina de estados)

```
intro ──(sem motor pronto)──▶ needsEngine ──Conectar──▶ (passo 3) ──▶ intro
intro ──Pedir agora──▶ working ──entrega──▶ celebrate
                          │ ├──45 s──▶ slow  ──entrega──▶ celebrate
                          │ └──erro com code──▶ failed ──Tentar de novo──▶ working
                          └──(qualquer fase) Entrar no app: a entrega chega no #geral e na Visão geral
```

| Fase | O que a pessoa vê | Ação primária | Secundária |
|---|---|---|---|
| `intro` | O pedido proposto, editável numa linha: "O pedido: Resumir em 5 pontos…" | **Pedir agora** | Entrar sem pedir agora |
| `needsEngine` (novo) | "Falta uma IA para a equipe trabalhar." / "Conecte uma ferramenta de IA e a primeira entrega sai em seguida." | **Conectar uma IA** (volta ao passo 3) | Entrar sem pedir agora |
| `working` | A persona que pegou o pedido em pose `trabalhando`, "{name} está no pedido", e a atividade viva (`ActivityGroup`: leu o Cofre…) | — | Entrar e acompanhar |
| `slow` (novo, aos 45 s) | Mantém o `working` e acrescenta: "Ainda trabalhando. Pode entrar no app; a entrega chega no #geral e eu te aviso." | **Entrar e acompanhar** | Continuar esperando |
| `failed` (novo) | O `RunErrorCard` da persona, com o mesmo código, texto e ação da RUN-ERRORS-SPEC. Ex.: "O Claude não está conectado neste computador." | A ação do código (Tentar de novo, Trocar de conta…) | Entrar no app |
| `celebrate` | O `MilestoneCard` "Primeira entrega" + o resultado em 3 linhas + **Aceitar** (vira o marco de ativação) | **Aceitar e entrar** | Pedir ajuste |

**Regras:**
- **Nunca** deixar a pessoa em `working` sem saída. "Entrar e acompanhar" aparece desde o 1º segundo como link e vira primário no `slow`.
- Ao entrar no app com o pedido em curso, a Visão geral mostra o cartão "Primeira entrega a caminho" no topo, que vira o `MilestoneCard` quando a entrega chega (peak-end).
- `needsEngine` é decidido **antes** do clique: a UI já sabe pelo `listConnections`. O passo 3 deixa de oferecer "Continuar sem conectar" como saída silenciosa; continua possível, mas o passo 5 diz o que falta.
- Reduced-motion: a pose fica parada e a atividade entra sem animação.

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| step5.needsEngineTitle | Falta uma IA para a equipe trabalhar. | The team needs an AI to work. |
| step5.needsEngineBody | Conecte uma ferramenta de IA e a primeira entrega sai em seguida. | Connect an AI tool and the first delivery comes right after. |
| step5.connectEngine | Conectar uma IA | Connect an AI |
| step5.enterAndFollow | Entrar e acompanhar | Go in and follow along |
| step5.slowBody | Ainda trabalhando. Pode entrar no app; a entrega chega no #geral e eu te aviso. | Still working. You can go in; the delivery arrives in #general and I’ll let you know. |
| step5.keepWaiting | Continuar esperando | Keep waiting |
| step5.acceptAndEnter | Aceitar e entrar | Accept and go in |
| step5.askChange | Pedir ajuste | Ask for a change |
| overview.firstDeliveryOnTheWay | Primeira entrega a caminho | First delivery on the way |

## Contrato (Forge e Anvil)

- A tarefa de boas-vindas é uma **Tarefa comum**, criada pela Coordenação com o `step5.activationPrompt`. Vai para a persona com o motor pronto mais rápido (dica de velocidade dos testes do runner) e tem um orçamento pequeno e fixo, de 1 rodada.
- Os eventos abaixo alimentam o funil local de Uso › Insights e o E2E. Nada sai do computador.

| Evento | Quando | Campos |
|---|---|---|
| `first_delivery_requested` | clique em Pedir agora | `engine`, `ms_since_onboarding_start` |
| `first_delivery_failed` | erro com code | `code`, `ms` |
| `first_delivery_done` | entrega pronta | `ms` |
| `first_delivery_accepted` | Aceitar | `ms` |

- **Ativação = `first_delivery_accepted`.**

## Aceite

1. **E2E (Probe) com fake CLI**, nos três caminhos:
   - feliz: `celebrate` em ≤ 10 s;
   - sem motor: `needsEngine` antes do clique;
   - falha: o código `not_logged_in` mostra o `RunErrorCard` com "Tentar de novo".
   Nenhum termina num estado sem ação.
2. **1º uso instalado (Muse, `first-run.mts`):** mede o tempo até `celebrate`, ou até `failed` com a causa.
3. **Capturas** das 6 fases, claro e escuro, com axe 0.
4. **Métrica de fase:** % de primeiros usos com `first_delivery_accepted` em ≤ 10 min, com meta de ≥ 70%.
