# Persona — Segundo cérebro (Atlas/CTO, 03/11/2026)

Ideia do Miguel: um vault/second brain **dentro** da Persona, mantido pelos próprios agentes, sem trabalho manual do usuário — onde eles buscam informação, guardam as permissões já dadas e tudo que é importante. Fica em **Empresa › Segundo cérebro** (não na barra principal). Precisa ser muito bem definido e organizado.

Ele **unifica** o que já existe (Cofre, memórias por persona, decisões, aprovações/auditoria, aprendizados/skills) numa estrutura legível. Princípios (alinhados à decisão do ai-memory): **páginas em markdown legíveis e editáveis são a fonte da verdade; o índice é derivado**; compilar em vez de só recuperar; nada é apagado de verdade (versões); acesso controlado por página.

## 1. Estrutura fixa (bem definida)

Cada página tem **tipo**, título, corpo em markdown, propriedades tipadas, fontes (proveniência), visibilidade, versão, links/backlinks e "última confirmação".

| Tipo | Exemplos | Propriedades principais |
|---|---|---|
| Empresa | visão, oferta, tom de voz | — |
| Pessoa | cliente, fornecedor, colega humano | papel, empresa, contato de trabalho (sem dado sensível) |
| Cliente | conta, histórico, preferências | status, valor, responsável |
| Projeto | objetivo, estado, links | quadro, sprint atual |
| Processo | "como fazemos X" (passo a passo) | dono, frequência, skill vinculada |
| Regra | sempre/nunca | obrigatória? (entra em todo turno) |
| Decisão | o quê, por quê, quando, quem | vigente/substituída |
| **Permissão concedida** | "pode responder clientes do WhatsApp com modelos aprovados" | quem concedeu, para qual persona, ação, escopo, limites, validade, revogável |
| Ferramenta/Conexão | sistemas usados e como | conta, quem tem acesso |
| Glossário | termos da empresa | — |
| Aprendizado | o que deu certo/errado | persona, tarefa de origem |

Índice automático por tipo + página "Comece aqui" gerada (resumo da empresa e links principais).

## 2. Manutenção automática (sem o usuário fazer nada)

- **Curadoria**: função de sistema "Bibliotecário" (atribuível como Coordenação/Vigia; padrão: a persona de Coordenação, modelo barato). Ao fim de tarefas, conversas e aprovações, extrai fatos duráveis e **atualiza páginas** (cria, completa, liga, marca contradições). Regras/decisões obrigatórias novas exigem aceite humano; o resto entra conforme política (auto | propor).
- **Higiene sem LLM**: deduplicação, envelhecimento (reforço por uso), contradição sinalizada, "página não confirmada há 90 dias" vira lembrete; nada some — fica no histórico.
- **De onde vem**: conversas (respeitando a audiência — conteúdo de DM vira página **privada** de quem participou), tarefas concluídas, revisões, aprovações, Cofre, importação do prompt/vault (BRING-YOUR-CONTEXT), arquivos do projeto.

## 3. Permissões lembradas (com segurança)

Quando o humano aprova algo em "Precisa de você", a Persona oferece **"Lembrar esta permissão"** com escopo explícito (persona, tipo de ação, alvo, limites, validade: uma vez | 7 dias | até revogar). Vira página *Permissão concedida*. O gate de aprovação consulta essas páginas: **só dispensa a pergunta para a mesma ação dentro do mesmo escopo e limites**; nunca amplia, nunca transfere para outra persona, expira e pode ser revogada com 1 clique (efeito imediato). Toda dispensa fica auditada ("não perguntei porque você permitiu em 03/11").

## 4. Uso pelos agentes

Ferramentas: `brain_search` (FTS + tipo + links, com ACL por página e audiência) e `brain_read(id)` com Chain of Recall pelos links; `brain_propose` para sugerir mudança. Regras obrigatórias continuam entrando em todo turno (compileContext). Respostas citam as páginas usadas ("Contexto usado").

## 5. Tela (Empresa › Segundo cérebro)

- Início: "O que mudou hoje", contradições a resolver, permissões ativas, páginas mais usadas.
- Navegação por tipo, busca, **página** com propriedades, backlinks, histórico de versões e quem editou (pessoa ou persona), editar à mão.
- Vista de **grafo** opcional (reusa o canvas) e lista acessível.
- **Permissões**: lista com escopo, validade, uso recente e "Revogar".
- Exportar/sincronizar com uma pasta de vault (Obsidian) — mão única por padrão; mão dupla opcional.

## 6. Aceite (Probe)
- Concluir uma tarefa com fato novo → página atualizada com fonte; fato contraditório → sinalizado, não sobrescrito.
- Conteúdo de DM nunca aparece em página visível ao canal; busca de persona sem acesso não retorna a página.
- Permissão lembrada: mesma ação/escopo → sem pergunta e auditado; ação maior/outro alvo/outra persona/expirada/revogada → pergunta de novo.
- Exportar para pasta → markdown legível com links; reimportar não duplica.
