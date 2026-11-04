# Persona — fase de otimização de tokens (Atlas/CTO, 04/11/2026)

Pedido do Miguel: quando tudo estiver amarrado, otimizar e testar para a Persona **não ser um harness gastão** — gasto normal, sem desperdício. Começa com medição já (barato), e as otimizações pesadas entram depois da integração.

## 1. Medir primeiro (começa agora)
- Ledger por turno: persona, motor/conta, tipo (triagem, resposta, execução, iniciativa, Bibliotecário, Vigia, avaliação), tokens de entrada/saída, **cache read/write**, tamanho do contexto por camada (sistema, ferramentas, obrigatórios, assunto, recall, mensagem), número de chamadas por tarefa concluída.
- Cenários de referência reprodutíveis (runner scriptado com contagem fiel + 1 rodada real mínima): pedido simples no #geral; tarefa multi-etapa com revisão; dia ocioso com rotinas; 30 personas com iniciativa; dogfooding "Padaria Lua". Relatório "tokens por cenário" vira gate de regressão (falha se piorar > 10%).

## 2. Alavancas (já existentes a calibrar + novas)
1. **Não chamar modelo quando não precisa**: pré-roteador sem LLM, pass-through, gate determinístico, Vigia com regras antes de modelo, descanso real sem IA (já existem — medir e ampliar cobertura).
2. **Prefixo estável + cache do provedor**: ordem fixa (sistema → persona → ferramentas → obrigatórios → contexto variável); nada volátil no prefixo (horário, contadores); medir hit rate por motor.
3. **Contexto mínimo suficiente**: só o assunto ativo, Inline & Spill com orçamento por camada, resumos incrementais do assunto em vez de histórico bruto, Chain of Recall sob demanda, deduplicar o que já está no prefixo.
4. **Ferramentas mínimas por turno**: só as que o mandato permite e a tarefa pede; descrições curtas.
5. **Modelo certo para cada trabalho**: triagem/Bibliotecário/Vigia/iniciativa no motor rápido e barato; execução pesada só no motor da persona; sessões aquecidas reutilizadas (sem reenviar contexto inteiro).
6. **Saídas enxutas**: limite por canal (chat ≤ 100 palavras), sem eco, sem narração de passos para o canal, relatórios estruturados curtos.
7. **Proatividade com orçamento**: iniciativa em lote diário por persona, cadência ajustada pela taxa de aceitação, orçamento de atenção = orçamento de tokens.
8. **Batching** de eventos do Router sob rajada.
9. **Memória que encolhe**: envelhecimento/compactação sem LLM; o Bibliotecário roda em lote e só sobre o que mudou.

## 3. Meta e aceite (revisada com o Miguel em 04/11)
- **Referência é o uso direto das CLIs**, não um percentual fixo: para as mesmas tarefas, a Persona deve gastar **em torno do que o usuário gastaria fazendo direto no Claude Code / Codex** (paridade ±10%), ou um pouco mais **só quando entrega qualidade claramente melhor** — e, sempre que der, menos com a mesma qualidade.
- **Benchmark pareado**: suíte de tarefas equivalentes (pedido simples, tarefa multi-etapa com revisão, pesquisa + resumo, correção de código num repo de exemplo) executadas (a) direto na CLI e (b) pela Persona com a mesma CLI/modelo; mede tokens (entrada, saída, cache), chamadas, tempo e **qualidade** (critério de pronto/avaliação). Resultado = tokens por tarefa bem-sucedida e nota de qualidade, lado a lado. Execuções reais limitadas e com dispose/timeout.
- Overhead da camada Persona (triagem, Bibliotecário, Vigia, iniciativa) medido separado e mantido pequeno; zero chamadas com equipe ociosa sem objetivo.
- Painel em Uso e limites: tokens por tarefa concluída, por persona, por tipo, cache hit, comparação com a referência — rótulo medido/estimado.
- Gate de regressão no CI local (cenários scriptados): falha se tokens por tarefa subirem > 10% sem ganho de qualidade registrado.
