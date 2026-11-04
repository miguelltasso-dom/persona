# Fase de UX pós-v1: as 10 maiores melhorias

Muse, 04/11. Pedido do Atlas. As fontes são:
- os dois dogfoods: `reports/dogfood-padaria.md` (Padaria Lua, 03/11) e `reports/dogfood-agencia.md` (Agência Ponto, 04/11);
- o `design/UX-BACKLOG.md`;
- a colheita do t3code (`design/T3-UX-HARVEST.md`);
- o Revenue-Centric Design (RCD, `.agents/skills/revenue-centric-design`).

## O achado que ordena a lista

**Nos dois dogfoods, a equipe nunca entregou trabalho de verdade.** A Agência Ponto registra "Execuções reais de CLI: **0 / 20**". Na Padaria Lua, o caminho real ficou preso no onboarding (DF-001 e DF-002, P0) e o resto rodou com o seed de dev. O produto promete "você pede, a equipe entrega", e nenhum dos dois passeios chegou à entrega.

Pelo RCD:
- **Measure activation, not signups**: a ativação da Persona é **a primeira entrega aceita**, não "concluiu o onboarding".
- **Deliver the promised result before teaching mechanics**: tudo que fica entre a pessoa e a 1ª entrega é o maior vazamento.
- **Map the whole journey to value, then fix the biggest drop**.

Por isso a lista começa pelo caminho até a 1ª entrega, segue pelo uso diário (confiança) e termina na volta da pessoa (retenção).

## Métricas sem telemetria

A Persona não manda dados para fora. Toda métrica abaixo é medida de três jeitos:
1. **Localmente**, no funil de Uso › Insights (só o dono vê), que já existe e ganha eventos novos;
2. **Pelos E2E do Probe**, com tempo por etapa (o `first-run.mts` da Muse já mede janela → onboarding → 1ª resposta);
3. **Por dogfoods** repetidos a cada fase, com o mesmo roteiro.

**Esforço:** P até 2 dias, M até 1 semana, G mais de 1 semana.

## As 10

### 1. A primeira entrega acontece no onboarding, e nunca termina no vazio
- **Problema:** o passo 5 já pede a 1ª entrega (Prism: "Pedir agora" → "Equipe trabalhando" → celebração), mas só tem as fases `intro | working | celebrate`. Sem motor pronto, com falha da execução ou com demora, a pessoa fica em "trabalhando" para sempre, sem mensagem. Nos dogfoods, a 1ª entrega real nunca aconteceu (0/20).
- **Solução** (spec completa em `design/FIRST-DELIVERY-SPEC.md`):
  - três fases novas: `needsEngine`, decidida antes do clique ("Falta uma IA para a equipe trabalhar" · Conectar uma IA); `slow`, aos 45 s ("Entrar e acompanhar"); `failed`, com o `RunErrorCard` do código;
  - "Aceitar e entrar" na celebração;
  - o cartão "Primeira entrega a caminho" na Visão geral;
  - os eventos locais `first_delivery_*`.
- **Impacto:** **ativação**, o maior de todos. RCD: *Deliver the promised result before teaching mechanics*, *Celebrate the activation moment*, *Never ship a blank dashboard*.
- **Esforço:** P/M. Prism (fases e texto), Forge (tarefa de boas-vindas com orçamento fixo), Anvil (eventos).
- **Métrica:** % de primeiros usos com **1ª entrega aceita em ≤ 10 min** (`first_delivery_accepted`); mediana do tempo até ela. Meta: ≥ 70% e ≤ 5 min. Nenhum caminho do E2E termina sem ação.

### 2. Um onboarding que nunca prende
- **Problema:**
  - o overlay volta depois de "Entrar" (DF-002, P0);
  - surgem dois "Continuar" com o assistente aberto (DF-001);
  - três caminhos competem no passo 4 (UX-17);
  - no app instalado, a janela ficou branca por 120 s (revisão de 1º uso da Muse, pacote `dfe13272c6`).
- **Solução:**
  - um caminho só, com a equipe sugerida pré-selecionada e o link "Não sabe? 3 perguntas e montamos com você";
  - o contrato `completeOnboarding` coberto por E2E no gate;
  - o onboarding retoma de onde parou;
  - a 1ª janela segue a `BOOT-SPEC` (splash ≤ 500 ms, prazo e "Tentar de novo"; protótipo pronto em `design/boot-prototype/`).
