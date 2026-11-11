# PROTOCOLO DE DECISÃO · Avaliação da Base Open Source de 11/11

**Autor:** CARBON (Crítico-Chefe e Diretor Criativo) · **Para:** Miguel (Dono) e Atlas (CTO) · **Data:** 11/11/2026
**Regra de ouro deste protocolo:** escrito **antes** do lançamento para blindar a equipe contra dois erros clássicos — *síndrome do brinquedo novo* (jogar fora meses de produto por uma demo bonita no README) e *apego a código afundado* (defender o nosso `persona-host` de 7.800 linhas se aparecer um motor realmente superior).

**As 3 opções em julgamento:**
- **(A) Reconstruir na base deles:** adotar o runtime/orquestrador deles como fundação e portar `client-ui-persona`, ativos e diferenciais da Persona.
- **(B) Manter nossa base + transplantar módulos:** preservar nosso app/store/UI e substituir cirurgicamente os subsistemas onde eles forem melhores.
- **(C) Só colher ideias:** manter 100% da nossa árvore e reimplementar apenas padrões de prompt, UX ou algoritmos que valham a pena.

---

## 1. Critérios ELIMINATÓRIOS para a Opção (A) — Checagem de 45 min (Passa / Reprova)

Se a base nova **reprovar em qualquer um** dos 5 itens abaixo, **a Opção (A) está descartada na hora** (seguimos apenas entre **B** e **C**):

1. **Licença limpa para produto comercial fechado/híbrido:** exige `MIT`, `Apache-2.0`, `BSD` ou `ISC` sem cláusula restritiva. `AGPL`, `GPL`, `SSPL`, `BSL` ou `Commons Clause` eliminam **(A)** e proíbem cópia de código em **(B)** (sobra apenas **C**).
2. **Windows 10/11 nativo de 1ª classe:** precisa rodar e empacotar no Windows sem exigir WSL2, Docker Desktop, compilação manual pelo usuário final ou daemon exclusivo de macOS/Linux (`POSIX-only` = **reprovado**).
3. **Uso real das ASSINATURAS da pessoa via CLIs oficiais (não só chave de API):** precisa operar sobre as contas que o usuário já paga (`claude`, `codex`, `cursor`, `opencode`) ou aceitar acoplamento limpo delas em ≤ 3 dias, **sem** exigir `API key` paga por token como único modo e **sem** extrair cookies/tokens OAuth internos que causem banimento de conta.
4. **Segurança, isolamento e permissões fora do prompt:** arquitetura compatível com *local-first* (segredos no cofre do SO, sem nuvem obrigatória deles lendo tudo), possibilidade de bloquear escrita fora de rascunho e interceptar ações destrutivas (`enviar/publicar/pagar/apagar`) por código determinístico, nunca "pedindo por favor no prompt" com `bash` solto na pasta do cliente.
5. **Manutenção ativa e código auditável (não *demoware*):** repositório com testes automatizados reais que rodam, fronteiras de módulos legíveis, commits/mantenedores ativos e zero dependência oculta de backend fechado deles para a equipe funcionar.

---

## 2. Matriz de PONTUAÇÃO (0–100 pts) e Gatilho Matemático de Decisão

