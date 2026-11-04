# Colheita de UX do t3code (Muse, 04/11/2026)

**Fonte:** cópia de leitura do t3code (MIT), em `C:/Users/migue/dev/_ext/t3code`. Li as docs de uso em `docs/user/*.md`: `keyboard-focus`, `keybindings`, `composer`, `usage`, `activity-log`, `thread-sidebar`, `permission-modes`, `question-attachments`, `portable-handoffs`, `prompt-links`, `html-renders`, `mobile-notifications` e `appearance`.

**Regra:** nada de copiar o visual deles. Colhemos **padrões de interação e qualidade** e os redesenhamos no nosso escritório acolhedor:
- papel creme;
- contorno ameixa de 1,5 px;
- sombra sticker;
- os bichos;
- uma ação âmbar por tela.

Código, só pontual e com atribuição MIT no topo do arquivo.

A ordem é a do impacto no dia a dia: teclado, composer, limites, detalhes do assunto e atividade.

| # | Padrão | Dono |
|---|---|---|
| 1 | Áreas por F6 e foco que volta ao lugar | Muse (shell) + Prism |
| 2 | Ctrl K que faz, não só acha | Muse + Prism |
| 3 | Composer com memória | Prism |
| 4 | Falar com a persona enquanto ela trabalha (fila × direcionar) | Prism + Forge/Anvil |
| 5 | Citar um trecho da resposta | Prism |
| 6 | `/` comandos e `$` skills no composer | Prism |
| 7 | **Limites agregados por provedor** (barra segmentada por conta) | **Muse (primitivo) + Lumen** |
| 8 | `/limites` acima do composer + Detalhes do assunto | Muse (primitivo) + Prism |
| 9 | **Atividade agrupada e honesta** | **Muse (primitivo) + Prism** |
| 10 | Concluir e "Lembrar depois" em assuntos e conversas | Prism |
| 11 | Pergunta paralela (`/lado`) sem poluir o fio | Prism + Forge |
| 12 | "No limite" com Retomar e a fila preservada | Prism + Lumen |
| 13 | Modo de permissão visível na conversa | Prism + Lumen |
| 14 | Avisos só quando importa | Rivet |

---

## 1. Áreas por F6 e foco que volta ao lugar

**O que é:** F6 e Shift+F6 (Ctrl+F6 no navegador) pulam entre as grandes áreas: rail, conversa, composer e painel lateral. Cada área lembra o último controle focado. Ao fechar a paleta, o foco volta ao composer.

**Por que:** quem usa o teclado nunca se perde, e é o padrão de acessibilidade de apps de verdade.

**No nosso estilo:**
- ao chegar numa área, ela ganha por 600 ms um contorno âmbar arredondado em volta (o "lugar" se acende), sem animação com reduced-motion;
- itens do rail: ↑/↓ movem sem abrir, Enter abre, →/← abrem e fecham grupo, F2 renomeia assunto, Shift+F10 abre o menu (já é nosso padrão).

**Aceite:** F6 passa por todas as áreas visíveis, pula as ocultas e restaura o foco anterior.

## 2. Ctrl K que faz, não só acha

**O que é:** a paleta de comandos encontra **e executa**. Fica no topo o que você abre com frequência ou há pouco, e a escolha para uma busca é lembrada por três semanas. Embaixo vem "Nas mensagens", que abre na mensagem exata.

**Por que:** um atalho só resolve navegação, ação e busca. Já temos o Ctrl K real e o "Ir para" (UX-06).

**No nosso estilo:**
- seções "Ir para", "Equipe", "Fazer" (Nova conversa com…, Contratar persona, Ensinar a {persona}, Novo assunto, Simular os 2 dias) e "Nas conversas";
- cada linha com ícone do Brush ou rosto do bicho;
- números de 1 a 9 escolhem enquanto a paleta está aberta.

**Aceite:** "nina" → Enter abre a DM da Nina; "contratar" → Enter abre Contratar; 3 letras já buscam nas mensagens.

## 3. Composer com memória

