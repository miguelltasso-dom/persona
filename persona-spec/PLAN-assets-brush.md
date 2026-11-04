# Assets do Brush (rascunho — será incorporado ao PLAN.md §8)

Gerador: GPT Terra 6.1 (`/image-gen`). Estilo: animais ilustrados expressivos, traço suave, sem fotografia/realismo. Paleta lilás como base.

## 0. Regra de trabalho

1. **Folha de estilo primeiro** (`B0`), aprovada por Atlas, antes de qualquer lote.
2. Masters ficam em `persona-assets/masters/` (PNG 2048 px ou SVG; não vão ao git, D-010) e as referências aprovadas em `persona-assets/references/`. Derivados (tamanhos menores, WebP, `.ico`) são gerados por script (`persona/ui/scripts/build-assets.mjs`, dono Prism) para `persona/ui/assets/` — o Brush entrega só masters + `MANIFEST.json`.
3. Nomes em minúsculas, ASCII, kebab-case. Formato: `<categoria>/<item>[-<variante>].<ext>`.
4. Fundo transparente em tudo, exceto onde indicado. Personagens ancorados na mesma linha de chão (pés em 92% da altura do quadro) e mesma escala dentro do lote.
5. Estados nunca dependem só de cor: cada pose tem gesto e adereço distintos (ver tabela de poses).
6. Sem marcas de terceiros (Claude, OpenAI, Cursor, OpenCode, DeepSeek): os "selos de runtime" são glifos genéricos nossos.

## 1. Marca

| ID | Asset | Formato / tamanho | Observação |
|---|---|---|---|
| B1 | Símbolo da marca (marca isolada) | SVG; PNG 1024² transparente | Forma simples reconhecível a 16 px: silhueta de orelhas/focinho formando um "P", ou duas orelhas sobre balão de conversa |
| B2 | Logotipo horizontal "Persona" (símbolo + palavra) | SVG; claro e escuro; PNG 2048×512 | Fonte da palavra: definida na folha de estilo |
| B3 | Logotipo empilhado | SVG; PNG 1024² | Para tela de boas-vindas |
| B4 | Versão monocromática (1 cor, usável em `currentColor`) | SVG | Barra de título, tray, documentação |
| B5 | Ícone do aplicativo | PNG 1024² master (quadrado arredondado lilás + símbolo); SVG da mesma arte | Derivados `.ico` 16/24/32/48/64/128/256 (Windows), `.icns` depois |
| B6 | Ícone da bandeja (tray) | SVG monocromático 16/24/32 px legível em tema claro e escuro; variante com ponto de notificação | Windows primeiro |
| B7 | Faixa lateral do instalador NSIS | PNG 164×314 (vira BMP); cabeçalho 150×57 | Arte lilás com Atlas e equipe |
| B8 | Imagem de compartilhamento / README | PNG 1280×640 | Equipe completa em fila, logotipo |
| B9 | Favicon | SVG 32 px | Derivado de B1 |

## 2. Personagens (P0 — necessários no marco C)

Cinco personagens principais. Cada um tem **uma folha de referência** (frente, 3/4, perfil, costas, expressões: neutra/feliz/pensando/surpresa/triste) antes dos lotes; a folha é a referência de entrada das demais gerações para manter consistência.

| Animal / persona | Descrição fixa |
|---|---|
| Atlas | Pastor suíço branco, orelhas eretas, postura de líder |
| Bento | Border collie preto e branco, olhar atento |
| Nina | Onça pintada, ágil |
| Sol | Golden retriever, caloroso |
| Luna | Gata (pelagem a definir na folha de estilo), serena |

Por personagem:

| Asset | Formato / tamanho | Uso |
|---|---|---|
| Referência (turnaround + expressões) | PNG 2048×2048 | Só consulta e entrada de geração |
| Rosto / avatar | PNG 1024² transparente, enquadramento rosto+ombros, círculo-seguro | DMs, listas, cabeçalho de mensagem (derivados 256/96/48 px) |
| Avatar piscando (olhos fechados) | PNG 1024² | Animação opcional de piscar (P1) |
| 8 poses de corpo inteiro | PNG 1536×1536 transparente, pés a 92% da altura | Faixa "Sua equipe neste canal", perfil, quadro |