| # | Critério | Peso | Nota 0 (Fraco) | Nota Máxima (Excelente) |
|---|---|---:|---|---|
| **P1** | **Conversa em equipe e proatividade reais** | **25** | Teatro de prompt; agentes se atropelam, repetem jargão ou param esperando empurrão. | Handoff com contexto limpo, vozes distintas, revisão visual real e puxada/watchdog sem loop nem spam. |
| **P2** | **Arquitetura, leveza e velocidade** | **15** | Mais um Electron/Python pesado (> 800 MB RAM, boot lento, sem `steer`/streaming real). | Boot < 3 s, RAM parada < 400 MB, GPU ociosa ≤ 2%, estado transacional único e streaming/cancel limpos. |
| **P3** | **Economia de tokens na assinatura** | **15** | Reempilha histórico/arquivos inteiros em todo turno; queima a janela de 5h em 3 pedidos. | Contexto enxuto por papel, alto reaproveitamento de cache, zero MCP ocioso e controle de concorrência. |
| **P4** | **Distância do nosso domínio e da nossa UI** | **15** | Focado em chat/terminal dev; sem conceito de Projeto, Quadro, Rascunho, Aprovação ou Cofre. | Entidades mapeáveis 1:1 para Projetos, Tarefas, Aprovações, Revisão de arquivos e `client-ui-persona`. |
| **P5** | **Extensibilidade multi-motor e conectores** | **10** | Preso a 1 provedor/SDK ou exige editar o loop central para plugar ferramentas e skills. | Plugável por adaptador limpo (CLIs + MCP por agente + skills + memória local). |
| **P6** | **Custo de migração até paridade da v1.1** | **20** | **> 5 semanas** (0 pts) · **3–4 sem.** (10 pts) · **≤ 2 semanas** (20 pts). | Portar nossa UI + Cofre + Rascunho + Governança leva **≤ 2 semanas** reais provadas no código. |

**Regra de decisão sem subjetividade:**
- **Escolher (A):** **5/5 eliminatórios aprovados** + nota **≥ 75/100** + vantagem clara nos motores (**≥ 42/55** na soma `P1+P2+P3`) + migração provada em **≤ 3 semanas**. *(Acima de 3 semanas de porte é veto automático a **A**: congelar o produto por um mês mata nosso timing.)*
- **Escolher (B):** licença permissiva + nota **45–74/100** (ou vitória nítida deles em 1–2 módulos isoláveis que economizem ≥ 4 dias do nosso roteiro).
- **Escolher (C):** nota **< 45/100**, licença restritiva ou código tão acoplado que transplantar custa mais caro que consertar em casa.

---

## 3. Teste Lado a Lado nas Primeiras Horas ("Desafio Padaria Lua")

Assim que o código passar pelos eliminatórios (e com liberação do Atlas para rodar em pasta isolada), executamos **exatamente o mesmo caso** onde a nossa `real-attempt-5` falhou, fixando o **mesmo modelo** nos dois lados e uma equipe equivalente de 3 papéis (*Coordenação, Redação, Arte*) + a mesma `foto.png`:

> **Pedido único (sem palavras mágicas de ferramenta):** *"Faz o texto e a arte de um cartaz 1080x1350 para o Instagram da Padaria Lua: promoção de pão de queijo em dobro (2 por R$ 9), de sexta a domingo, pedidos pelo WhatsApp (11) 91234-5678. A foto anexa é o rascunho atual."*

| Métrica objetiva | Persona hoje (`real-attempt-5`) | Meta Persona (`D-100` / `D-101`) | Base Nova (medir) | Critério de vitória deles |
|---|---|---|---|---|
| **1. Entrega ponta a ponta** | **Falhou** (`ran-out-of-turns`) | **Passa** (1 texto + 1 arte revisada) | `[0 / 1]` | Entregar 1 arte coerente com o copy sem ajuda humana. |
| **2. Turnos pagos totais** | `12` (bateu no teto) | `≤ 6 turnos` | `[n]` | `≤ 6 turnos` sem trabalho duplicado. |
| **3. Tokens totais (`in` / `out`)** | `469.479 in` / `23.046 out` | `≤ 120.000 in` | `[in / out]` | `< 120k input` mantendo contexto entre colegas. |
| **4. Tempo total e 1º sinal vivo** | `348 s` · streaming mudo em Tarefa | `< 120 s` · 1º delta `< 4 s` | `[s / ms]` | Streaming real por agente + entrega `< 120 s`. |
| **5. Colisões e falsos bloqueios** | `2` SVGs paralelos + `2` bloqueios falsos | `0` duplicações · `0` bloqueios falsos | `[count]` | `0` artes concorrentes; usar o WhatsApp dado sem travar. |
| **6. Higiene humana no fio** | `3` falhas (`"a pessoa"`, `"NOVA VERSÃO:"`, Bia em 3ª pessoa) | `0` vazamentos/jargões | `[count]` | `0` marcadores crus, `0` checklists robóticos, vozes distintas. |
| **7. Proatividade e silêncio (15 min)** | Vigia repete `nudge+escalate` em todo tick | Puxa fila aberta; **0 chamadas** sem meta | `[calls]` | Puxa próximo passo real; `0 tokens` ocioso; recupera 1 queda. |
| **8. Peso no Windows (repouso)** | `1,18 GiB` disco · `1.120 MB` RAM · `22%` GPU | `< 750 MB` disco · `< 550 MB` RAM · `≤ 2%` GPU | `[MB / %]` | `< 450 MB` RAM parada, `≤ 2%` GPU, abertura `< 3 s`. |

