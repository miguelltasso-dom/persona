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

## Revisão do código do Prism, antes das capturas (Muse, 04/11)
`onboarding/OnboardingFirstDeliveryStep.tsx`.

**Certo:**
- as 6 fases;
- `needsEngine` com a `empty-sem-ia` a 240;
- `failed` com o `RunErrorCard` e o avatar (FR-5), e a arte só nas falhas de "sem IA";
- `slow` com "Entrar e acompanhar" como primário e "Continuar esperando";
- "Entrar e acompanhar" presente desde o 1º segundo;
- o `celebrate` com o `MilestoneCard`.

**Ajustes (Prism):**
1. **`working` sem a persona.** A spec pede a persona que pegou o pedido **em pose `trabalhando`**. Hoje tem só um chip e o nome. Use `poseUrl(workingCharacterId, 'trabalhando')` a ~160 px de altura, à esquerda do texto (empilhado abaixo de 560 px). Sem `workingCharacterId`, use o avatar da Coordenação. É o momento que mais vende a ideia de "equipe com rosto".
2. **Rótulos do `ActivityGroup` fixos em português,** com "comando(s)", "contratação(ões)": o inglês quebra, e o plural com parênteses é texto de sistema. Use o `activityGroupLabelsFromDict` (governance), que já está no locale, em vez de repetir os rótulos.
3. **O `aria-live="polite"` cobre a seção inteira,** incluindo o `ActivityGroup` que se atualiza: o leitor de tela reanunciaria tudo a cada passo. Deixe o live só numa linha de estado curta ("{name} está no pedido" → "Ainda trabalhando…" → "Pronto"). Tire o atributo da `section` nas fases `working`, `slow` e `needsEngine`.

**Ajuste (Lumen, dono de `governance/activity-group-labels.ts`):** plural de verdade nas chaves `activity.*`, que hoje dizem "rodou {count} comando(s)", "mandou {count} mensagem(ns)". Proposta: chaves `.one` ("rodou 1 comando") e a forma plural ("rodou {count} comandos"), escolhidas por `count === 1` no `activityGroupLabelsFromDict`, nas duas línguas. Assim corrige a Visão geral, o perfil, a Saúde da equipe e o passo 5 de uma vez.

## Medição na rodada real do V1-P0-5 (D-069; o Probe executa, a Muse mede)

**Uma rodada só.** A Muse não faz chamada real própria. O script do Probe grava os marcos num JSON (`timeline`), em ms desde o anexo da janela, e salva uma captura em cada marco. Até haver o atributo de fase (pedido ao Prism abaixo), os marcadores são o texto e o papel na tela:

| Marco | Como detectar | Nota |
|---|---|---|
| `boot` | o 1º quadro da splash → o passo 1 visível | contexto (FR-4), fora da conta |
| **`t0` pedido** | o instante logo antes do clique em **"Pedir agora"** | **início da medição** |
| `working` | o título **"Equipe trabalhando"** visível | ≤ 1 s depois do t0, senão é achado de UX |
| `slow` | o texto "Ainda trabalhando." visível (se aparecer) | mostra se passou de 45 s |
| `failed` | o `RunErrorCard` visível, com o código | encerra a medição como falha |
| **`t1` entrega** | o botão **"Aceitar e entrar"** visível (o `MilestoneCard`) **ou** a 1ª mensagem de persona no #geral depois do t0, o que vier primeiro | **o número principal: t1 − t0** |
| `geral` | a 1ª mensagem de persona (autor ≠ "Você") no #geral depois do t0 | a confirmação de que a entrega também está no #geral |
| `t2` aceite | o clique em "Aceitar e entrar", feito logo pelo script | registra que o marco de ativação fecha. O tempo de leitura humano não conta |

**Relatar:** t1 − t0 (alvo: o feliz em ≤ 10 s pela spec, e o 1º uso ≤ 2 min no PLAN), o `working` − t0, se o `slow` apareceu, o t2, mais os tokens e o custo que o Probe já mede.

**Pedido ao Prism, para robustez:** `data-first-delivery-phase="{phase}"` na `section` do passo 5, para a medição não depender de texto.
