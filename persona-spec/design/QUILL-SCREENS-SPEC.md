# Telas do Quill: Equipe remota (E13) e Canvas em lista (G2)

Muse, 04/11.
- **Pedido do Atlas:** revisar as telas do Quill contra a SCREEN-SPECS e escrever o que faltava.
- **Já têm spec:**
  - Conexões e contas: WAVE2-SPEC §(c);
  - Ensinar: WAVE2-SPEC §(b) e TEACH-PERSONA-SPEC, com o desvio aprovado: **sem microfone**, narração digitada depois de parar.
- **Faltava spec:** E13 e G2. Base: SCREEN-SPECS "Receita comum" e DESIGN-SYSTEM. Código: `remote-team/RemoteTeamPanel.tsx` e `canvas/CanvasView.tsx`, que já estão bem estruturados. Esta spec acerta forma e texto.

## E13 · Equipe remota (Mais › Membros › Equipe remota)

**Casca:** o `Card` "Equipe remota" com o subtítulo atual. O que vale aqui está certo: "DMs, execuções e contas nunca saem daqui."

**1. A linha de estado, no topo e sempre visível.** É um `Chip` com ícone + texto, nunca só a cor, no `role="status"` que já existe:

| Estado | Chip | Linha de ajuda (ink-soft) | Ação |
|---|---|---|---|
| Não conectada | `neutral` | "Conecte para dividir canais com colegas." | (o formulário abaixo) |
| Conectada | `success` + `check` | "Última troca há {tempo}." | Sincronizar agora (ghost) |
| Sem conexão | `warning` + `clock` | "As mensagens novas ficam guardadas e sobem quando a conexão voltar." | Tentar de novo |
| Acesso encerrado | `danger` + `lock` | "A pessoa dona da equipe encerrou o seu acesso. O que já estava aqui continua aqui." | — |
| Cofre indisponível | `warning` + `alert` | "Não consigo ler a chave guardada neste computador. Abra a Persona de novo; se continuar, veja Ajuda." | Abrir Ajuda |

**2. Conectar (dono).**
- O endereço é técnico por natureza, então **a dica nunca mostra um IP**. Hoje: "Por exemplo, http://127.0.0.1:8791". Troque por **"Está na mensagem de configuração da equipe."**
- A validação continua inline.
- **"O que compartilhar":** a lista de canais com checkbox, a dica atual, e **#geral marcado por padrão**.

**3. Convidar.**
- **"Como a pessoa entra":** `ChoiceCards` em 2 opções, com o que **cada uma pode e não pode**, nunca "menos permissões":
  - **Membro:** "Conversa nos canais compartilhados e vê o quadro deles."
  - **Convidado:** "Lê e responde nos canais compartilhados. Não convida ninguém nem muda o que é compartilhado."
- **Convite criado:** um `Card tone="accent"`, com o endereço e o código num bloco mono **com quebra de linha** (nunca rolagem lateral) e **Copiar convite** como primário. O aviso "aparece só agora" é um `Notice warning`. "Já enviei" fecha o cartão.

**4. Lista de convites.**
- Cada linha: o papel (chip) · o estado · a data.
- **Termo único:** "Acesso encerrado" no estado, e a ação **"Encerrar acesso"** no lugar de "Revogar acesso". O chip "Revogado" vira **"Encerrado"**.
- **A confirmação:** "Encerrar o acesso de {quem}?" / "A pessoa deixa de ver os canais compartilhados a partir de agora. O que ela já viu continua com ela." · **Encerrar acesso** (danger) · Cancelar.
- **Vazio:** "Nenhum convite ainda." + Gerar convite.

**5. Entrar por convite (outra pessoa):** os campos "Endereço" e "Código do convite", com a dica **"Os dois vêm juntos no convite que você recebeu."** Se o usuário colar o texto inteiro do convite num campo, separe sozinho os dois valores.

**Texto a trocar** (grep antes; os testes usam o texto):

| Chave | Hoje | Novo |
|---|---|---|
| remote.connect.addressHint | Por exemplo, http://127.0.0.1:8791 | Está na mensagem de configuração da equipe. |
| remote.invite.role.member | Participa dos canais compartilhados. | Conversa nos canais compartilhados e vê o quadro deles. |
| remote.invite.role.guest | Participa com menos permissões. | Lê e responde nos canais compartilhados. Não convida ninguém nem muda o que é compartilhado. |
| remote.invites.revoke | Revogar acesso | Encerrar acesso |
| remote.invites.status.revoked | Revogado | Encerrado |

## G2 · Canvas: o mapa e a lista

**Casca:** `Screen`, com o eyebrow e o título atuais. **As abas "Canvas · Lista"** (`Tabs`) ficam à esquerda; os controles de zoom (Aproximar, Afastar, Ver tudo) ficam à direita, **só no modo Canvas**.

**Modo Lista** (o que garante que nada depende de ver o desenho):
- É uma tabela dentro de `Card padding="none"`, com as colunas **Tipo · Nome · Ligado a · Quem**.
  - Tipo: `Chip` com ícone.
  - Nome: 15/700.
  - Ligado a: a relação em palavras, como já existe ("leva a {x}", "vem de {y}").
  - Quem: `Avatar portrait 24` + nome.
- Linhas de 48 px, com o hover `--persona-wash`.
- **Teclado:** as setas sobem e descem nas linhas, Home e End vão às pontas, Enter abre o item. Isso já está feito, com o foco ficando na aba ao trocar.
- **O modo escolhido fica lembrado** (localStorage, protegido por try/catch).

**Modo Canvas:**
- Os nós são cartões-adesivo (contorno ameixa e `shadow-sticker`), com o nome cortado e o nome inteiro no `aria-label`, como já existe.
- As linhas usam `--persona-outline-soft` e ficam mais fortes quando um nó está em foco ou com hover.
- O zoom usa o `transform` do CSS e respeita reduced-motion: sem animação de zoom.
- **Só o que é visível:** o que está fora da visão não é desenhado, mas continua na Lista.

**Estados:**
- carregando: `Skeleton` com 3 nós;
- vazio: `EmptyState` com a pose `disponivel` da Luna, "Nada no mapa ainda", "Tarefas e decisões ligadas aparecem aqui." e **Ir para Quadros**;
- erro: `ErrorState` com Tentar de novo.

**A 960×640 e no zoom 200%:** a Lista é o padrão abaixo de 720 px de largura. No canvas, sem rolagem lateral da página: o mapa rola dentro do próprio quadro.

## Aceite (os dois)
1. Capturas claro/escuro, 960×640 e zoom 200%, com axe 0. O axe = 1 nas capturas parciais de Conexões precisa zerar.
2. **E13:** o fluxo convidar → aceitar → ver o canal, com dois perfis, e um "Encerrar acesso" que muda o estado do outro lado para "Acesso encerrado".
3. **G2:** só pelo teclado, achar um item e abrir; trocar de modo sem perder o foco.
4. Nenhum IP, "token", "sync" nem "revogar" visível em nenhuma das duas.