**O que é:**
- ↑ no composer vazio traz o último pedido enviado naquela conversa (↑↓ navegam);
- Ctrl+S guarda o rascunho e os anexos num "bolso" e, com o composer vazio, devolve;
- colagem enorme (32 KiB ou mais) vira anexo de texto em vez de entupir o campo;
- o markdown aparece estilizado enquanto se digita.

**Por que:** corta o retrabalho mais comum, que é repetir ou ajustar um pedido.

**No nosso estilo:**
- o rascunho guardado vira um chip "📎 Rascunho guardado · 14:20" acima do composer (com ícone do Brush, não emoji);
- a colagem grande vira um cartão de anexo com "Texto colado · 48 mil caracteres · Abrir".

## 4. Falar com a persona enquanto ela trabalha

**O que é:** com a persona trabalhando, a mensagem nova pode **entrar na fila** (para depois do turno) ou **direcionar agora** (corrigir o rumo do turno atual). O botão de enviar mostra qual dos dois vai acontecer, e Ctrl+Enter faz o outro. As mensagens na fila aparecem tracejadas no fim do fio, editáveis, com "Mandar agora".

**Por que:** acaba com o "esperar a persona terminar para corrigir".

**No nosso estilo:**
- o botão âmbar troca de ícone: relógio para "na fila", seta curva para "direcionar";
- a dica embaixo: "Ctrl+Enter: direcionar agora";
- a mensagem na fila é um balão com contorno ameixa **tracejado** e "Mandar agora · Editar · Tirar".

**Dependência:** steer no engine (Forge) e a fila salva no host (Anvil).

## 5. Citar um trecho da resposta

**O que é:** selecionar um trecho de uma resposta mostra "Citar no composer", que vira um chip com comentário opcional. A persona recebe as palavras citadas e o comentário separados.

**Por que:** "faça isso aqui" fica preciso, sem copiar e colar.

**No nosso estilo:** a bolha flutuante "Citar" aparece sobre a seleção; o chip fica creme, com aspas âmbar e o lápis para comentar.

## 6. `/` comandos e `$` skills no composer

**O que é:** `/` abre os comandos do app (que funcionam em qualquer linha) e `$` insere uma skill. A lista mostra só o que vale para o motor atual.

**No nosso estilo:**
- `/limites`, `/assunto nome`, `/lado pergunta`, `/ensinar`, `/contratar`, `/resumo`;
- skills com o ícone da skill e o dono;
- o menu usa o mesmo estilo do `MenuButton`.

## 7. Limites agregados por provedor (barra segmentada por conta)

**O que é:** com várias contas do mesmo provedor, Uso › Limites mostra **um número por janela** (5 h, semana) e uma barra com **um segmento por conta**, sempre na mesma ordem em todas as janelas. As contas vêm ordenadas pela **próxima recarga**, e a parte hachurada mostra o que a próxima recarga devolve. Tocar num segmento mostra a conta, o plano e a hora da recarga.

**Por que:** encaixa perfeitamente na Onda 2 (várias contas): responde de uma vez "quanto ainda dá hoje e quando volta".

**No nosso estilo:** primitivo `PooledQuotaBar` (Muse, feito):
- a barra arredondada tem contorno ameixa e um segmento por conta, na cor do selo do motor;
- o restante sai em tom cheio, o gasto em `paper-sunken` e o que volta na próxima recarga em listras diagonais finas;
- embaixo: "Volta 18% às 18:30 (Trabalho)".

**Aceite:** a ordem dos segmentos é a mesma nas duas janelas; conta sem janela aparece como lacuna, nunca como 0%.

## 8. `/limites` acima do composer e Detalhes do assunto

**O que é:**
- `/limites` mostra, **acima do composer**, os limites do motor atual sem rodar nada. Fecha ao enviar a próxima mensagem.
- O cartão de detalhes da conversa pode mostrar os limites e o **uso de contexto**, com uma marca onde o provedor compacta.

**No nosso estilo:**
- a gaveta "Contexto usado" (já existe) ganha a seção "Limites deste motor" com o `PooledQuotaBar` compacto;
- a barra de contexto ganha a marca "aqui ele resume a conversa";
- o painel temporário acima do composer é um cartão creme com ✕.