- **Impacto:** **ativação**. RCD: *Cut time-to-value by reorder and removal*, *Cut cognitive load*, *Put friction in the right place*.
- **Esforço:** M. Prism (onboarding), Rivet (boot), Probe (gate).
- **Métrica:** taxa de conclusão do onboarding e abandono por passo; tempo do clique no ícone até o passo 1 (meta ≤ 10 s, ou ≤ 60 s no 1º uso).

### 3. Conectar a IA sem terminal misterioso
- **Problema:** sem motor conectado, nada acontece, e o caminho para conectar é técnico: "CLI já logada", estados que não dizem o próximo passo (UX-11), e erros que antes saíam crus ("CLI codex não está logada").
- **Solução:**
  - no passo 3 e em Conexões, um cartão por ferramenta com **uma** ação: Instalar, Entrar (com o comando copiável e "Já fiz login" que verifica ao vivo) ou Pronta ✓;
  - o `RunErrorCard` em todo erro de execução (feito: spec, primitivo, host e runner mandando o código);
  - "Conectar uma IA" como primeira ação de todo vazio que depende disso.
- **Impacto:** **ativação e confiança**. RCD: *Strip the jargon before you blame onboarding*, *Add declarative friction, cut administrative friction*.
- **Esforço:** M. Lumen (Conexões), Prism (passo 3), Rivet (verificação ao vivo).
- **Métrica:** % de pessoas com ≥ 1 motor pronto ao fim do onboarding; % de erros de execução resolvidos pelo botão do cartão, sem sair da conversa.

### 4. Uma decisão, um lugar
- **Problema:**
  - a mesma decisão aparece em dois lugares (UX-01);
  - a contratação é proposta por **tarefa**, e não por função (UX-02);
  - o "Contratar X?" não apareceu no passeio (DF-010).
  - A pessoa não sabe o que já decidiu.
- **Solução:**
  - **Precisa de você** vira a única caixa de decisões, e cada cartão sai de todas as listas ao decidir, com o carimbo;
  - propostas de iniciativa agrupadas num resumo diário;
  - contratação só para função recorrente, com o porquê ("Toda semana chegam contratos para revisar").
- **Impacto:** **confiança**. RCD: *Reinforce the decision the user just made*, *Guide the eye*.
- **Esforço:** M. Lumen + Anvil (fonte única), Forge (regra de contratação).
- **Métrica:** tempo mediano até decidir; 0 decisões duplicadas (teste); % de propostas aceitas.

### 5. Falar com quem você quer
- **Problema:**
  - "Nova conversa" abre a primeira persona sem perguntar (UX-08, DF-006, DF-008);
  - "Responde: Atlas" não diz que **roteia** o pedido (UX-09);
  - o cartão do Perfil não abriu pelo rail no passeio (AG-002).
- **Solução:**
  - um seletor de persona com retratos e função antes de criar a DM;
  - "Quem responde" com uma dica na 1ª vez ("A Coordenação distribui; escolha alguém para falar direto");
  - perfil sempre a 1 clique do retrato.
- **Impacto:** **uso diário e confiança**. RCD: *Set the default*, *Cut cognitive load*.
- **Esforço:** P. Prism.
- **Métrica:** % de DMs iniciadas com a persona escolhida; % de pedidos no #geral com "Quem responde" trocado conscientemente.

### 6. Corrigir o rumo sem esperar
- **Problema:** com a persona trabalhando, a pessoa precisa esperar o turno acabar para corrigir. Hoje o composer já mostra "na fila / direcionar agora", mas o engine ainda não aplica o direcionamento.
- **Solução:** steer de verdade (t3code §4). "Direcionar agora" corrige o turno em curso; a mensagem na fila aparece como um balão tracejado, com "Mandar agora · Editar · Tirar". Também "Concluir assunto" e "Lembrar depois", que já estão nos assuntos.
- **Impacto:** **confiança e eficiência**: menos refação, sensação de controle.
- **Esforço:** G. Forge (steer no engine), Anvil (fila salva), Prism (balão).
- **Métrica:** % de turnos corrigidos com "direcionar" em vez de cancelar e repetir; pedidos repetidos sobre o mesmo assunto em 10 min (deve cair).

### 7. Projeto num só lugar, sprint num clique
- **Problema:**
  - "Projetos" e "Quadros" são duas entradas para o mesmo objeto (UX-03);
  - "Novo projeto" não pede o nome (DF-005/006);
  - não há como iniciar a Sprint 1 (DF-007, AG-001).
