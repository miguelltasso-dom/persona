# Contrato — canais por equipe do organograma (CV-6, CONVERSAS-SPEC §4)

Anvil (host/store) + Bolt (fan-out do CV-8, consome `teamPersonasOf`). Rascunho de 04/11, escrito durante o congelamento D-082 (só doc);
o código entra depois do hash do H2 #3. Forma da tela: `design/CONVERSAS-SPEC.md` (Muse; aprovada pelo Miguel). UI: Flint/Prism.

## O que a Muse decidiu (a regra)

- Cada **equipe** do organograma (Quem cuida de quem) com **2 ou mais personas** ganha o canal **#{equipe}**; os **gestores** ganham **#diretoria**
  (as personas Gestor + a pessoa dona). Os membros são a equipe.
- A pessoa pode **criar** (nome + quem entra), **renomear**, **arquivar** (vai para Arquivados) e **fixar**.
- **Um canal automático nunca é apagado sozinho.** Se a equipe sumir do organograma, ele vai para **Arquivados** com a linha
  "A equipe {x} não existe mais. O canal foi arquivado; nada foi apagado."

## De onde vem a equipe (verificado no código)

- **Equipe = setor** (`sector`, nível workspace). A persona entra na equipe pela carga dela (`persona_charge.sector_id`, a tela "Quem cuida de quem").
- **Gestor** = persona com `systemRoles` contendo `team_manager` (hoje a Coordenação nasce também Gestor, GES-1).
- **O canal vive por projeto** (`channel.project_id`; `UNIQUE(project_id, name)`). O canal #{equipe} de um projeto reúne as personas **daquele projeto**
  (`listPersonas(projectId)`) que estão na equipe; #diretoria reúne os Gestores daquele projeto + o dono do workspace.
- Hoje **não existe tabela de membros de canal** e `ChannelView` só tem `{id, projectId, name, topic}`. A regra "os membros são a equipe" é **derivada do
  organograma na hora de ler** (sem cópia que desatualiza); só o canal **criado pela pessoa** guarda membros.

### Escopo: por projeto na v1 (pergunta 8 da Muse, ABERTA para ela e o Keel)

