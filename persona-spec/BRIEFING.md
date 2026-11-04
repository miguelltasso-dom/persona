# Persona — briefing da equipe (Maestri)

Dono do produto: Miguel. Maestro: **Atlas** (Claude Opus, terminal "Atlas" no Maestri).
Repositório: `C:\Users\migue\dev\persona` — fork de `deepseek-ai/deepseek-harness` em `github.com/miguelltasso-dom/persona`, branch `persona-dev`.
Spec do produto: `persona-spec/Persona-Arquitetura.md`, `persona-spec/Referencias-e-Integracao.md`, `persona-spec/README.md`.
Núcleo já existente (portar para um pacote do monorepo): `persona-spec/context.mjs`, `persona-spec/kanban-bridge.mjs` + testes.

## Decisões do Miguel (03/11/2026) — não reabrir

1. **Produto = app desktop** (Windows primeiro). Base: `apps/desktop` + `apps/desktop-host` do Harness (Electron). Agentes NÃO rodam no navegador: rodam no processo Node local (host), que executa as CLIs nativas (Claude Code, Codex, Cursor agent, OpenCode) e o loop DSH direto.
2. **Fork total do DeepSeek Harness, sem limitação**: pode repaginar, renomear, remover o que não serve e mudar a UI completamente. Marca do produto: **Persona**. Manter licença MIT e créditos ao upstream.
3. **Escopo: etapas A–G completas** (ver seção 11 da arquitetura): contexto/recall, integração da base, conversa/canais/DMs/quadro/arquivos/rotinas, execução real via CLIs + credenciais locais + uso e limites, colaboração (handoffs, skills, convites), migração/importadores + benchmarks, e canvas opcional.
4. **Direção visual**: animais ilustrados expressivos (Atlas = pastor suíço branco, Bento = border collie, Nina = onça, Sol = golden retriever, Luna = gata). Paleta lilás como base, mas com escolha de cores mais caprichada. Rostos nas DMs, corpo inteiro na faixa "Sua equipe neste canal". Sem fotografia/realismo.
5. **Imagens**: todas geradas pelo agente de arte (GPT Terra 6.1, `/image-gen`): logo, ícone do app, avatares, poses, ícones da sidebar, estados, ilustrações vazias. SVG quando aplicável. Atlas aprova as referências de estilo.
6. **Revisão de código não é exigida. Testes sim**: tudo precisa ser testado/rodado para provar que funciona (testes automatizados + app aberto e exercitado).
7. UI em **português do Brasil**.
8. **Revenue-Centric Design** (`.agents/skills/revenue-centric-design/`) é skill obrigatória no desenvolvimento de produto/UI/UX.
9. **Animações e a melhor UI/UX possível** são prioridade: seguir `persona-spec/UX-GUIDE.md` (Atlas é o guardião desse guia).
10. **Direção visual aprovada: D** (traço da B + paleta da C). Referência obrigatória: `persona-assets/references/dirD-model-sheet.png` e tokens em `persona-assets/references/README.md`.
12. **Arquitetura Super-agent adotada de forma nativa** (Atlas = Router, personas = Workers, Ticket/Thread/Eval/Mandate/Subscription do protótipo oficial `dsh-superagent-prototype`, kanban = estágios de Ticket, Vigia/watchdog, Inline & Spill + Chain of Recall, full-duplex async). Equipes à distância: **Cloudflare (Durable Objects + D1 + R2)**, local-first, credenciais nunca saem do desktop; **sem Supabase**. Detalhes: `persona-spec/SUPERAGENT-ADOPTION.md`.
13. **Equipe montada pelo usuário — nada fixo** (prevalece sobre o item 12 e a spec): personas 100% personalizáveis que atuam como pessoas de uma empresa; Atlas/Bento/Nina/Sol/Luna são só um template inicial; "Coordenação" (Router) e "Vigia" são funções atribuíveis a qualquer persona; agente pode propor/criar agente; onboarding cria o Cofre da empresa. Escopo de fechamento: `persona-spec/SCOPE.md`.
14. **Proatividade nativa é requisito da v1** — personas não podem ser preguiçosas nem depender de alguém cobrando: laço de puxada, objetivos (`dsh-goal` + `goal-round-driver`), continuação com definição de pronto, rotina de iniciativa, Vigia que detecta ociosidade/travamento e recupera, sem barulho nem custo descontrolado. Spec: `persona-spec/PROACTIVITY.md`.
15. **Quadro por projeto com fluxo e sprints próprios** (pedido do Miguel): cada projeto tem colunas próprias (modelos: Contratação, Site, Software, Marketing, Atendimento, Simples, Em branco) ligadas por categoria aos estágios do engine; sprints/fases opcionais; "Kanban" vira "Quadros" (lista de projetos), sem quadro misturado. Spec: `persona-spec/PROJECT-BOARDS.md`.
16. **Governança da equipe** (pedido do Miguel): organograma "Quem cuida de quem" (por pessoa/por setor), responsável humano + substituto por persona, Saúde da equipe com o "Teste dos 2 dias", assistente de estrutura para iniciantes ("uma persona por função contínua, não por tarefa"). Spec: `persona-spec/GOVERNANCE.md`; referência visual: `persona-spec/design/ref-quem-cuida-de-quem.jpg`.
17. **Onda 2** (ideias do Miguel): assuntos coloridos por conversa (como o Maestri Chat), "Ensinar a persona" gravando a tela (como o GrokBot) e várias contas por provedor com rotação/divisão de uso por política explícita. Spec: `persona-spec/WAVE2.md`.
18. **"Traga o que suas IAs já sabem"** (ideia do Miguel): prompt pronto para o usuário mandar às IAs que já usa + campo para colar a resposta + pasta do vault (Obsidian/.md), com revisão antes de gravar no Cofre; no onboarding e em Importar. Spec: `persona-spec/BRING-YOUR-CONTEXT.md`.
19. **Segundo cérebro** (ideia do Miguel): base de conhecimento mantida pelos próprios agentes em Empresa › Segundo cérebro — páginas markdown tipadas (Pessoa, Cliente, Projeto, Processo, Regra, Decisão, Permissão concedida, Ferramenta, Glossário, Aprendizado), curadoria automática, permissões lembradas com escopo/validade/revogação, busca com ACL. Spec: `persona-spec/SECOND-BRAIN.md`.
20. **Função "Gestor de equipe"** (pedido do Miguel; NÃO usar o nome "Maestro"): função atribuível a quantas personas o usuário quiser, que contrata (nomeia) e aloca personas em projetos/canais/setores, reorganiza trabalho e monta equipes a partir de um pedido, com limites/aprovação definidos pelo usuário e auditoria. Spec: `persona-spec/MAESTRO.md`.
11. **Post-its do Maestri = memória compartilhada**: notas `Persona · Memória`, `Persona · UX & Animação` e `Persona · Status`. Leia ao começar cada tarefa (`maestri note read "..."`) e registre aprendizados/armadilhas/descobertas duráveis com `maestri note edit`/`write` (curto, factual, datado). Detalhe longo fica nos arquivos de `persona-spec/`.

## Escalonamento

- Decisões do dia a dia (biblioteca, estrutura, nomes, ordem de tarefas, UX de detalhe): **Keel (Tech Lead, Sonnet)** decide e registra em `persona-spec/DECISIONS.md`.
- Só vai para **Atlas** (`maestri ask "Atlas" "..."`): mudar uma decisão do Miguel acima; cortar/adiar uma etapa A–G; trocar a base (abandonar o Harness/Electron); qualquer coisa que gaste dinheiro, publique algo externo (push público de release, deploy, contas) ou mexa com credenciais reais do Miguel; bloqueio que a equipe não consegue resolver.

## Regras de convivência no mesmo checkout

- Cada builder tem diretórios donos (definidos no `PLAN.md` pelo Keel). Não editar fora sem combinar com o Keel.
- Não rodar `git reset --hard`, `git clean`, nem apagar trabalho alheio. Commits: o Keel faz commits por marco na branch `persona-dev` (trailer honesto com o modelo de quem commita, ex.: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` para o Keel). Push para o fork `origin` é permitido.
- `pnpm` 11 via corepack; Node 24. Rodar `pnpm install` só quando mudar dependências.