---

## 4. O Que Avaliar em 4 Horas e Quem Faz

Nada de 10 agentes batendo cabeça. Timebox duro de **4 horas** a partir do link do Miguel, preservando a cota de Claude (`D-104`):

- **Hora 0–1 · Triagem Eliminatória e Raio-X do Repositório (Agentes DeepSeek: Cobalt + Zinc):**
  Checar os 5 eliminatórios (`LICENSE`, suporte real a Windows, suporte a CLIs de assinatura vs API key, modelo de permissão/segurança, testes reais e LOC por pacote). **Saída em T+60 min:** se reprovar em qualquer eliminatório, **(A) é enterrada ali mesmo** e as 3h seguintes focam 100% em extrair o que presta para **(B)** ou **(C)**.
- **Hora 1–2,5 · Autópsia Exaustiva de Código em Paralelo (Agentes DeepSeek):**
  - *DeepSeek #1 (Cobalt — Runtime, Peso e Runners):* dissecar processo host, IPC, streaming/`steer`/cancelamento, gestão de CLIs/MCPs, consumo de tokens/compactação e empacotamento desktop.
  - *DeepSeek #2 (Zinc — Orquestração, Equipe e Proatividade):* dissecar máquina de estados de tarefas, grafo de handoff, prevenção de loops, memória compartilhada, scheduler/heartbeat de proatividade e banco local.
- **Hora 1,5–3 · Crítica de Produto, Voz e Leitura Visual (CARBON):**
  Inspecionar a interface real, a ergonomia para usuários fora de TI, os transcritos e capturas do teste da Padaria Lua: julgar se a equipe deles *realmente conversa como gente* ou se é apenas chat multi-bot sem governança, sem rascunho e sem entrega revisável.
- **Hora 3–4 · Cálculo Frio de Migração e Veredito (CARBON + síntese técnica para o Atlas):**
  Preencher a tabela de 100 pontos com provas de arquivo:linha, estimar em dias o custo real de **(A)** vs **(B)** e entregar ao Miguel uma única recomendação fechada (`A`, `B` ou `C`) com lista nominal dos arquivos/ideias a absorver.

---

## 5. O Que da Persona é INEGOCIÁVEL Preservar em Qualquer Cenário

