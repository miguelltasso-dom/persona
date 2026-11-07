# Modelo e esforço por persona (pedido do Miguel via Atlas, 04/11 · v1.1)

O Miguel quer escolher, para cada persona, o modelo **e** o esforço: por exemplo, o Atlas no Opus em `max` e a Nina no Sonnet equilibrado.

**O que existe hoje:** o `PersonaEngineOverlay` troca só o **motor**. O modelo vai fixo como `'sonnet'` em `onSave`, então hoje o modelo também não é escolhido. Esta spec cobre os dois.

**Princípio (o Miguel, 04/11):** "cada usuário pode definir o tanto de esforço que quiser nos agentes; não é algo que nós devemos decidir por ele. Podemos deixar o que vem de padrão, mas ele pode mexer."
- **O padrão de toda persona nova é o Padrão do motor,** tanto no modelo quanto no esforço. A Persona não escolhe por ninguém.
- **A pessoa escolhe QUALQUER modelo e QUALQUER nível que o motor aceita,** sem trava, sem confirmação extra, sem aviso que pede "tem certeza?" e sem selo de "Recomendado" empurrando uma opção.
- **As dicas de velocidade e de custo só informam.** Não dizem o que fazer, não usam cor de alerta e não usam verbo no imperativo.

Donos:
- a tela: Flint;
- o campo no host e a lista do que cada motor aceita: Anvil;
- o `--model` e o `--effort` no runner: Tally (ele já passa o esforço explícito no answer-only).

## 1. A palavra e os níveis — NÍVEIS NATIVOS (Miguel via Atlas, 07/11 14:20; substitui o "Capricho")
O Miguel: "não existe 'muito caprichado' e 'caprichado' dentro do Claude ou do Codex". Ele tem razão.

- **O campo se chama "Esforço"** (en "Effort"). O tooltip: "Quanto a persona pensa antes de responder" (en "How much the persona thinks before answering").
- **Os níveis aparecem com o NOME NATIVO que a própria CLI usa**, sem tradução e em minúsculas, exatamente como o host manda em `effortLevels[]`:
  - Claude: `low`, `medium`, `high`, `xhigh`, `max`;
  - Codex: os do *reasoning effort* dele, na ordem do host.
- **Antes deles, "Padrão do motor"** (en "Engine default"), que não passa `--effort`.
- **Embaixo de cada nível, uma dica curta em pt-BR** (en ao lado). Só informa, nunca recomenda:

| nível (nativo) | dica pt | dica en |
|---|---|---|
| (Padrão do motor) | O motor decide quanto pensar | The engine decides |
| minimal | O mínimo de raciocínio, o mais rápido | Least reasoning, fastest |
| low | Mais rápido, gasta menos do limite | Faster, uses less of your limit |
| medium | Equilíbrio entre rapidez e cuidado | Balance between speed and care |
| high | Mais cuidadoso | More careful |
| xhigh | Bem mais cuidadoso, gasta mais do limite | Much more careful, uses more of your limit |
| max | O máximo de cuidado, mais lento e gasta bem mais do limite | Most careful, slower, uses much more of your limit |
| ultra | Acima do max: o mais lento e o que mais gasta | Beyond max: slowest, uses the most |
| (qualquer outro nome que o host mandar) | sem dica: só o nome | no hint: name only |

- **O chip** na persona vira **"{modelo} · {nível nativo}"** (ex.: "Opus · max"); com o Padrão do motor, só o modelo.
- **As frases que citam o nível** usam o nome nativo entre aspas:
  - `engine.effortSnapped`: O {model} não tem "{level}"; ficou em "{fallback}".
  - `engine.effortFellBack`: {name} usou o padrão do motor: o nível "{level}" não está disponível agora.

## 2. A forma (o Modal que já existe, com 3 blocos em sequência)
1. **Motor:** a lista que já existe, **sem o selo "Recomendado"** (`engine.recommended`), pelo mesmo princípio. Se um motor não estiver conectado, a linha diz isso ("Não conectado · Conectar"), mas não empurra outro.
2. **Modelo:** `ChoiceCards` compactos: "Padrão do motor" + os modelos que aquele motor aceita (a lista vem do host). O "Padrão do motor" não manda `--model`.
   - Cada cartão tem o nome comercial e uma dica honesta de uma linha, por exemplo:
     - Opus: "O mais capaz · mais lento e gasta mais do seu limite";
     - Sonnet: "Equilibrado entre capacidade e velocidade";
     - Haiku: "O mais rápido · gasta menos do seu limite".
   - **Sem selo "Recomendado"** e sem ordem que favoreça um modelo: a lista sai na ordem do host. O primeiro item é sempre "Padrão do motor", o selecionado de saída.
3. **Esforço:** uma LISTA de linhas, igual à do Modelo, com "Padrão do motor" primeiro e depois os níveis NATIVOS do motor (§1), cada linha com o nome nativo em negrito e a dica curta EMBAIXO, em `ink-soft` (o mesmo desenho das linhas do Modelo), e o ✓ à direita no escolhido.
   - **Só os níveis que aquele motor + modelo aceitam:** a lista vem do host. Nunca mostre um nível desabilitado que não existe.
   - **O motor não deixa escolher** (a lista vazia): o bloco some e fica a linha "Este motor não deixa escolher o esforço." Não aparece controle morto.
   - **O modelo mudou e o nível não vale mais:** cai para o nível válido mais próximo abaixo e aparece a linha "O {modelo} não tem "{nível}"; ficou em "{novo}"." (some ao salvar).
