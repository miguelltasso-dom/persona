# Kit de lançamento da Persona

Muse, 04/11. A arte é do Brush; a composição e o texto são da Muse. O tom segue `MICROCOPY.md`.

## Peças

| Peça | Arquivo | Uso |
|---|---|---|
| Hero do README (pt e en, claro e escuro), 2400 × 900 | `persona-assets/brand/launch/readme-hero-{pt,en}-{light,dark}.png` | Topo do README, com `<picture>` para o tema (abaixo) |
| Capa do repositório (social preview), 1280 × 640 | `persona-assets/brand/launch/repo-cover.png` | GitHub › Settings › Social preview |
| Fundo do hero, sem texto | `persona-assets/brand/launch/hero-wide-{light,dark}.png` | Base para outras línguas e banners |
| Foto da equipe com placa em branco | `persona-assets/brand/launch/about-team.png` → `ILLUSTRATIONS['about-team']` | Tela "Sobre a Persona" (`AboutPersona`) |
| Selo das notas de versão | `persona-assets/brand/launch/release-notes-badge.png` → `ILLUSTRATIONS['release-notes-badge']` | Topo das notas de versão e do "O que mudou" no app |

`brand/launch/` **não** entra no pacote do app: o `build-assets` pula a pasta, como faz com `concepts`. Só os dois `.webp` que a UI usa entram, com 118 KB no total. Sem essa regra, o pacote passava do teto de 10 MiB, com 20,9 MiB.

### README: hero que respeita o tema

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="persona-assets/brand/launch/readme-hero-pt-dark.png">
  <img alt="Persona: sua equipe de IA, com nome, rosto e limites. Atlas, Bento, Nina, Sol e Luna sentados juntos numa colina." src="persona-assets/brand/launch/readme-hero-pt-light.png" width="100%">
</picture>
```

No `README.md` em inglês, troque `pt` por `en` e use o `alt` em inglês: "Persona: your AI team, with names, faces and limits. Atlas, Bento, Nina, Sol and Luna sitting together on a hill."

## Descrição curta

**Uma linha (GitHub "About", ≤ 120 caracteres)**
- pt: Sua equipe de IA no seu computador: personas com nome, rosto e limites. Você pede, a equipe entrega.
- en: Your AI team on your computer: personas with names, faces and limits. You ask, the team delivers.

**Parágrafo (página do projeto, loja, post)**
- pt: A Persona monta uma equipe de agentes de IA que trabalham no seu computador. Cada persona tem nome, rosto, função e limites. A Coordenação distribui as tarefas, você aprova o que importa, e tudo (conversas, Cofre e chaves) fica na sua máquina. Funciona com as IAs que você já usa, como Claude, Codex e DeepSeek.
- en: Persona builds a team of AI agents that work on your computer. Each persona has a name, a face, a role and limits. The Coordinator hands out tasks, you approve what matters, and everything (conversations, the Vault and your keys) stays on your machine. It works with the AIs you already use, like Claude, Codex and DeepSeek.

**Tópicos do repositório:** `ai-agents`, `desktop-app`, `local-first`, `electron`, `multi-agent`, `claude`, `codex`.

## Modelo de notas de versão

Use este esqueleto: pt primeiro, en logo abaixo, no mesmo arquivo. Escreva para quem **usa** o app, no tom de `MICROCOPY.md`, sem nome de pacote, PR ou ticket no corpo. Esses ficam no rodapé "Para quem contribui".

```markdown
<img src="persona-assets/brand/launch/release-notes-badge.png" width="96" align="right" alt="">

# Persona {versão} · {data por extenso}

{Uma frase que diz a maior mudança, do ponto de vista de quem usa.}

## Novidades
- **{Nome da novidade}.** {O que você pode fazer agora, em uma frase.} {Onde achar: "Em Quadros › …".}

## Melhorias
- {O que ficou mais fácil ou mais rápido.}

## Correções
- {O que estava errado e agora funciona. Sem culpa, sem jargão.}

## Antes de atualizar
- {Só se houver algo a fazer: "Feche o app antes de instalar." Se não houver, apague esta seção.}

<details><summary>Para quem contribui</summary>

- Pacotes e PRs: …
- Mudanças de contrato: …
</details>

---

# Persona {version} · {date}
(mesma estrutura, em inglês)
```

**Exemplo de linha boa:** "**A persona agora carrega o cartão.** Quando a Nina move uma tarefa no quadro, você vê o rostinho dela levando o cartão até a coluna nova."
**Exemplo de linha ruim:** "feat(kanban): useKanbanCarry hook + FLIP 360 ms".

## Tela "Sobre a Persona"

Primitivo `AboutPersona` (`primitives/About.tsx`), com `ABOUT_LABELS_PT` e `ABOUT_LABELS_EN`, e os créditos em `PERSONA_CREDITS`. Cada licença foi conferida no próprio arquivo:
- **DeepSeek Harness**, MIT, © 2026 DeepSeek (`LICENSE`);
- **OAR** (`@botiverse/oar`), Apache-2.0 (`THIRD_PARTY_NOTICES.md`);
- **t3code**, MIT, © 2026 T3 Tools Inc. (`_ext/t3code/LICENSE`; os padrões portados citam a origem no código).

Os links abrem pelo host (`onOpenUrl`) e nunca navegam a janela do app. "Ver avisos de terceiros" chama `onOpenNotices`, que abre o `THIRD_PARTY_NOTICES.md`.

O Prism liga a tela em Configurações › Sobre e passa a versão do app. Capturas: `.maestri/tmp/shots/design/launch/about-{pt-light,pt-dark,en-light}.png` (axe 0).