A Muse prefere o canal do **workspace** (um #marketing para a empresa). O que o host tem hoje (verificado) e por que a v1 é por projeto:
1. **O setor é do workspace** (`sector.workspace_id`), mas **a persona é "de casa" em UM projeto** (`persona.project_id`; `listPersonas(projectId)` devolve só as de casa; a tabela `participation` não entra nessa lista).
2. **O runtime que executa é por projeto** (`orchestration.runtime(projectId)`, `executorOf(projectId)` escolhe entre `listPersonas(projectId)`): uma Tarefa pedida num canal só pode ser executada pelas personas **do projeto onde o runtime roda**. Um #marketing do workspace cujas personas moram em projetos diferentes não consegue executar junto.
3. **O ACL de canal é o do projeto**; um canal do workspace precisa de escopo novo (membros do workspace), e a Tarefa criada ali precisa de uma regra de **qual projeto/quadro a recebe**.
4. **No caso comum os dois coincidem:** o time nasce no onboarding dentro de um projeto (Pessoal) e todas as personas de uma equipe moram nele ⇒ a v1 por projeto dá **um** #marketing para a empresa. Só multiplica se a mesma equipe tiver ≥ 2 personas em cada um de vários projetos, e a lista mostra só os canais **do projeto aberto** (5 projetos × 5 equipes são 25 canais, mas no máximo 5 visíveis de cada vez).

**v2 (canal de workspace de verdade)**, se a Muse precisar: (a) escopo de ACL "workspace" para canal; (b) a regra da Tarefa (ex.: vai para o projeto de casa da persona que a pegar, ou o canal tem um projeto-âncora); (c) a persona participar do runtime de outro projeto. Três mudanças de modelo no Bolt/engine: decisão de **arquitetura** (Keel/Atlas), **não** entra antes do hash. Até lá, `teamPersonasOf(projectId, channelId)` fica como está.

## Armazenamento (store; migração aditiva — o número segue a ordem de merge: ISO-2 é v22, esta v23 se vier depois)

```sql
ALTER TABLE channel ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('general','team','directorate','custom'));
ALTER TABLE channel ADD COLUMN source_id TEXT;               -- team: o id do setor; directorate/general/custom: NULL
ALTER TABLE channel ADD COLUMN archived_at TEXT;             -- NULL = ativo
ALTER TABLE channel ADD COLUMN archived_reason TEXT;         -- 'team-gone' | 'directorate-gone' | 'by-person'
ALTER TABLE channel ADD COLUMN name_locked INTEGER NOT NULL DEFAULT 0 CHECK (name_locked IN (0,1)); -- a pessoa renomeou: o organograma não renomeia de volta
CREATE UNIQUE INDEX channel_team_source ON channel (project_id, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE channel_member (                                 -- SÓ canal custom (team/directorate derivam do organograma)
  channel_id TEXT NOT NULL REFERENCES channel(id) ON DELETE CASCADE, member_kind TEXT NOT NULL CHECK (member_kind IN ('persona','human')),
  member_id TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (channel_id, member_kind, member_id)
) STRICT;
CREATE TABLE channel_pin (                                    -- fixar é de CADA pessoa (convidado remoto fixa o dele)
  channel_id TEXT NOT NULL REFERENCES channel(id) ON DELETE CASCADE, member_id TEXT NOT NULL, pinned_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, member_id)
) STRICT;
```
Os canais de hoje ficam `kind='custom'`, exceto o `#geral` de cada projeto → `'general'` (migração: `name = 'geral'`). `#geral` **não arquiva nem sai**.

## O reconciliador (a parte que faz "nascer" e "arquivar")

`reconcileTeamChannels(workspaceId, projectId)` — **idempotente**, só host. Roda quando o organograma muda (persona criada/atualizada/removida,
setor criado/renomeado/removido, carga mudou, papel Gestor mudou), na criação de projeto e **no boot** (cura bancos existentes; é assim que as equipes de hoje ganham canal).

| situação | efeito |
|---|---|
| setor com **≥ 2** personas no projeto e sem canal | cria `#{slug}` (`kind='team'`, `source_id`=setor); nome em minúsculas, sem acento, `[a-z0-9-]`, ≤ 32; colisão (ex.: setor "Geral") ganha sufixo `-equipe`, `-equipe-2`… |
| a equipe ganha/perde personas, mas continua com ≥ 1 | o canal **fica ativo**; os membros acompanham (derivados). **Encolher nunca arquiva.** |
| o **setor some** ou fica com **0** personas | `archived_at`=agora, `archived_reason='team-gone'` e **uma linha no próprio canal**: "A equipe {x} não existe mais. O canal foi arquivado; nada foi apagado." (id estável `team-gone:{canal}`; reconciliar de novo não repete) |
| a equipe **volta** (setor de novo com personas, mesmo id) | **desarquiva** o mesmo canal (histórico intacto) |
| o setor é **renomeado** | o canal acompanha o nome, **a menos que** `name_locked` (a pessoa renomeou) |
| ≥ 1 Gestor no projeto | cria/mantém `#diretoria` (`kind='directorate'`, membros = Gestores + dono) |
| nenhum Gestor | arquiva `#diretoria` (`archived_reason='directorate-gone'`) com a linha "A diretoria não tem mais gestores. O canal foi arquivado; nada foi apagado." |

**Nunca apaga:** não existe caminho de código que remova uma linha de `channel` por causa do organograma (teste que varre os caminhos), e **não há Remote de apagar canal**.

## Remotes

```ts
interface ChannelView { /* …como hoje… */ projectName: string; kind: 'general'|'team'|'directorate'|'custom'; memberCount: number; archived: boolean; archivedReason?: 'team-gone'|'directorate-gone'|'by-person'; pinned: boolean; teamName?: string }
// projectName: o nome do projeto do canal, para a tela dizer de onde ele é sem juntar dados ('#marketing · Pessoal'; Muse, 19:19: com mais de 1 projeto o cabeçalho e o título 'Canais · {projeto}' dizem o projeto).
interface ChannelMemberView { kind: 'persona'|'human'; id: string; name: string }

listChannels(req): ChannelView[]            // ordem: fixados, ativos (equipe/diretoria/custom por nome; #geral primeiro), arquivados no fim; pinned é de quem pergunta
listChannelMembers(req & { channelId }): ChannelMemberView[]
createChannel(req & { memberIds?: { kind; id }[] }): ChannelView      // custom; já existe — ganha os membros
renameChannel(req & { channelId; name }): ChannelView                 // team/directorate/custom; marca name_locked; colisão → code 'duplicate-name'
archiveChannel(req & { channelId }): ChannelView                      // by-person; recusa #geral ('not-allowed')
unarchiveChannel(req & { channelId }): ChannelView
setChannelPinned(req & { channelId; pinned: boolean }): ChannelView   // por pessoa
```
- **ACL:** leitura = quem lê o projeto; criar/renomear/arquivar = `requireWrite` do projeto (o dono, ou quem pode escrever); **fixar** = qualquer membro, só dele.
  O canal custom lista só membros guardados; a **leitura** do canal segue o ACL de projeto (membros organizam a conversa e o fan-out, **não** são uma barreira nova de privacidade
  em v1 — #diretoria é rótulo e fan-out; se a Muse quiser #diretoria privado, vira decisão de ACL à parte, e eu aviso antes).
- **Postar em canal arquivado** é recusado com `code: 'channel-archived'` e texto pt-BR ("Este canal está arquivado. Desarquive para escrever."): uma mensagem a um canal que ninguém lê
  seria **silêncio** (a invariante do D-079). Ler continua permitido.
- `renameChannel` valida nome (1–32, sem `#`, sem controle) e unicidade por projeto.

## O que o Bolt consome (CV-8) — interno, não é Remote

```ts
teamPersonasOf(projectId: string, channelId: string): StoredPersona[]
```
- `team`: as personas do **setor** naquele projeto; `directorate`: os Gestores do projeto; `custom`: os membros-persona guardados; `general`: **todas** as personas do projeto
  (a Coordenação é quem responde por padrão; "Toda a equipe" só aparece em canal de equipe, mas a função serve ao #geral).
- **Ordem estável** (por nome, depois id), **sem** as personas removidas e **com** as pausadas (quem filtra pausadas/limite/orçamento é o fan-out do Bolt; o canal descreve a equipe, não o estado).
- Canal arquivado ou inexistente ⇒ `[]`. Pura leitura do store/organograma; sem relógio, sem modelo.

## Prova (CV-6)

- **store:** migração (canais de hoje viram `custom`, `#geral` vira `general`); `UNIQUE(project_id, source_id)`; `channel_member`/`channel_pin` cascateiam ao apagar o canal; migração aditiva sobre v21/v22.
- **host:** `tests/team-channels.spec.ts` —
  - o canal **nasce** (setor com 2 personas; 1 persona não cria), com slug sem colisão com `#geral`; `#diretoria` nasce com ≥ 1 Gestor e membros = Gestores + dono;
  - **encolher não arquiva** (de 3 para 1 fica ativo); o setor **some** ⇒ arquivado com a linha, **nada apagado** (linhas de mensagem intactas), reconciliar duas vezes não repete a linha; a equipe volta ⇒ desarquiva o mesmo canal;
  - renomear com `name_locked` resiste ao reconciliador; setor renomeado sem lock renomeia o canal; colisão ⇒ `duplicate-name`;
  - **boot cura** um banco que já tinha equipes (o reconciliador no abrir cria os canais);
  - postar em canal arquivado ⇒ `channel-archived`; `#geral` não arquiva; fixar é por pessoa (outro membro não vê);
  - `teamPersonasOf` para team/directorate/custom/general/arquivado, ordem estável;
  - **varredura "nunca apaga":** nenhum caminho do reconciliador emite `DELETE FROM channel`; não há Remote que apague;
  - `remote-acl.spec.ts` cobre os Remotes novos; Typert regenerado.

## Ordem de entrega

1. **Depois do hash do H2 #3**: store → reconciliador + Remotes + `teamPersonasOf` → Typert. O Bolt trabalha contra uma interface injetada com mock até lá (já combinado); a assinatura de `teamPersonasOf` acima é a que ele pode fixar agora.
2. UI (Flint/Prism) liga em `ChannelView.kind/archived/pinned/memberCount` e nas ações; o vazio do canal de equipe é da Muse (arte `empty-equipe`).
3. **Zero IA real** em tudo isto.
