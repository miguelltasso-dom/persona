# Persona — onda 2: assuntos, "Ensinar a persona" e várias contas por provedor (Atlas/CTO, 03/11/2026)

Ideias do Miguel, inspiradas em sistemas que ele usa e aprova (Maestri Chat, GrokBot). A qualidade visual e de UX da v1 é a régua (DESIGN-SYSTEM.md, Muse).

## 1. Assuntos coloridos em cada conversa (referência: os 7 assuntos do Maestri Chat)

Problema: um único fio de conversa polui o chat e mistura ideias (UI, funcionalidades, financeiro…).

- Cada **DM e canal** tem **assuntos**: bolinhas coloridas no topo da conversa (padrão: 7 cores fixas + nome opcional, ex.: "UI", "Funcionalidades"). Clique troca de assunto; cada um tem **histórico, contexto e resumo próprios**. O engine já tem Thread/Assunto — reaproveitar.
- Mensagem nova vai para o assunto ativo; a persona responde no mesmo assunto. Cor + nome sempre (nunca só cor — acessibilidade).
- Indicador de não lidas e de "persona trabalhando" por assunto; renomear, arquivar e mover mensagem para outro assunto; busca e recall filtráveis por assunto e por data.
- Contexto: o `compileContext` monta só o assunto ativo + obrigatórios (Cofre/decisões) + Chain of Recall para outros assuntos quando citados — menos ruído, menos tokens.
- Tarefa criada num assunto guarda o vínculo; o cartão no quadro mostra a bolinha do assunto de origem.

## 2. "Ensinar a persona" gravando a tela (referência: GrokBot "ensinar o bot")

- Botão **Ensinar** no perfil da persona, na DM e no cartão. Abre um aviso claro de consentimento (o que será gravado, onde fica, quem vê) → escolher tela/janela → **gravando** (moldura discreta, cronômetro, pausar, parar, microfone opcional para narrar).
- Gravação **local** (Electron desktopCapturer + MediaRecorder), guardada como artefato privado da persona/projeto, com política de retenção; nada sobe sem compartilhamento explícito.
- Processamento: quadros-chave amostrados por mudança de tela + transcrição da narração (local quando disponível, ex. whisper.cpp; senão o usuário pode digitar a explicação) → um motor com visão gera um **rascunho de skill** (passos numerados, onde clicar, o que verificar, critérios de pronto, ferramentas necessárias) com miniaturas dos passos.
- O usuário revisa/edita o passo a passo e decide; a skill entra como **candidata** e segue o fluxo existente (avaliação → ativação conforme política → rollback). Nunca amplia ferramentas por conta própria.
- Privacidade: aviso para evitar senhas na tela; opção de borrar regiões; DM/projeto privado não vira skill pública sem promoção explícita.

## 3. Várias contas por provedor (rotação/divisão de uso)

- Em **Conexões**, cada provedor aceita **várias contas da própria pessoa** (ex.: 2 assinaturas ChatGPT/Codex, 2 Claude, Cursor, OpenCode Go, Gemini, Grok, chaves de API DeepSeek/OpenRouter). Cada conta tem rótulo ("Pessoal", "Trabalho"), login nativo isolado (diretório de configuração próprio por conta — CLAUDE_CONFIG_DIR / CODEX_HOME / CURSOR_CONFIG_DIR / equivalente), status e cota oficial quando disponível.
- **Política por persona ou por workspace** (escolha explícita do usuário, nunca silenciosa): *Uma conta fixa* · *Usar a próxima quando esta chegar ao limite* · ~~*Dividir o uso* (alternar ou equilibrar pela cota restante)~~ **(adiada para P2 por decisão, D-078 / Keel 04/11 20:19: a v1 oferece 3 políticas — Perguntar antes de trocar [padrão], Trocar sozinha para a próxima conta, Ficar nesta conta; cada alternância exigiria linha visível + Desfazer)** · *Perguntar antes de trocar*. A troca aparece na atividade ("Nina passou para Claude · Trabalho até 18:30").
- Só troca **entre contas do mesmo motor** ou para motores que a persona aceita (lista de preferência); mudança de motor reinicia a sessão com handoff (Chain of Recall).
- Uso e limites mostra o consumo **por conta**; o cartão da persona mostra a conta em uso.
- Aviso honesto na tela de Conexões: cada provedor tem termos de uso próprios; a Persona só usa contas que a própria pessoa conectou e não compartilha credenciais.

## Prioridade
1 e 3 entram agora (alto valor, base já existe). 2 começa com spike técnico (captura + pipeline em um exemplo) e vira entrega completa na sequência.

## Aceite (Probe)
- Assuntos: 3 assuntos na mesma DM com históricos separados; persona responde no assunto certo; contexto do assunto A não aparece no B salvo citação; acessível por teclado.
- Contas: 2 contas falsas do mesmo provedor; limite na 1 → política "próxima" troca e registra; "perguntar" vira Precisa de você; "fixa" para com aviso; credenciais isoladas por conta.
- Ensinar: gravação curta sintética → quadros + transcrição → rascunho de skill candidata com passos; nada ativa sozinho; arquivo fica local.
