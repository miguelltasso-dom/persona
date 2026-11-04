# Persona — "Rascunho da tarefa": worktree invisível para o usuário comum (Atlas/CTO, 04/11/2026)

Pedido do Miguel: a questão do worktree tem de ser **o mais simples e automática possível para o usuário comum**.

## Situação atual (achado do Atlas)
- O engine cria um worktree git + branch `persona/<ticketId>` por Tarefa e mostra o painel Revisar (Aceitar / Pedir ajustes / Descartar). Isso está correto para quem programa.
- Lacuna 1: `GitReviewDelivery.prepare` assume que a pasta do projeto JÁ é um repositório git e que existe `git` no PATH. Para uma padaria ou agência, cuja pasta é só de documentos e planilhas, a primeira Tarefa que mexe em arquivo **falha**.
- Lacuna 2: a interface ainda usa a linguagem de quem programa. O usuário comum não sabe o que é branch, merge ou worktree.

## Decisão
1. **O usuário nunca vê git.** Cada Tarefa que mexe em arquivos trabalha num **rascunho**, uma cópia isolada da pasta. O que ele vê é só isto:
   - "A Bia está trabalhando num rascunho";
   - depois, **Revisar mudanças**: arquivos novos ou alterados em linguagem simples, antes e depois de textos e imagens lado a lado;
   - as ações **Aplicar na pasta** / **Pedir ajustes** / **Descartar**.
2. **Pasta sem git (o caso comum):** a Persona guarda um **histórico privado e oculto** no seu próprio diretório de dados (`<PERSONA_HOME>/history/<projectId>`, git com `--git-dir` separado e `--work-tree` na pasta do usuário).
   - Ela **nunca** cria `.git` na pasta do usuário.
   - Ela cria o histórico sozinha no primeiro uso, sem perguntar nada.
3. **Sem git instalado:** o instalador leva um **git portátil próprio** (MinGit, como o GitHub Desktop faz) dentro do app, e o runner usa esse quando o PATH não tem git. O usuário não precisa instalar nada.
4. **Desfazer:**
   - antes de "Aplicar na pasta", a Persona grava um ponto de restauração automático;
   - o botão **Desfazer** fica disponível por 30 dias, também em Projeto › Histórico;
   - "Aplicar" nunca faz merge pela metade.
5. **Conflito** (o usuário mexeu no mesmo arquivo enquanto a persona trabalhava):
   - a tela diz em português "Você e a Bia mudaram o mesmo arquivo";
   - as opções são *Ficar com o meu* / *Ficar com o da Bia* / *Manter os dois* (cópia com sufixo);
   - não há marcadores `<<<<` no arquivo do usuário.
6. **Pasta com git (quem programa):** fica como hoje (worktree + branch reais, `ff`/`squash` pela política, sem push automático). As **Configurações avançadas** do projeto mostram os nomes técnicos.
7. **Tarefa sem arquivos** (resposta, pesquisa): não cria rascunho nenhum.
8. **Limpeza automática:** rascunhos de tarefas fechadas somem (`sweepOrphans`) e os pontos de restauração expiram em 30 dias. Uso e limites mostra o espaço ocupado.
9. **Windows real:** a pasta pode estar no OneDrive (arquivos só online → hidratar antes de copiar), ter caminhos longos ou ter arquivos abertos no Excel/Word (lock → aviso "feche a planilha X" e tentar de novo, nunca falha calada). Arquivos grandes e binários são copiados sob demanda (sparse/hardlink quando possível).

## Donos
- **Forge (engine):** ReviewDelivery com histórico oculto, ponto de restauração e Desfazer, conflito por arquivo com as 3 escolhas. Fica no porto `ReviewDelivery`, uma implementação nova ao lado da `GitReviewDelivery`, escolhida automaticamente.
- **Rivet:**
  - MinGit dentro do instalador (afterPack + inventário) e resolução do git (PATH → embutido);
  - o cwd do runner no rascunho;
  - as travas do Windows (OneDrive, arquivos abertos, caminho longo).
- **Anvil (host):** Remotes `undoApply` / `listRestorePoints`, migração dos projetos existentes, espaço ocupado em Uso.
- **Lumen:** painel Revisar em linguagem simples (antes/depois de texto e imagem, as 3 ações, Desfazer, escolha de conflito); Projeto › Histórico.
- **Muse:** microcopy e visual do rascunho, do Revisar e do conflito (sem jargão), e o estado "trabalhando num rascunho" na faixa da equipe.
- **Probe:** E2E nos 5 cenários abaixo.
  - pasta sem git com git no PATH;
  - pasta sem git e sem git no PATH (usa o embutido);
  - pasta no OneDrive;
  - planilha aberta durante o Aplicar;
  - conflito, seguido de Desfazer.

## Aceite
Usuário sem git instalado, pasta comum de documentos, em perfil limpo: pedido "atualize o cardápio.docx com os preços novos" → rascunho → Revisar mostra o antes/depois → Aplicar → arquivo atualizado na pasta → Desfazer restaura. Nenhuma palavra técnica aparece na tela, e a pasta do usuário continua sem `.git`.

## Prioridade
P1 da v1: entra logo depois do P0 (primeira entrega real + instalador fechado). A primeira entrega é só resposta e não depende disto.
