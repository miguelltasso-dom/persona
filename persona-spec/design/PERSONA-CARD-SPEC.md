# Cartão da Persona: especificação (Muse → Prism/Lumen, 03/11/2026)

Pedido do Miguel via Atlas. A referência `ref-cartao-persona.jpg` dá **só a estrutura**. O visual é o nosso: contorno ameixa, adesivo, cena do banner com a pose ao vivo.

## 1. Peças prontas (Muse)

| Peça | Arquivo | Para quê |
|---|---|---|
| `PersonaCard`, `PersonaCardFacts`, `PersonaCardPopover`, `usePersonaCardController`, `NOW_POSE` | `primitives/PersonaCard.tsx` (exportados por `primitives/index.ts`) | Visual puro: só props e rótulos já traduzidos |
| `PersonaInfoCard`, `PersonaInfoFacts`, `personaCardLabels`, `personaCardFacts`, `liveStateToNowKind`, tipo `PersonaCardInfo` | `profile/PersonaInfoCard.tsx` | Liga ao locale `persona.profile` (chaves `card.*`, `now.*`) a partir do formato `PersonaCardInfo` |
| Rail "Sua equipe" | `shell/RailTeam.tsx` | Passar o mouse sobre a linha abre o cartão após 450 ms. O ⋯ ("Sobre Nina") abre com foco. Clicar na linha continua abrindo a DM |
| Perfil | `profile/PersonaProfilePage.tsx` | Mesmo bloco ao lado da cena grande (`layout="wide"`), mais "Fila agora", "Entregas recentes" e o estado vazio ilustrado de "Atividade recente" |

## 2. Anatomia

1. **Cena**: 112 px. Banner claro/escuro, com a pose ao vivo apoiada na borda de baixo. A pose segue o `nowKind` via `NOW_POSE`:
   - `waiting-reply` → `aguardando-resposta`;
   - `quota`, `resting` → `descansando`;
   - `offline` → `offline`;
   - `stuck` → `erro`.

   No canto fica o ⋯ (menu: Abrir perfil · Editar persona · Trocar motor · Pausar/Retomar).
2. **Identidade**:
   - nome em Fredoka 24, com selo de presença (verde online, âmbar ausente, cinza fora);
   - "@handle · cargo · setor";
   - selos de função ("Coordena o time", "Vigia").
3. **Agora**: faixa com ícone de estado do Brush e a frase humana ("Revisando cláusulas do contrato"), com a legenda "O que está fazendo agora". A cor de fundo segue a categoria:
   - trabalhando = doing;
   - revisando = review;
   - esperando/cota = needs-you;
   - travou = danger.
4. **Quem pode falar**: "Todos do workspace" ou os nomes escolhidos, com o link **Editar**. A linha fica oculta enquanto a ACL não carregou.
5. **Fatos**: Presença · Responsável · Substituto · Projeto atual. "Ninguém definido" aparece em vermelho, porque é uma lacuna de governança.
6. **Modelo**: rótulo do motor mais as barras **5h** e **Semana**:
   - âmbar a partir de 80%, vermelho a partir de 100%;
   - "No limite até 18:30" em vermelho;
   - **sem cota = texto "Este motor não informa a cota." (D-092, 07/11). Nunca 0%.**
7. **Mensagem para Nina…**: campo-pílula com o botão enviar. Enter envia **na DM** e fecha o cartão.

## 3. Comportamento e acessibilidade

- Um cartão por vez (`usePersonaCardController`). É um diálogo não modal com `aria-label` = nome, renderizado em portal no `body`, então nenhuma máscara ou overflow o corta.
- Posição: à direita do avatar; vira para a esquerda se não couber; fica sempre dentro da viewport.
- Abertura pelo hover não rouba o foco. Clique ou teclado põe o foco no cartão.
- **Esc** fecha e devolve o foco ao avatar. Clique fora ou Tab para fora também fecha.
- O menu ⋯ segue o padrão `menu`/`menuitem`: setas, Home/End, Esc volta ao ⋯.
- Movimento: entrada com mola de 180 ms e a pose sobe em 320 ms. Com `prefers-reduced-motion`, nada se move.

## 4. Dados (Anvil já publicou no contrato, Status 21:20)

`getPersonaCard`, `getPersonaTalkAcl`, `setPersonaTalkAcl`, `pausePersona`, `resumePersona`, `setPersonaEngine`.

Mapeie a resposta para `PersonaCardInfo`:
- `limitedUntil` vai como hora local já formatada ("18:30");
- percentuais ausentes ficam `undefined`;
- se o motor não informa cota, `quota: undefined`.

## 5. Montagem (Prism)

1. **Sidebar** (`mount.ts`, `sidebarInject`): injetar
   - `sendToPersona(id, text)` = `selectPanel('directMessages')` + `await live.openPersonaDm(id)` + `live.postDmMessage(text)`;
   - `editPersona(id)` = `shellHandle.actions.openPersonaEditor(id)`.

   O `PersonaSidebar` já repassa as duas ao `RailTeam`. Também injetar `cardInfo(id)` a partir de um cache de `getPersonaCard`; sem ele, o rail monta um cartão básico a partir da linha.
2. **Global**: um `usePersonaCardController` no frame, exposto por contexto ou hook, para que estes pontos espalhem `triggerProps(personaId)` no botão do avatar:
   - autor das mensagens (#geral e DM);
   - nomes do banner "Sua equipe neste canal";
   - avatar do cartão do quadro;
   - organograma (`OrgChart onSelectPersona`).

   Renderizar um único `<PersonaCardPopover {...popoverProps} label={info.name}><PersonaInfoCard info={info} … /></PersonaCardPopover>`.
3. **Perfil** (Lumen, `RemoteProfilePanel`): passar
   - `card` (de `getPersonaCard`);
   - `queue` (tarefas abertas da persona: título + status);
   - `deliveries` (concluídas recentes: título + hora);
   - `onEditTalk`.

## 6. Aceite (Muse revisa por captura)

- Cartão aberto no rail, nas mensagens, no banner, no quadro e no organograma, em claro e escuro.
- Estados obrigatórios: trabalhando, esperando aprovação, esperando resposta, no limite de cota, descansando, offline.
- axe 0, Esc e foco verificados, reduced-motion verificado.
- Capturas em `.maestri/tmp/shots/design/card-*`.