Poses de corpo inteiro (um por estado do produto):

| Estado (texto no app) | Pose |
|---|---|
| Disponível | Em pé, acenando/sorrindo, cauda ativa |
| Trabalhando | Digitando em notebook / escrevendo, concentrado |
| Revisando | Lupa, prancheta com check |
| Aguardando resposta | Mão no queixo, balão com reticências |
| Aguardando aprovação | Segurando placa/cartão "pausa", olhar para o usuário |
| Descansando | Deitado/enroscado dormindo, "zzz" (só quando não há trabalho nem bloqueio) |
| Offline | Sentado de costas ou luz apagada, esmaecido |
| Erro | Preocupado, ferramenta quebrada/fio solto (sem tom assustador) |

Total P0: 5 × (1 referência + 1 avatar + 8 poses) = 50 imagens, mais 5 avatares piscando (P1).

## 3. Mais animais (P1 — marco E, personas criadas pelo usuário)

Oito animais extras, cada um com avatar + 3 poses (disponível, trabalhando, descansando): raposa, coruja, lontra, panda, lobo-guará, capivara, tucano, tamanduá. Total 8 × 4 = 32.
Também: "animal em branco" (silhueta neutra) para persona sem animal escolhido.

## 4. Ícones (SVG, grade 24 px, traço 1.75 px, cantos arredondados, `currentColor`)

