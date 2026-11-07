> **D-084 (04/11): a regra de produto deste doc foi substituída pela `PERSONA-POWERS-SPEC.md`.** Continuam valendo daqui as formas de Conexões › "Seus conectores" (a linha, os rostos, o Tirar) e o aviso do Codex. A regra "só local é concedível" caiu: os da conta também ficam disponíveis.

# Dar a uma persona acesso a um conector seu (D-081 · ISO-3)

Muse, 04/11. A implementação é do **Quill**, depois do hash do instalador.

**Primitivos:** `Card`, `Avatar`, `Chip`, `Button`, `Modal`, `ChoiceCards`, `Switch`, `Notice`, `Toast`, `formatWhen`. Nenhum componente novo.

**A regra de fundo (D-081):** a persona roda isolada. Por padrão ela **não** vê nada do ambiente pessoal da CLI. Um conector só vale para uma persona quando **a pessoa concede, a ela, por nome**.

## 0. ~~O que pode ser concedido~~ (caiu com a D-084)
**Pela D-084, os conectores da conta do Claude e os locais ficam TODOS disponíveis às personas.** A linha "A Persona ainda não usa conectores da conta" deixou de valer. A regra de produto e as telas novas estão na `PERSONA-POWERS-SPEC.md`; daqui continuam valendo só a forma da linha do conector (§1) e o aviso do Codex.

**Combinado com o Anvil** (o contrato é `contracts/connector-grants.md`; os códigos do host são `not-grantable` e `isolation-partial`):
- **Os da conta aparecem por nome** (nunca escondidos), na sub-lista "Da sua conta Claude", cada um com o `Chip` neutral **"Da sua conta · não dá para dar às personas"**. Sem botão.
- **`isolation-partial`**: a IA não isola o ambiente (hoje, o Codex). No topo da seção vai um `Notice tone="warning"`: **"O {motor} não separa o seu ambiente do das personas: quem usa o {motor} já pode usar os seus conectores."** Sem "Dar acesso" para esse motor. No cartão da persona que usa esse motor, a linha "Conectores" diz **"Todos os seus (o {motor} não isola)"**, em `warning`.
- Essa é uma informação de segurança: ela aparece sempre que for verdade, e nunca fica atrás de um "saiba mais".