Mesmo que a base nova tirasse `90/100`, **nunca** abriríamos mão destes 5 pilares que definem a Persona:
1. **Assinatura que a pessoa já paga, zero taxímetro em dólar na tela (`D-092`):** execução local via CLIs oficiais, rotação entre contas e gestão por `% da janela` (nunca obrigar cliente comum a comprar créditos de API).
2. **Produto para qualquer empresa ou profissional, não IDE de programador:** português do Brasil humano, Quadros por projeto com fluxos reais (Marketing, Atendimento, Contratação, Site) e zero exigência de terminal ou Git manual.
3. **Direção Visual D e "A Casa da Equipe":** animais ilustrados expressivos com poses vivas por estado, escritório claro/noturno e identidade quente — proibido regredir para tela genérica de SaaS com avatares de letrinha.
4. **Rascunho seguro + Governança humana (`D-084`, `D-095`, `D-099`, `GOVERNANCE`):** arquivos salvos primeiro em rascunho revisável (*Antes · Depois*), trava determinística com prévia antes de enviar/publicar/pagar/apagar e organograma *"Quem cuida de quem"*.
5. **Posse local da memória da empresa:** Cofre no DPAPI do Windows + Segundo Cérebro em Markdown tipado + *"Traga o que suas IAs já sabem"*, sem trancar os dados do dono na nuvem de terceiros.

---

## 6. Opinião Preliminar do CARBON: O Que Esperar + O Que PAUSAR e CONTINUAR Agora

**Julgamento preliminar (antes de abrir o código):** A chance real de **(A)** vencer é **baixa (~10–15%)**; a de **(B)** é **alta (~60%)** e a de **(C)** é **~25%**. Projetos open source de "equipe de agentes que conversam" quase sempre brilham na fluidez do diálogo e na leveza inicial, mas costumam falhar em três pontos fatais para nós: **(1)** exigem `API keys` pagas por token (que explodem a fatura quando 4 agentes conversam sozinhos), **(2)** tratam segurança como prompt sobre `bash` aberto, e **(3)** não têm metade da nossa camada de produto para não-programadores (`client-ui-persona` com 1.579 testes, Revisar mudanças, Aprovações, Cofre, Quadros, múltiplas contas e isolamento `D-085`/`D-096` que já cortou 99,6% do overhead de MCP). **Porém**, justamente onde hoje sangramos (`splitByFunction` × `pass_forward`, `oar/session.ts` e `persona-host` inchado), eles podem ter acertado em cheio — e teremos zero vaidade para transplantar o módulo deles hoje mesmo se for melhor.

**Ordem imediata para as próximas 4 horas (sobre as decisões `D-100..D-104` do Atlas):**
- **PAUSAR AGORA (evitar código jogado fora se `A` ou `B` trouxer peça melhor):**
  1. **Pausar a cirurgia de orquestração da `D-100` (`orchestration.ts`, `harness-team.ts`, `watchdog.ts`):** não faz sentido redesenhar o grafo de handoffs e o Vigia às 10h se às 14h podemos adotar um protocolo de conversa/puxada superior deles.
  2. **Pausar a reescrita de sessão/steer da `D-102` (`oar/session.ts`):** esperar ver como eles fazem streaming, cancelamento de árvore de processos e retomada.
  3. **Pausar 100% da `D-104` (`v1.2`, itens do T3 e apostas novas):** zero frente nova antes do veredito de 4h.
- **CONTINUAR SEM FREIO (trabalho 100% útil em `A`, `B` ou `C` — zero desperdício):**
  1. **Continuar `D-101` de dieta de pacote e GPU na UI:** cortes 1–6 do `DIETA.md` (tirar LibreOffice/Python/locales do instalador), poda declarativa do `cordis.patch.yml` e pausa de animações/blurs sem foco no `client-ui-persona` (nossa UI vai junto em qualquer cenário).
  2. **Continuar `D-103 (c)` — Reforma do `preaccept.mjs` e consertos visuais puros de UI:** travas automáticas contra `"a pessoa"`, `"NOVA VERSÃO:"`, iniciais `[SR]` e controles duplicados + correção do chip `"Decide o rotineiro"` duplicado, popover preso, faixa escura e `Ctrl+V` de imagem no composer.
  3. **Continuar `D-103 (a/b)` de política seca de segurança** (regras de falha fechada por motor e semáforo de ≤ 2 chamadas por assinatura) + fixes pontuais de 5 linhas já isolados (`persistTurn` gravando `stored.model`, sem tocar em orquestração).
