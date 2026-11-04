# Persona

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="persona-assets/brand/launch/readme-hero-pt-dark.png">
  <img alt="Persona: sua equipe de IA, com nome, rosto e limites. Atlas, Bento, Nina, Sol e Luna sentados juntos numa colina." src="persona-assets/brand/launch/readme-hero-pt-light.png" width="100%">
</picture>

Equipe de agentes-animais no seu computador. Cada persona tem nome, função e limites. A Coordenação decide o que vira Tarefa. As executoras fazem o trabalho autorizado. A Vigia acorda quem parou.

Isto não é um produto de nuvem: o anfitrião é o app desktop. Conversas diretas, chaves e o Cofre ficam na máquina até você mandar o contrário.

Abra o app. Crie o espaço. Escolha a equipe. Ligue uma conexão. Escreva no Geral.

Guia em português: [docs/persona/README.md](docs/persona/README.md).

Para revisar o trabalho: Aceitar, Pedir ajustes ou Descartar. Sem conexão, o cartão diz Não conectado — faça login na CLI no terminal. A bandeja mantém a equipe ligada. **Precisa de você** é uma pergunta só. Backup restaura o Cofre só na mesma conta do Windows.

## Índice

- [Conceitos](#conceitos)
- [Requisitos](#requisitos)
- [Como rodar em desenvolvimento](#como-rodar-em-desenvolvimento)
- [Testes](#testes)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Documentação](#documentação)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Contribuindo](#contribuindo)
- [Créditos e licença](#créditos-e-licença)

## Conceitos

- **Espaço**: onde a equipe trabalha. Tem canais, Tarefas e o Cofre.
- **Persona**: um agente com nome, função e limites próprios.
- **Coordenação**: decide o que vira Tarefa e responde no canal.
- **Executoras**: fazem o trabalho autorizado dentro de uma Tarefa.
- **Vigia**: acompanha as personas e acorda quem parou.
- **Cofre**: credenciais e conhecimento guardados na máquina, protegidos pelo DPAPI do Windows.
- **Precisa de você**: a fila de perguntas que só você pode responder.

## Requisitos

- Node.js ≥ 24.9
- pnpm
- Windows 10/11 (o Cofre usa DPAPI; outras plataformas não estão cobertas por este README)

## Como rodar em desenvolvimento

```sh
pnpm install
pnpm run build:artifacts
pnpm run start:desktop
```

- `pnpm run build:artifacts` gera os artefatos que o app desktop usa.
- `pnpm run start:desktop` abre o app.
- Para verificar tipos antes de abrir um PR: `pnpm run typecheck`.

## Testes

Testes dos pacotes da Persona:

```sh
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
```

O pacote `persona-e2e` contém o harness de ponta a ponta.

## Estrutura do repositório

Os pacotes da Persona ficam em `packages/persona/` (nomes `@deepseek-ai/dsh-persona-*`):

| Pacote | Papel |
|---|---|
| `persona-core` | Domínio puro: ids, política de acesso, compilação de contexto e recall |
| `persona-engine` | Motor dos agentes: Trigger → Thread → Avaliação → Decisão → Tarefa → Atribuição |
| `persona-store` | Persistência em SQLite e migrações |
| `persona-host` | Serviço do anfitrião e controle remoto |
| `persona-runners` | Contrato de execução e adaptadores (DSH direto, CLI do OAR) |
| `persona-vault` | Cofre com proteção DPAPI |
| `persona-usage` | Registro de uso e quotas |
| `persona-sync` | Sincronização |
| `client-ui-persona` | Interface do navegador (shell, equipe, canais, Cofre, Tarefas) |
| `persona-app` | Pacote do produto |
| `persona-e2e` | Testes de ponta a ponta |

Outros diretórios relevantes:

- `apps/desktop`: app Electron.
- `apps/persona-edge`: borda para equipes remotas (Cloudflare Worker, Durable Object, D1 e R2: sincronização, convites e webhooks).
- `persona-spec/`: decisões de produto, arquitetura e plano (`ARCHITECTURE.md`, `DECISIONS.md`, `PLAN.md`).
- `docs/persona/`: guia do usuário em português.

## Documentação

- Guia do usuário: [docs/persona/README.md](docs/persona/README.md)
- Arquitetura: [persona-spec/ARCHITECTURE.md](persona-spec/ARCHITECTURE.md)
- Decisões: [persona-spec/DECISIONS.md](persona-spec/DECISIONS.md)
- Regras para quem constrói o projeto: [persona-spec/BUILDER-RULES.md](persona-spec/BUILDER-RULES.md)

## Privacidade e segurança

- Não há servidor de conversas na nuvem: o anfitrião é o app desktop.
- Chaves e o Cofre ficam na máquina.
- Backup restaura o Cofre apenas na mesma conta do Windows.
- Não cole segredos em canais, Tarefas ou mensagens diretas.

Detalhes em [docs/persona/privacidade.md](docs/persona/privacidade.md).

## Contribuindo

Leia antes [AGENTS.md](AGENTS.md) e [CONTRIBUTING.md](CONTRIBUTING.md). Os pacotes da Persona seguem as regras em `persona-spec/BUILDER-RULES.md`.

## Créditos e licença

Baseado no DeepSeek Harness (MIT) · OAR (Apache-2.0) · protótipo dsh-superagent (MIT).

O nome do produto é **Persona**. Dependências de terceiros: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Licença do projeto: [LICENSE](LICENSE).