- **Solução:**
  - um item só, "Projetos": grade, e o clique abre o quadro na página do projeto;
  - criar um projeto pede nome e modelo;
  - na faixa da sprint vazia, "Planejar sprint", com a Coordenação propondo as tarefas da semana.
- **Impacto:** **ativação do 2º valor**, a equipe organizada por projeto, e **retenção** (ritual semanal). RCD: *Anchor one-time-job products to a recurring life event*.
- **Esforço:** M. Prism + Lumen (BOARDS-SPEC).
- **Métrica:** % de projetos novos com ≥ 1 tarefa em 24 h; sprints iniciadas por semana por espaço.

### 8. "Estou fora", e a equipe segura
- **Problema:**
  - não há como se marcar fora (DF-008, P1);
  - o "Enquanto você estava fora" não apareceu (DF-009);
  - o Teste dos 2 dias só simula.
- **Solução:**
  - um interruptor "Estou fora até…" no perfil e na pílula de presença (o `Switch` primitivo já existe);
  - aprovações vão ao substituto definido em Quem cuida de quem;
  - na volta, o resumo "Enquanto você estava fora" (peak-end), com as entregas e o que espera você.
- **Impacto:** **retenção**: a pessoa confia em se afastar e volta para um ritual bom. RCD: *Architect for what users fear losing*; peak-end rule.
- **Esforço:** M. Lumen + Prism (UI), Anvil (presença), Forge (rota de aprovação, que já existe).
- **Métrica:** % de pessoas que usam "Estou fora" pelo menos 1× no mês; % de voltas que abrem o resumo; aprovações roteadas ao substituto sem atraso.

### 9. Avisos só quando importa
- **Problema:** com a janela em segundo plano, a pessoa não sabe quando algo terminou ou precisa dela, e volta para conferir à toa (ou não volta).
- **Solução (t3code §14):**
  - aviso nativo do sistema com o rosto do bicho e o verbo, só para terminou, falhou, precisa de você ou fez uma pergunta: "Nina terminou *Pesquisa de preços*";
  - silêncio com a janela em foco;
  - a bandeja reflete "Precisa de você", e um resumo diário opcional.
- **Impacto:** **retenção**. RCD: *Design onboarding as a behavioral trigger*.
- **Esforço:** P/M. Rivet (desktop), Muse (conteúdo e regra).
- **Métrica:** % de avisos clicados; % de pessoas que desligam os avisos (deve ficar baixo); sessões por dia com volta por aviso.

### 10. Confiança visível: o que cada persona pode fazer
- **Problema:** a autonomia ("Sempre pergunta · Sugere e espera · Decide o rotineiro") e as permissões lembradas existem, mas ficam escondidas. A pessoa não sabe, na hora de pedir, o quanto aquela persona vai agir sozinha. A Agência não conseguiu nem ver uma permissão para revogar (AG-004).
- **Solução (t3code §13):**
  - um chip de autonomia junto de "Quem responde" quando foge do padrão;
  - no cartão da persona, "O que a {persona} pode fazer" (ferramentas, alcance, autonomia) com "Ajustar";
  - em Segundo cérebro › Permissões, cada permissão lembrada com validade e "Revogar" de um clique.
- **Impacto:** **confiança**, pré-condição para a pessoa dar mais autonomia (e a equipe entregar mais). RCD: *Reinforce the decision*, *Use precise numbers to signal truth*.
- **Esforço:** M. Prism (chip e cartão), Lumen (Permissões), Anvil (grants).
- **Métrica:** % de pessoas que sobem a autonomia de alguma persona em 14 dias; revogações (sinal saudável de controle); 0 ações sem aviso fora do mandato (teste).

## Ordem sugerida

| Fase | Itens | Por quê |
|---|---|---|
| A (ativação) | 1, 2, 3 | Ninguém chega à 1ª entrega sem eles; os dogfoods pararam aqui. |
| B (uso diário) | 4, 5, 7 | Tiram a confusão do dia a dia. São de esforço P/M e destravam o ritual semanal. |
| C (retenção e confiança) | 8, 9, 10, 6 | Fazem a pessoa voltar e confiar mais. O 6 depende do steer no engine (G). |

## Regra de qualidade da fase (vale para os 10)

Nenhum controle morto (o `?` do canal estava morto; o UX-18 tinha 11 CTAs mortos). Também valem, para cada item:
- axe 0 nos dois temas;
- texto do glossário (`design/MICROCOPY.md`);
- prova por captura antes e depois.

O gate do Probe ganha uma checagem automática: **todo botão visível tem handler**.