- **Custo honesto:**
  - nunca diga preço em dinheiro se o host não souber;
  - "limite" é o limite da conta/assinatura (a mesma palavra de Uso e limites);
  - se o host souber a cota, a dica pode completar "· você usou {n}% este mês".

**O layout (Muse 06:10, depois da captura com cliente falso):** EMPILHADO, nunca em colunas: Motor → Modelo como LISTA de linhas de largura total (nome em negrito + a dica numa linha, ✓ à direita) → Esforço em largura total, como LISTA de linhas (o nome nativo em negrito + a dica curta embaixo, ✓ à direita; 'Padrão do motor' primeiro) + a linha do snap. O corpo rola, e o rodapé fica fixo.

## 3. Onde aparece depois de salvo
- **No cartão/perfil da persona:** o chip "Opus · max" (ou só "Sonnet" quando é o Padrão do motor), ao lado do motor.
- **Em Configurações › Personas (PERSONA-POWERS §6):** o mesmo chip, na linha de cada persona; o clique abre este Modal.
- **No fio, nunca.** Não é informação de cada mensagem.

## 4. O contrato (Anvil, Tally)
- **`setPersonaEngine`** ganha `runnerModel: string | null` (o escolhido, não mais fixo; `null` = Padrão do motor, sem `--model`) e `runnerEffort?: 'low'|'medium'|'high'|'xhigh'|'max' | null`, em que `null` = Padrão do motor (o runner não passa `--effort`).
- **O host expõe, por motor:** os `models[]`, cada um com `{ id, label, hint?, effortLevels[] }`. Não há campo `recommended`: a UI não destaca nenhum.
  - A UI não tem lista própria de modelos nem de níveis.
- **O runner passa `--model` e `--effort` só quando foram escolhidos.**
  - Se a CLI recusar o nível na hora, o turno não falha em silêncio: o runner cai para o Padrão do motor e a atividade mostra "{persona} usou o padrão do motor: o "{nível}" não está disponível agora."
- **Codex e outros motores:** o mesmo formato. Se o motor não tiver esforço, `effortLevels` vem vazio (o caso "o motor não deixa escolher" do §2).

## 4.1 A versão mínima para o corte da v1.1 (Atlas, 06:25: o EFF-1 NÃO sai desligado)
- **Host (Anvil):** entrega `models[]` + `effortLevels[]` por motor. Se a CLI não responder, usa uma **tabela estática conhecida** (Claude: os modelos da conta + low/medium/high/xhigh/max; Codex: os níveis dele) e marca `source: 'cli' | 'static'`.
- **A origem em palavras simples** (Keel/Atlas 06:21), uma linha em `ink-soft` embaixo do título "Modelo": com `cli`, "Da sua conta"; com `static`, "Lista padrão do {motor}: sua conta não informou os modelos". Nada de "CLI", "static" ou "fonte". Se a CLI recusar um nível na hora, vale a queda para o padrão com a linha de atividade do §4 (`engine.effortFellBack`): a pessoa nunca fica sem saber.
- **Runner (Tally):** o `--model` e o `--effort` escolhidos chegam de fato à CLI. Prova: o ledger de um turno com Opus + Máximo mostra os dois.
- **Tela (Quill):** o layout EMPILHADO do §2 (o Motor; o Modelo como lista de largura total; o Esforço em largura total) e o chip "Opus · max" no cartão da persona depois de Aplicar.
- **Aceite mínimo:** a captura no shell real, com o host dando a lista (estática serve), claro/escuro × 1440/960/200 %, axe 0; o turno que prova o `--model/--effort`; o chip depois de salvar.

## 5. Textos (pt / en)
| chave | pt | en |
|---|---|---|
| engine.model | Modelo | Model |
| engine.effort | Esforço | Effort |
| engine.effortTip | Quanto a persona pensa antes de responder | How much the persona thinks before answering |
| engine.effortNone | Este motor não deixa escolher o esforço. | This engine doesn't let you choose the effort. |
| engine.effortSnapped | O {model} não tem "{level}"; ficou em "{fallback}". | {model} doesn't offer "{level}"; set to "{fallback}". |
| engine.modelsFromAccount | Da sua conta | From your account |
| engine.modelsDefaultList | Lista padrão do {engine}: sua conta não informou os modelos | {engine}'s default list: your account didn't report its models |
| engine.effortFellBack | {name} usou o padrão do motor: o "{level}" não está disponível agora. | {name} used the engine default: "{level}" isn't available right now. |

## 6. Aceite (Muse)
- **Captura no shell real** (D-074), claro/escuro, 1440/960/200 %:
  - o Modal com os 3 blocos;
  - a troca de modelo que derruba o nível (a linha do §2);
  - o motor sem esforço;
  - o chip no cartão da persona.
- **Axe 0;** o segmentado navegável por setas, com `aria-checked` correto.
- **Teste:**
  - uma persona nova sai com o Padrão do motor (modelo e esforço = `null`);
  - escolher qualquer nível salva direto, sem diálogo de confirmação;
  - nenhuma opção tem selo de recomendado;
  - a UI nunca lista um modelo ou nível que o host não mandou;
  - `null` não manda `--effort`;
  - o nome técnico (`xhigh` etc.) nunca aparece na tela.
- **Atrás de flag até o aceite (D-077):** `persona.flag.engineEffort`.
