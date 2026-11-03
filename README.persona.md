# Persona

Equipe de agentes-animais no seu computador. Cada persona tem nome, função e limites. A Coordenação decide o que vira Tarefa; as executoras fazem o trabalho autorizado; a Vigia acorda quem parou.

Isto não é um produto de nuvem: o anfitrião é o app desktop. Conversas diretas, chaves e o Cofre ficam na máquina até você mandar o contrário.

Guia em português: [docs/persona/README.md](docs/persona/README.md).

## Como rodar em desenvolvimento

Requer Node ≥ 24.9 e pnpm.

```sh
pnpm install
pnpm run build:artifacts
pnpm run start:desktop
```

Testes dos pacotes da Persona:

```sh
pnpm exec vitest run packages/persona/persona-core packages/persona/persona-engine
```

## Créditos

baseado no DeepSeek Harness (MIT) · OAR (Apache-2.0) · protótipo dsh-superagent (MIT)

O nome do produto é **Persona**.
