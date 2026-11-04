# Navegação em 6 lugares (UX-BEYOND A-1)

Muse, 04/11. O Atlas achou o problema; a Muse decidiu a forma.
- **Hoje:** 17 itens no rail em 5 grupos recolhidos, com sobreposições:
  - Projetos × Quadros;
  - Conhecimento × Segundo cérebro × Arquivos × Regras;
  - Equipe × Quem cuida de quem × Saúde.
- **A pessoa comum precisa de ≤ 7 lugares.** O T3 tem uma lista só.

## A forma

```
[Persona]                        ‹
[ Buscar em tudo…        Ctrl K ]
  Visão geral
  Conversas                    3      ← canais + DMs numa lista só
  Projetos                            ← cada projeto: Quadro · Conversa · Arquivos · Rotinas · Sprints · Mapa
  Aprovações                   2      ← "Precisa de você" fica a 1 clique, sempre
  Equipe                              ← Personas · Quem cuida de quem · Saúde
  Memória da empresa                  ← Segundo cérebro · Conhecimento · Regras
SUA EQUIPE (a faixa de rostos, igual a hoje)
────────────
  ● Claude · 82% livre                ← o estado real (A-5); o clique abre Uso e limites
  ⚙ Configurações                     ← Conexões · Uso e limites · Membros e equipe remota · Importar · Avisos · Aparência
  ? Ajuda e atalhos
```

**Regras:**
1. **6 lugares no topo, sem grupos recolhidos.** Tudo à vista, nada para descobrir.
2. **As sub-telas viram abas** (`Tabs` primitivo) dentro do lugar, no `ScreenHeader`. A aba lembra a última escolha por lugar (localStorage com try/catch).
3. **Ctrl K continua achando pelos nomes antigos.** "Quadros", "Kanban", "Canvas", "Saúde", "Cofre", "Conexões" e "Membros" são apelidos que levam à aba certa. Ninguém perde o caminho que já aprendeu.
4. **"Conversas"** é uma lista com duas seções: **Canais** e **Mensagens diretas**. A seção das DMs mostra **a equipe inteira** (A-2): quem nunca conversou aparece com "Começar conversa".
5. **Projetos:**
   - a grade de projetos com o mini-resumo (PB-5);
   - entrar num projeto abre as abas;
   - "Todos os quadros" (a visão global por raias) é um botão no topo da grade, não um item do rail.
   - O Canvas vira a aba **Mapa** do projeto.
6. **O rodapé:**
   - a pílula de estado real (A-5): "Claude · 82% livre", ou "Sem IA conectada · Conectar" em `warning`;
   - Configurações;
   - Ajuda.
   - **A 200%** (altura < 600 px), a folhagem sai e os três viram uma linha de ícones com rótulo no tooltip (P0-22).

## Fases

| Fase | O que muda | Prazo |
|---|---|---|
| **1 (P0)** | O rail com 6 lugares + o rodapé; as abas dentro de Equipe, Memória da empresa e Configurações, com as telas atuais como abas, **sem reescrever nenhuma tela**; os apelidos no Ctrl K; a lista de DMs com a equipe inteira | antes do instalador |
| **2 (P1)** | Projetos × Quadros numa tela só (a grade + o projeto com abas); Rotinas e Arquivos como abas do projeto, com o filtro "todos os projetos"; o Mapa | logo depois |

**As rotas não mudam na fase 1:** as telas ficam com os mesmos ids de painel. Muda só onde ficam no rail e o anfitrião das abas. Os links internos (`approvals?focus=…`) continuam valendo.

## O texto

| Lugar | Eyebrow da tela | Subtítulo |
|---|---|---|
| Conversas | Conversas | Canais da equipe e conversas com cada persona |
| Projetos | Trabalho | Cada projeto com o seu quadro, arquivos e rotinas |
| Aprovações | Precisa de você | O que a equipe precisa que você decida |
| Equipe | Equipe | Quem é quem, quem cuida de quem e como a equipe está |
| Memória da empresa | Memória | O que a equipe sabe e as regras que segue |
| Configurações | Configurações | Conexões, uso, membros, avisos e aparência |

**Os ícones:** os de hoje no rail (`visao-geral`, `conversa`, `projetos`, `decisoes`, `equipe`, `conhecimento-memoria`, `configuracoes`). Para "Ajuda e atalhos", o `ajuda.svg` do Brush (BR-P1, P0).

## Donos
- **Prism + Flint:** o rail, o rodapé, o anfitrião das abas, as Conversas (com as DMs da equipe inteira) e os apelidos no Ctrl K.
- **Lumen + Ember:** as abas de Equipe, Memória da empresa e Configurações com as telas deles; na fase 2, Projetos × Quadros.
- **Probe:** **antes de trocar um rótulo do rail**, atualizar o `navigate-panel.ts` e os gates, porque os testes usam o texto do rail (memória da Muse: grep no repo antes de renomear). O rótulo antigo pode continuar como `aria-keyshortcuts`/apelido de busca durante a transição.

## Aceite
1. **Rail:** 6 lugares + o rodapé, claro/escuro, 960, 1440 e 200%, sem rolagem no rail a 1440×900.
2. **Ctrl K:** "kanban", "canvas", "saúde", "cofre" e "membros" + Enter abrem a aba certa.
3. **Conversas:** com 5 personas, as 5 aparecem nas DMs.
4. **Pílula de estado:** "Sem IA" mostra o `warning` + Conectar; com IA, a cota real ou "—".
5. **Testes:** os gates do Probe verdes com os rótulos novos.
