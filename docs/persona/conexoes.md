# Conexões

Cada persona trabalha por um **motor**: uma ferramenta de IA deste computador ou uma chave. Sem conexão, o cartão mostra **Não conectado**.

## CLI (recomendado)

1. Instale a CLI no computador (Claude Code, Codex, Cursor agent ou OpenCode).
2. Abra um terminal e faça login nela (`claude login`, `codex login`, e assim por diante). A Persona nunca pede o token.
3. Abra **Conexões** na barra lateral. O status vira instalada e logada.
4. Escolha o modelo barato para o dia a dia. Troque só quando precisar.

Se a CLI não aparece, veja [Solução de problemas](./solucao-de-problemas.md).

## Chave de API

Cole a chave no Cofre da conexão. Ela fica neste computador. Não entra em manifesto, prompt, exportação nem proposta de contratação.

A Persona não cria conta nesses serviços por você.

## Várias contas no mesmo provedor

Você pode ligar mais de uma conta (Pessoal e Trabalho). Cada uma tem pasta de login própria — um login nunca copia o outro.

Para adicionar: em **Conexões**, no cartão do provedor, escolha **Adicionar outra conta**. O passo a passo tem três etapas:

1. **Nome.** Escolha um nome para reconhecer a conta (Pessoal, Trabalho…). Dois nomes iguais no mesmo provedor não são aceitos.
2. **Entrar.** A Persona mostra o comando de login **dessa conta** (ele guarda o login numa pasta só dela). Cole no terminal, entre com a conta e volte para confirmar em **Já fiz login**. Nunca use o login padrão do provedor para a conta nova: ele entraria na sua conta principal.
3. **Pronta.** Quando a Persona vê o login, a conta aparece como pronta. Se você fechar antes, a conta fica na lista como **Precisa entrar** e você termina quando quiser.

Pelo menu ⋯ de cada conta dá para **Renomear** e **Remover conta**.

A política é explícita, para toda a equipe ou para **uma persona** (a regra da persona vale antes da regra da equipe). Escolher a aba não muda nada: a regra só é salva quando você escolhe um dos cartões.

- **Uma conta fixa** — para no limite
- **Próxima ao chegar no limite**
- **Dividir o uso** — equilibra pela cota que resta
- **Perguntar antes de trocar** — vira Precisa de você

A troca aparece na atividade («Nina passou para Claude · Trabalho»). Cada provedor tem os próprios termos; a Persona só usa contas que você conectou e não compartilha credenciais.
