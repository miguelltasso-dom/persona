# Revisão por captura: Visão geral, #geral e onboarding (C5a, C5d, PRO-4)

Muse, 04/11.
- **Capturas:** `design-shots.mjs` no app real (perfil persona, home temporário, porta livre, trava `build`), claro e escuro, em `.maestri/tmp/shots/design/{overview,channel,onboarding}-*.png`.
- **Console:** 0 erros.

## O que já está à altura das ilustrações
- **#geral:** a faixa da equipe com as poses por estado (dormindo com o "zzz" desenhado; a Luna no laptop trabalhando), o céu com lua no escuro, as pílulas de nome e o composer com "Quem responde" e o avatar.
- **Visão geral:** o "Olá!" com o sublinhado, "Precisa de você" primeiro e a coluna "Agora", com quem está trabalhando e quem descansa, mais a fila.
- **Onboarding:** a banda com os 5 bichos acenando, o stepper e os modelos de equipe com retrato.

## Ajustes

| # | Onde | O que se vê | Correção | Dono |
|---|---|---|---|---|
| 1 | Visão geral › Precisa de você | "**1 PENDENTES**" | Plural: `overview.attentionCount` e `sidebar.approvalsPending` com uma forma para 1 ("1 pendente") e outra para mais ("{count} pendentes"). Antes de trocar, grep: os testes `decisions-cycle` e `rail-approvals-badge` usam o texto. | Prism |
| 2 | Faixa da equipe e "Agora" | A pílula diz "**Descansando · zzz**". O "zzz" já está desenhado na pose, e o leitor de tela lê "zê zê zê". | `team.statusResting`: "Descansando". Se quiser o zzz na pílula, só como glifo `aria-hidden`. (grep: `locale/chat`, `shell`) | Prism |
| 3 | Visão geral › Precisa de você | O pedido mostra a inicial "**A**", não o retrato do Atlas. | Passar o `avatarSrc` de quem pede, como no FR-5. | Lumen (linha do `Decision`) |
| 4 | Visão geral, cartão "Primeira entrega" (escuro) | "Quem fez" mostra a **"E" Equipe 1**, um rosto genérico. | Mostrar a persona que entregou (retrato + nome). "Equipe" só quando forem várias, com os avatares empilhados. | Prism |
| 5 | Onboarding, passo 5, intro (1440×900) | O modal não cabe: a banda e o balão "Guia" saem **cortados** no topo, e a página rola por trás. | No passo 5, use a banda compacta (~96 px, só os bichos) ou deixe o cabeçalho fixo com rolagem só no conteúdo. O balão nunca cortado. | Prism |
| 6 | Onboarding, passo 5, intro | A apresentação da equipe vem de **`MOCK_INTRO_LINES`**: Atlas, Bento e Nina fixos, mesmo se a equipe escolhida for outra. | Gerar as linhas da equipe contratada no passo 4 (nome + função de cada persona). Texto fixo de exemplo não entra no produto. | Prism |
| 7 | #geral, dica "Quem responde" | A seta do balão aponta para o campo de mensagem, não para o seletor "Quem responde". | Ancorar a seta no centro do seletor (UX-PHASE-PRISM-SPEC §1). | Prism |
| 8 | Rail, botão Configurações | "⚙Configurações": o ícone está colado no texto. | `gap: var(--persona-space-2)` entre o ícone e o rótulo, como nos itens do rail. | Prism |
| 9 | Visão geral › aviso "Primeira entrega a caminho" | Usa o ícone de **interrogação** para um aviso informativo. | **Resolvido na fonte (Muse):** o `Notice` usava `help` (?) como padrão do tom info. Agora usa o glifo novo `info` (i), e vale para todo aviso informativo do app. Para "a caminho", o Prism ainda pode passar `icon="clock"`. | Muse ✔ |
| 10 | Visão geral, layout | Abaixo de "Precisa de você" sobra uma coluna vazia, enquanto "Agora" desce. | Com ≤ 2 pendências, mostre embaixo "Enquanto você estava fora" ou "Últimas entregas" (já existem), para não deixar o buraco. | Prism (P2) |

**PRO-4 (os 3 estados honestos):** as capturas mostram `working` e `resting` com texto e ícone. Os estados `stuck` e `waiting` não aparecem nos dados de exemplo, então o aceite deles fica para a captura com o host real (o Probe tem os cenários).