**Navegação (sidebar e cabeçalhos)** — N1…N18: visão geral, projetos, kanban, rotinas, canais (#), mensagens diretas, uso e limites, busca, configurações, arquivos, conversa, quadro, canvas, skills, conhecimento/memória, decisões, convidar, equipe.
**Ações** — A1…A18: novo, enviar, parar, tentar de novo, anexar, ramificar/handoff, aprovar, recusar, play, pausa, relógio (agendar), pasta, documento, link, filtro, ordenar, mais (…), fixar.
**Estados do agente (16/20/24 px, forma + cor)** — disponível, trabalhando, revisando, aguardando resposta, aguardando aprovação, descansando, offline, erro.
**Colunas do quadro** — a fazer, em andamento, em revisão, bloqueado, concluído.
**Privacidade** — canal (público da equipe), DM (privado), compartilhado, bloqueado por política.
**Selos de runtime (glifos genéricos)** — DSH direto, CLI delegada (terminal), "assinatura" (cartão), "chave de API", "local".

Total: ~75 SVGs. Micro-glifos de UI (chevron, fechar, check) reaproveitam os de `ui-primitives` do cliente (D-005); a lista acima é o que precisa ter a identidade da Persona.

## 5. Ilustrações de estado vazio e onboarding (SVG ou PNG 960×720 transparente; versões pequenas 320×240)

1. Primeiro uso: Atlas recebe você (boas-vindas)
2. Conhecer a equipe
3. Conectar uma CLI / conta
4. Criar o primeiro projeto
5. Nenhum projeto
6. Nenhum canal
7. Nenhuma mensagem direta
8. Quadro vazio (+ 5 miniaturas de coluna vazia 320×240)
9. Sem arquivos
10. Sem rotinas
11. Busca sem resultados
12. Uso e limites: dado indisponível (não parece "0%")
13. CLI não encontrada / não autenticada
14. Sem conexão com o host
15. Equipe descansando (todos em pausa)
16. Entrega concluída / sucesso
17. Erro genérico
18. Canvas vazio (marco G)
19. Carregando / pensando (loop sugerido: 2 quadros PNG)

## 6. Fundos e texturas (P1)

- Fundo de boas-vindas 1920×1080 (gradiente lilás com formas orgânicas), versão escura.
- Textura sutil repetível 256² (patinhas/folhas) para estados vazios.
- Ilustração de cabeçalho de projeto (banner 1200×240) × 3 variações.

## 7. Entrega e aceite

- Cada lote vem com `MANIFEST.json` (`id`, caminho, tamanho, formato, prompt/semente resumida).
- Aceite do Brush: Atlas aprova a folha de estilo (B0) e cada personagem (referência) antes das poses; Prism confirma que os assets carregam no app (teste de renderização: nenhum 404 e contraste mínimo dos ícones sobre `--surface` claro/escuro).

## 8. Orçamento de peso (Muse, 04/11; aprovado pelo Keel, opção b)

**Teto:** a árvore `client-ui-persona/src/client/assets/` fica em **≤ 10 MiB** (`MAX_GIT_BYTES` em `scripts/persona/build-assets.mjs`; o build falha acima disso).

| Medida | Valor |
|---|---|
| Antes do BR-P1 | 9,05 MiB |
| Hoje (com o kit de vida do tamanduá e a `empty-sem-ia`) | **7,58 MiB** |

**O que mudou no pipeline** (`build-assets.mjs`):
1. **Poses de vida** (`disponivel-blink`, `disponivel-tail`, `acenando`, `pensando-1/2/3`): altura máxima **376 px** (2× exato dos 188 px da faixa da equipe) e webp q76. As outras poses ficam em 480 px, q82. A q76 é indistinguível a 3× de zoom (`.maestri/tmp/shots/design/br-p1/q-compare-blink.png`).
2. **PNGs de marca fora da árvore do app** (−1,1 MiB): `share-team`, `app-icon`, os logos raster, `installer-header` e o `tray/*.png`. O app só importa os SVGs de `brand/`. O site, o README e o instalador leem direto de `persona-assets/` ou de `apps/desktop/resources/`.

**Tamanho-alvo para o Brush:**

| Arte | Mestre (PNG RGBA 8 bits) | Sai no app (webp) |
|---|---|---|
| Frame de vida, 1536² | ≤ 1,5 MB | ~20 KB (6 frames ≈ 118 KB por animal) |
| Pose comum, 1536² | ≤ 1,5 MB | ~25–35 KB |
| Avatar e `-blink`, 1024² | ≤ 0,8 MB | ~12–15 KB por tamanho |
| Ilustração de vazio, 480² | ≤ 0,3 MB | ~25–40 KB |
| Spot, 192² | ≤ 60 KB | ~6 KB |

O mestre nunca vem em PNG de paleta (modo `P`).

**Projeção:**
- P1 (11 animais × 118 KB ≈ 1,24 MiB) + P2 (~0,2 MiB) → **~9,0 MiB**, cabe.
- **P3** (4 animais novos com o kit completo, ~0,45 MiB cada ≈ 1,8 MiB) → ~10,8 MiB, não cabe. Pelo Keel, os animais novos entram **sob demanda** (lazy, fora do bundle inicial). O teto de 12 MiB é aprovado só com o número real do lote medido.

### Novo teto: 12 MiB (Keel, 04/11 17:18)
- **Medido antes de subir:** a árvore estava em **9,00 MiB**, depois do BR-P3 P0 + cervo, coelho, lobo-guará e lontra. Faltam o ouriço e o P1 do BR-P3 (as poses comemorando, digitando, lendo e confuso dos 5 principais, os sucessos, os spots da Ajuda e os ícones).
- **Teto:** **12 MiB** (`MAX_GIT_BYTES` no `build-assets.mjs`, no mesmo commit).
- **Carregamento:** toda arte é importada como URL (`generated-imports.ts`) e servida como arquivo separado em `lib/assets/`.
  - `lib/client.js` tem **0 data-URI de imagem**, medido em 04/11 16:47: 4.786.140 bytes, 775 referências `.webp` por URL;
  - o navegador só baixa a imagem quando a tela ou o estado a desenham;
  - o que cada arte nova acrescenta ao bundle são ~100 bytes de string.
  - O tamanho do bundle depois do H2 o Keel confere no build exclusivo.
- **Qualidade:** a q76 só nas poses comuns, se o lote P1 precisar; as de vida e as de herói ficam como estão.