## 9. Atividade agrupada e honesta

**O que é:**
- chamadas de ferramenta seguidas viram um resumo expansível ("Rodou 2 comandos e mandou 3 mensagens");
- mostra no máximo duas categorias e "+N";
- o que muda coisas (comandos, arquivos, contratações) vem antes de leituras;
- **falhas não contam como feito**, e "esperando" não é "terminou".

**Por que:** o fio fica legível e honesto, que é a nossa regra de "nunca inventar".

**No nosso estilo:** primitivo `ActivityGroup` (Muse, feito):
- linha com o rosto do bicho e o resumo em linguagem de gente;
- chips por categoria;
- chevron que expande a lista com estado (✓, ✕ em `danger`, ⏳) e "Abrir" por item;
- falhas em vermelho e fora da contagem de feitos.

## 10. Concluir e "Lembrar depois"

**O que é:** "Concluir" tira o assunto finalizado da lista ativa sem apagá-lo. "Lembrar depois" (3 h, amanhã 9:00, segunda, ou personalizado) o some até a hora. Quem está trabalhando vai para uma seção "Trabalhando" recolhida, e volta ao topo quando termina, falha ou precisa de você.

**No nosso estilo:** no ⋯ do assunto e da DM, entram "Concluir assunto" e "Lembrar depois ▸" com as opções; o assunto lembrado mostra um reloginho com a hora.

## 11. Pergunta paralela (`/lado`)

**O que é:** uma pergunta sobre o assunto que **não entra no fio**: começa com o que o assunto sabe, e a persona continua trabalhando.

**No nosso estilo:** abre uma aba lateral "Pergunta à parte" com a mini-pose da persona "pensando"; ela fica guardada em Detalhes do assunto.

## 12. "No limite" com Retomar

**O que é:** quando o motor para por limite, o fio guarda a explicação. Com o composer vazio aparece **Retomar**, e as mensagens na fila continuam salvas.

**No nosso estilo:**
- a faixa âmbar "No limite até 18:30 · as tarefas esperam";
- o composer vazio mostra o botão secundário "Retomar agora" e o link "Trocar de conta" (Onda 2).

## 13. Modo de permissão visível

**O que é:** o modo da conversa (Supervisionado · Aceitar edições · Automático · Acesso total) aparece junto do motor quando foge do padrão, e se troca no seletor de modelo.

**No nosso estilo:**
- mapear para a nossa autonomia: "Sempre pergunta · Edita sozinha · Decide sozinha o rotineiro · Livre";
- um chip junto a "Quem responde" quando a autonomia não é a padrão;
- Ctrl+Shift+A troca.

## 14. Avisos só quando importa

**O que é:** notificar só quando termina, falha, precisa de aprovação ou faz uma pergunta. Fica silencioso com o app em primeiro plano. O progresso contínuo sai numa atividade viva, não em spam.

**No nosso estilo:** toasts do desktop (Rivet) com o rosto do bicho e o verbo ("Nina terminou *Pesquisa de preços*"). A bandeja reflete "precisa de você" (já existe), e nada de toast com a janela em foco.

---

## Ficou para depois (bom, mas não agora)

- **Links de pedido:** um link abre o rascunho e nunca executa. Bom para o marketing da Persona.
- **Respostas visuais:** a persona responde com uma página (gráfico, tabela) no nosso tema, isolada.
- **Passagem de contexto ao trocar de motor:** já previsto na Onda 2 (handoff com Chain of Recall).

## Distribuição

- **Muse (feito):**
  - `PooledQuotaBar` e `ActivityGroup`;
  - F6 entre áreas (`shell/area-navigation.ts`);
  - a seção "Fazer" do Ctrl K: Contratar persona, Simular os 2 dias, Conversar com / Ensinar a {persona}.
- **Prism:** 1 (itens do rail e composer), 3, 4, 5, 6, 8, 10, 11, 12 e 13.
- **Lumen:** 7 (Uso › Limites com o `PooledQuotaBar`) e 12 (trocar de conta).
- **Rivet:** 14.
- **Forge/Anvil:** steer e fila (4) e pergunta paralela (11).
