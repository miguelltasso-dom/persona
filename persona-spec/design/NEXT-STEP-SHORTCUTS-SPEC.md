# "Próximo passo" em cada tela + atalhos ensinados (UX-BEYOND P1-6, P1-11, P1-22)

Muse, 04/11. Só usa os primitivos de hoje (`Notice`, `Button`, `Avatar`, `Tooltip` com `shortcut`, `Modal`) e os tokens.

## 1. "Próximo passo" (P1-6; volta à v1.1 com o **Quill** em todas as telas, depois do TEAM-8, Keel/Atlas 23:21)

**O que é:** uma linha no topo do conteúdo, logo abaixo do `ScreenHeader`, que responde "o que eu faço agora aqui?". **Nunca mais de uma.** Some quando não há nada útil a sugerir.

**A forma:**
- é um `Notice tone="info"` com `icon="sparkle"`;
- o texto tem 1 frase de até 90 caracteres, no presente, com o rosto de quem sugere (`Avatar portrait 24`) quando a sugestão vem de uma persona;
- **uma** ação `Button size="s" variant="secondary"` à direita;
- um ✕ "Agora não" (ghost) que a esconde por 24 h naquela tela (localStorage com try/catch).

**A regra da escolha** (a 1ª que valer, nesta ordem):
1. Algo bloqueado esperando a pessoa naquela tela: "{n} cartões estão esperando você · Ver".
2. Um vazio: o passo que enche a tela, que já é a ação do `EmptyState`. **Aí a linha não aparece**, para o vazio não repetir a sugestão.
3. Uma sugestão real de uma persona (o host manda; não se inventa): "Nina sugere juntar os 3 cartões de preços · Ver sugestão".
4. Um hábito que falta, derivado do estado:
   - Quadros com cartões em "Em revisão" há mais de 2 dias: "2 entregas esperam revisão há dias · Revisar";
   - Rotinas sem nenhuma ativa: "Uma rotina faz isto toda semana sem você pedir · Criar rotina";
   - Uso acima de 80% numa janela: "Claude está em 84% até 18:30 · Ver como dividir a cota".

**Por tela, o 1º lote:** Quadros, Rotinas, Uso e limites, Aprovações e Segundo cérebro ("3 páginas não são atualizadas há 30 dias · Pedir revisão ao bibliotecário").
- **Em Aprovações a regra 1 NÃO vale** (Muse 06:05): a tela já é a lista do que espera. Ali a barra só sai pela regra 3 (a sugestão de persona) ou pelo hábito "Há {n} decisões paradas há mais de 3 dias · Ver as mais antigas" (ordena a lista pelas mais antigas). O hábito só aparece se houver pelo menos 1 decisão com mais de 3 dias.

**Na v1.1 (ajustes de 23:21):**
- **Nunca repete o que já está na tela:** se uma proposta (P1-9, Flint) ou o "Bom dia" já mostra a mesma sugestão, a linha não aparece.
- **A regra 3** só usa a sugestão que o host marca como "próximo passo"; as propostas de trabalho continuam sendo cartões do P1-9.
- **A 200 %**, o `Notice` quebra em 2 linhas, e a ação e o ✕ descem para baixo do texto.
- **Atrás de `persona.flag.nextStep`** até o aceite (D-077).

**Aceite:**
- a regra coberta por teste unitário (função pura `nextStepFor(screen, state)`);
- a captura de cada tela do 1º lote com a linha, claro/escuro, 1440/960/200 %, axe 0, no shell real;
- o "Agora não" respeita as 24 h.

## 2. Atalhos ensinados na hora certa (P1-11; Flint)

- **Gatilho:** a 3ª vez na mesma sessão que a pessoa chega à mesma tela **pelo mouse** e aquela tela tem atalho (o Ctrl K + o nome, o F6 para a área, o Enter/Ctrl+Enter no composer).
- **A forma:** um `Toast tone="neutral"` de 6 s, no canto de sempre: "Dica: Ctrl K → 'quadros' chega aqui mais rápido." com as teclas em `kbd` (o mesmo estilo do `Tooltip`).
- **Uma vez por atalho, para sempre** (localStorage). No máximo 1 dica por sessão. Nunca durante a digitação nem com um `Modal` aberto.
- Desligável em Configurações › Aparência: "Dicas de atalho".

## 3. Tela "Atalhos" (P1-22; Flint)

- **Abre com `?`** (fora de um campo de texto), pelo Ctrl K ("Atalhos") e por Ajuda e atalhos no rodapé.
- **`Modal` m**, título "Atalhos do teclado", em 4 grupos com o título Nunito 800 12 em caixa alta `ink-soft`: **Ir para** · **Conversa** · **Quadro** · **Geral**.
- Cada linha tem o nome da ação à esquerda e as teclas em `kbd` à direita. **A lista vem do mesmo registro que alimenta o `Tooltip shortcut`**, para a tela nunca mentir sobre um atalho que não existe.
- **Aceite:** abre por `?` e pelo Ctrl K; todo atalho listado funciona (teste que percorre o registro).

### §3.1 As linhas (Muse, 05:05; resposta ao Flint, v1.2, `persona.flag.shortcutsScreen`)
**Grupos:** Ir para · Conversa · Aprovações · Mapas · Geral.
- O grupo **Quadro** some enquanto não houver tecla própria no quadro. As setas, o Enter e o Esc do menu do cartão são o teclado padrão de menu e não se listam.
- Um grupo vazio nunca aparece. O registro decide.

| Grupo | Ação (pt) | (en) | Teclas |
|---|---|---|---|
| Ir para | Buscar e ir para uma tela | Search and go to a screen | Ctrl K |
| Ir para | Próxima área / área anterior | Next area / previous area | F6 / Shift F6 |
| Ir para | Conversa anterior / próxima | Previous / next conversation | Alt ↑ / Alt ↓ |
| Ir para | Ver os atalhos | Show shortcuts | ? |
| Conversa | Enviar | Send | Enter |
| Conversa | Nova linha | New line | Shift Enter |
| Conversa | Direcionar agora ou pôr na fila | Steer now or queue | Ctrl Enter |
| Conversa | Parar a resposta | Stop the reply | Esc |
| Conversa | Editar a última mensagem (com a caixa vazia) | Edit your last message (empty box) | ↑ |
| Conversa | Guardar o rascunho | Save the draft | Ctrl S |
| Conversa | Chamar alguém | Mention someone | @ |
| Conversa | Comandos | Commands | / |
| Conversa | Renomear o assunto | Rename the topic | F2 |
| Aprovações | Aprovar | Approve | A |
| Aprovações | Dispensar | Dismiss | D |
| Aprovações | Ver os detalhes | See details | Enter |
| Aprovações | Próximo / anterior | Next / previous | J / K |
| Mapas | Aproximar / afastar / voltar ao tamanho | Zoom in / out / reset | + / − / 0 |
| Geral | Fechar a janela ou o painel | Close the window or panel | Esc |

**Nota:** o "↑" só se lista se ele de fato EDITA a última mensagem. Se ele só a traz de volta para a caixa, o rótulo é "Trazer a última mensagem de volta" (o Flint confirma o comportamento).
