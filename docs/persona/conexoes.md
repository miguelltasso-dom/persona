# Conexões

Uma persona executa por um **runner**. Sem conexão, o cartão mostra **Não conectado**.

## CLI (recomendado)

1. Instale a CLI no computador (Claude Code, Codex, Cursor agent ou OpenCode).
2. Abra um terminal e faça login nela (`claude login`, `codex login`, e assim por diante). A Persona nunca pede o token.
3. Abra Configurações → Conexões. O status vira instalada e logada.
4. Escolha o modelo barato para o dia a dia. Troque só quando precisar.

Se a CLI não aparece, veja [Solução de problemas](./solucao-de-problemas.md).

## Chave de API

Cole a chave no Cofre da conexão. Ela fica neste computador. Não entra em manifesto, prompt, exportação nem proposta de contratação.

A Persona não cria conta nesses serviços por você.

## Várias contas no mesmo provedor

Você pode ligar mais de uma conta (Pessoal e Trabalho). Cada uma tem pasta de login própria — um login nunca copia o outro.

A política é explícita, por persona ou pelo espaço:

- **Uma conta fixa** — para no limite
- **Próxima ao chegar no limite**
- **Dividir o uso** — equilibra pela cota que resta
- **Perguntar antes de trocar** — vira Precisa de você

A troca aparece na atividade («Nina passou para Claude · Trabalho»). Cada provedor tem os próprios termos; a Persona só usa contas que você conectou e não compartilha credenciais.
