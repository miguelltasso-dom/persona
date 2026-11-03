# Persona — escopo de produto para fechar (Atlas, 03/11/2026)

Decisão do Miguel, prevalece sobre qualquer trecho que sugira equipe fixa: **o usuário monta a própria equipe**. Personas são totalmente personalizáveis e atuam como pessoas de uma empresa, cada uma com seu trabalho. Nada de papéis engessados. Referência de UX: Tucano (`github.com/eduwxyz/tucano`) — construtor de agentes conversacional, onboarding com contexto do usuário, canais com @menções e roteador. Base: fork do DeepSeek Harness + arquitetura Super-agent (`SUPERAGENT-ADOPTION.md`). Objetivo: **fechar rápido** reaproveitando ao máximo o que o Harness já tem.

## 1. Personas 100% personalizáveis

Cada persona tem: nome; animal/avatar (galeria ilustrada do Brush, upload próprio ou silhueta neutra); cargo e descrição do trabalho em texto livre ("Analista de marketing", "Dev backend", "Atendimento"); personalidade/tom; instruções; harness + modelo (DSH direto ou CLI: Claude Code, Codex, Cursor, OpenCode); ferramentas e permissões por ferramenta (nenhum · leitura · leitura+escrita); skills próprias; memória própria; limites (tokens/mês, por resposta, concorrência); horário de trabalho (opcional, usado por rotinas); "reporta a" (opcional — organograma leve para escalonamento e handoff); projetos/canais em que participa.

- **Atlas, Bento, Nina, Sol e Luna são só um modelo de equipe inicial sugerido** (template), que o usuário pode aceitar, renomear, editar, apagar ou ignorar. Outros templates: "Startup de software", "Agência", "Escritório", "Em branco".
- **Funções do sistema não são personas fixas**: "Coordenação" (o Router do Super-agent: triagem, despacho, resposta nos canais) e "Vigia" (watchdog) são **funções atribuídas** a uma persona escolhida pelo usuário, trocáveis a qualquer momento. Padrão no template: a primeira persona criada coordena. Sem coordenador definido, o canal funciona só por @menção direta.
- Todas as demais personas são executoras (Workers) quando recebem uma Tarefa — qualquer uma pode executar qualquer coisa que suas ferramentas permitam.

## 2. Agente cria agente

- Ferramenta `persona_propose(spec)` disponível a personas com a permissão "Recrutar": a persona descreve o colega que falta (nome, cargo, instruções, modelo sugerido, ferramentas) e cria uma **proposta** que aparece no canal/"Precisa de você" como cartão "Contratar <nome>?" com prévia editável.
- Política por workspace: *sempre pedir aprovação* (padrão) · *aprovar automaticamente dentro de limites* (ferramentas ≤ as do criador, sem credenciais novas, orçamento ≤ X). Uma persona nunca cria outra com mais acesso do que ela mesma.
- **Construtor conversacional** (como o Tuca do Tucano): no onboarding e no botão "Nova persona", o usuário descreve em linguagem natural quem precisa e a coordenação monta o rascunho completo para revisar.

## 3. Cofre da empresa (vault) e onboarding

Onboarding em ≤ 5 passos, valor antes de esforço (RCD):
1. Seu nome e como prefere ser tratado.
2. **Sobre a empresa** — conversa guiada (ou colar/importar texto, links, arquivos): o que faz, clientes, produtos, tom de voz, regras/restrições, ferramentas usadas. Vira o **Cofre da empresa**.
3. Conectar harnesses detectados (CLIs já logadas aparecem prontas; nada de pedir senha).
4. Montar a equipe: escolher template ou descrever ao construtor; editar.
5. Cai no `#geral` com a equipe se apresentando e uma primeira tarefa sugerida.

O Cofre é conhecimento do workspace com proveniência: registros `brief`/`constraint`/`decision`/`memory` (o modelo do `compileContext` já suporta), documentos anexados indexados (FTS), versões e "quem pode ver". Restrições e decisões fixadas entram como **contexto obrigatório** em todo turno; o resto entra por relevância e por Chain of Recall. Editável em "Conhecimento"; personas podem **propor** atualizações ao Cofre (aprovação conforme política).

## 4. Fechamento — o que entra na versão 1 (ordem de entrega)

1. **App desktop Persona abre** (marco A) com home próprio, sem telemetria/Welcome do upstream.
2. **Onboarding + Cofre + construtor de equipe + templates** (personas personalizáveis, galeria de avatares).
3. **Canais, DMs, @menções, coordenação** (Router) com resposta streaming e "Contexto usado".
4. **Tarefas/kanban** = estágios de Ticket, "Precisa de você", Visão geral por atenção.
5. **Execução real**: DSH direto + CLIs via OAR, sessão + worktree por tarefa, jobs em background, retomada.
6. **Agente cria agente**, skills propostas, memória por persona (aprovar/editar/esquecer).
7. **Rotinas** (agenda + gatilhos), Vigia, Uso e limites honesto.
8. **Equipes à distância** (Cloudflare DO + D1 + R2), convites, webhooks GitHub.
9. Importadores, benchmarks, canvas opcional.

Animações e acabamento (`UX-GUIDE.md`) fazem parte do aceite de cada item, não de uma fase posterior.

## 5. Velocidade: reaproveitar do fork em vez de escrever

Usar o que já existe: `ctx.agents` (sessões, followup/steer/cancel), async start/stop, `jobs` (background), `schedule`, `skill`, `subagent`, `team`, `credentials`, `mcp` (ferramentas da Persona por MCP para as CLIs), `session-query` (busca/recall), `attachment`, `deliverables`, OAR (runtimes de CLI), cliente React com slots, renderer de Markdown/diff/arquivos, `apps/desktop` (Electron). Escrever só a camada Persona (domínio, engine Super-agent portado do protótipo MIT, UI) e as colas.