| Chave | pt-BR | en |
|---|---|---|
| connectors.account | Da sua conta Claude | From your Claude account |
| connectors.accountChip | Da sua conta · não dá para dar às personas | From your account · can't be given to personas |
| connectors.accountNote | Este conector vive na sua conta do Claude. A Persona ainda não usa conectores da conta. | This connector lives in your Claude account. Persona doesn't use account connectors yet. |
| connectors.accountNoteIso5 | Este conector vive na sua conta do Claude. Dá para liberar para uma persona, mas cada chamada dela fica mais cara. | This connector lives in your Claude account. You can release it to a persona, but each of its calls costs more. |
| grant.iso5Warning | {name} vai gastar mais por chamada enquanto usar o {connector}. | {name} will spend more per call while using {connector}. |
| grant.iso5Cost (v1.2, Muse 07/11, com custo `measured` do host) | Com o {connector}, cada chamada de {name} usa ≈ {tokens} tokens a mais do seu limite. | With {connector}, each call by {name} uses ≈ {tokens} more tokens of your limit. |
| grant.iso5CostUnknown (v1.2, custo `unknown`; substitui o grant.iso5Warning) | Com o {connector}, cada chamada de {name} usa mais do seu limite. A Persona ainda não mediu quanto. | With {connector}, each call by {name} uses more of your limit. Persona hasn't measured how much yet. |
| connectors.isolationPartial | O {engine} não separa o seu ambiente do das personas: quem usa o {engine} já pode usar os seus conectores. | {engine} doesn't separate your environment from the personas': anyone using {engine} can already use your connectors. |
| connectors.allYours | Todos os seus (o {engine} não isola) | All of yours ({engine} doesn't isolate) |

## 1. Onde aparece

### Conexões › "Seus conectores" (uma seção nova, abaixo das contas)
- **O título:** "Seus conectores". **O subtítulo:** "Estão ligados à sua IA neste computador. As personas não usam nenhum até você dar acesso."
- **Uma linha por conector:**
  - o ícone do serviço (se houver no set; senão, o `UiIcon` `lock`);
  - o nome legível ("Google Drive", **nunca** o id do MCP);
  - na linha de baixo, quem tem acesso: "Só você" ou os `Avatar portrait 24` das personas + "Nina e Bento";
  - à direita, **Dar acesso** (`Button size="s" variant="secondary"`).
- **Vazio:** "Nenhum conector encontrado na sua IA. Quando você ligar um (Google Drive, Notion…), ele aparece aqui."

### No cartão da persona › "O que {persona} pode fazer" (UX-PHASE-PRISM-SPEC §3)
- A linha nova **"Conectores"**: os chips `size="s"` ("Google Drive · só leitura") ou "Nenhum".
- O link **Ajustar** leva a Conexões › Seus conectores, já filtrado nessa persona.

## 2. Dar acesso (`Modal` m)
- **O título:** "Dar acesso ao {conector}".
- **"Para quem":** uma grade de `Avatar portrait 40` + nome (a mesma do seletor de DM), com uma escolha só.
- **"O que pode fazer"**, só se o conector diferenciar; senão, a linha não aparece. São `ChoiceCards`:
  - **Só ler** (Recomendado): "{persona} pode ler e buscar no {conector}. Não muda nem apaga nada.";
  - **Ler e mudar:** "{persona} pode criar, editar e apagar no {conector}, como você faria."
- **A frase de consequência, sempre visível:** um `Notice` `info`, "{persona} passa a ver o que a sua conta do {conector} vê. Isso fica registrado, e você tira o acesso quando quiser."
  - Com "Ler e mudar": `Notice` `warning`, "{persona} vai poder mudar coisas no {conector} sem perguntar a cada vez, dentro da autonomia dela."
- **As ações:** **Dar acesso à {persona}** (primário) · Cancelar.
- **Depois:**
  - o Toast `success` "{persona} pode usar o {conector}";
  - a linha do conector mostra o rosto dela;
  - no #geral, uma linha de evento: "Você deu à {persona} acesso ao {conector} (só leitura)."

## 3. Tirar o acesso
- **Na linha do conector:** o ⋯ de cada rosto → "Tirar o acesso da {persona}".
- **No cartão da persona:** o ✕ no chip do conector.
- **Sem confirmação** (tirar é o lado seguro), com o Toast "Acesso tirado · Desfazer" por 6 s.
- **O efeito é imediato** e vale para a próxima chamada. Se uma tarefa estiver rodando e precisar dele, ela pede de novo ("Precisa de você": "{persona} precisa do {conector} para continuar.").
- **O estado depois:** a linha volta a "Só você".
- **O registro:** em Membros › Atividade, "{pessoa} tirou o acesso da {persona} ao {conector} · {formatWhen}".

## 4. Estados
| Estado | O que se vê |
|---|---|
| O conector deixou de existir na sua IA | A linha com o `Chip` `warning` "Não encontrado"; os acessos ficam guardados e voltam se ele voltar; "Remover da lista" (ghost) |
| A persona pede um conector que não tem | "Precisa de você": "{persona} quer usar o {conector}." + **Dar acesso** (abre o modal já preenchido) · Agora não |
| Na web (sem a ponte da CLI) | A seção mostra "Só funciona no app instalado." (o padrão do desabilitado com o porquê) |

## Texto (pt e en)

| Chave | pt-BR | en |
|---|---|---|
| connectors.title | Seus conectores | Your connectors |
| connectors.subtitle | Estão ligados à sua IA neste computador. As personas não usam nenhum até você dar acesso. | They're connected to your AI on this computer. Personas use none until you give access. |
| connectors.onlyYou | Só você | Only you |
| connectors.grant | Dar acesso | Give access |
| connectors.empty | Nenhum conector encontrado na sua IA. Quando você ligar um (Google Drive, Notion…), ele aparece aqui. | No connectors found in your AI. When you connect one (Google Drive, Notion…), it shows up here. |
| grant.title | Dar acesso ao {connector} | Give access to {connector} |
| grant.who | Para quem | For whom |
| grant.scope | O que pode fazer | What they can do |
| grant.read | Só ler | Read only |
| grant.readBody | {name} pode ler e buscar no {connector}. Não muda nem apaga nada. | {name} can read and search {connector}. Nothing is changed or deleted. |
| grant.write | Ler e mudar | Read and change |
| grant.writeBody | {name} pode criar, editar e apagar no {connector}, como você faria. | {name} can create, edit and delete in {connector}, as you would. |
| grant.consequence | {name} passa a ver o que a sua conta do {connector} vê. Isso fica registrado, e você tira o acesso quando quiser. | {name} will see what your {connector} account sees. It's logged, and you can take access back anytime. |
| grant.writeWarning | {name} vai poder mudar coisas no {connector} sem perguntar a cada vez, dentro da autonomia dela. | {name} will be able to change things in {connector} without asking each time, within their autonomy. |
| grant.confirm | Dar acesso à {name} | Give {name} access |
| grant.done | {name} pode usar o {connector} | {name} can use {connector} |
| grant.event | Você deu à {name} acesso ao {connector} ({scope}). | You gave {name} access to {connector} ({scope}). |
| revoke.action | Tirar o acesso da {name} | Remove {name}'s access |
| revoke.toast | Acesso tirado | Access removed |
| revoke.needAgain | {name} precisa do {connector} para continuar. | {name} needs {connector} to continue. |
| connectors.missing | Não encontrado | Not found |

**O gênero:** "à {name}" e "dela" seguem o gênero da persona. Sem o gênero definido, "para {name}" e "dentro da autonomia de {name}".

## Aceite
- Captura no shell real (D-074), claro/escuro, 960 e 200%, de:
  - a seção com 0 e com 2 conectores;
  - o modal "Só ler" e o "Ler e mudar" (com o `warning`);
  - a linha com o rosto concedido;
  - o Toast do tirar com Desfazer;
  - o "Não encontrado".
- **Teste:** a persona sem concessão não recebe o conector na chamada (backend, com Rivet e Bolt); tirar vale na próxima chamada.
- Nenhum id de MCP visível na tela.
