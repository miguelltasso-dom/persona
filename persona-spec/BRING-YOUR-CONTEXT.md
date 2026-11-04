# Persona — "Traga o que suas IAs já sabem" (prompt pronto + pasta do vault) — Atlas/CTO, 03/11/2026

Ideia do Miguel: em vez de exigir a exportação oficial (zip por e-mail), oferecer **(a) um prompt pronto** que o usuário copia e manda para as IAs que já usa (ChatGPT, Claude, Gemini, Grok…), colando a resposta na Persona; e **(b) uma pastinha de vault** logo abaixo, onde ele arrasta/escolhe a pasta do Obsidian (ou qualquer pasta de .md). Os dois alimentam o **Cofre da empresa** e a memória das personas. A exportação oficial continua existindo como opção avançada (importadores do Forge).

## Onde aparece
- **Onboarding, passo 2 (Sobre a empresa):** bloco "Traga o que suas IAs já sabem" logo abaixo do campo de descrição.
- **Conhecimento › Importar** e **Importadores** (tela do Lumen), sempre disponível.

## (a) Prompt pronto
Botões "Copiar prompt" (um texto só, com abas opcionais "ChatGPT / Claude / Gemini / Outra" que só mudam a dica de onde colar), campo grande "Cole aqui a resposta" (aceita várias colagens, uma por IA), botão "Organizar". Texto do prompt (pt-BR; versão en no locale):

```
Quero levar o que você sabe sobre mim e meu trabalho para a minha nova equipe de assistentes (Persona).
Com base em tudo o que você lembra das nossas conversas e da sua memória sobre mim, escreva um resumo
completo e organizado, em português, com estas seções e títulos exatamente assim:

## Sobre mim
Nome, papel, como prefiro ser tratado, estilo de comunicação e preferências de trabalho.

## Empresa e projetos
O que a empresa faz, clientes, produtos/serviços, projetos em andamento e objetivos.

## Regras e restrições
Coisas que sempre devem (ou nunca devem) ser feitas, limites, políticas, tom de voz da marca.

## Decisões já tomadas
Decisões importantes com o motivo, quando eu tiver dito.

## Ferramentas e processos
Ferramentas que uso, como trabalho, rotinas recorrentes e padrões.

## Pessoas e contatos de trabalho
Pessoas relevantes e o papel de cada uma (sem dados sensíveis como documentos, senhas ou endereços).

## O que ainda está em aberto
Pendências, dúvidas e próximos passos.

Regras: use tópicos curtos; não invente nada — se não souber, escreva "não sei"; marque com (incerto)
o que você não tem certeza; não inclua senhas, tokens, números de documentos ou dados bancários.
```

## (b) Pasta do vault
Área "Arraste a pasta do seu vault (Obsidian ou .md)" + botão "Escolher pasta" (seletor nativo do Electron). Lê .md recursivamente com frontmatter, títulos, tags e [[links]]; ignora `.obsidian/`, `.trash/`, anexos binários (lista o que foi ignorado); limite de tamanho com aviso; reprocessa só o que mudou ao reimportar (por caminho + hash). Reaproveita o importador Markdown/Obsidian do Forge.

## Organização (comum a a e b)
1. Parser divide pelas seções do prompt (ou pela estrutura do vault) e gera **propostas** tipadas: `brief` (Sobre mim/Empresa), `constraint` (Regras), `decision` (Decisões), `memory` (Ferramentas/Pessoas/Em aberto), com proveniência ("colado do ChatGPT em 03/11", "vault: notas/clientes.md").
2. Tela de **revisão** antes de gravar: cada item com aceitar / editar / descartar / "só para mim (privado)", destaque para itens marcados (incerto) e para possíveis dados sensíveis detectados (CPF, cartão, token → bloqueados por padrão).
3. Deduplicação contra o Cofre existente; conflito com decisão fixada vira pergunta.
4. Nada vira regra obrigatória sem o aceite explícito; tudo fica local.

## Aceite (Probe)
- Colar uma resposta no formato do prompt → propostas nas categorias certas, com proveniência; (incerto) destacado; dado sensível bloqueado.
- Vault de exemplo com frontmatter/links/.obsidian → só .md importados, ignorados listados, reimportar sem duplicar.
- Revisão: aceitar grava no Cofre; descartar não grava; privado não aparece para outras pessoas.
