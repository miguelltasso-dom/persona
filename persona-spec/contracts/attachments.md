# Contrato — Anexos de mensagem e upload de avatar (Anvil Remote · Prism)

Dono do Remote: **Anvil** (`persona-host` `MediaHost`). Consumidor: **Prism** (composer + editor de persona). Lumen só lista/mostra.

Bytes no fio são **base64**. Tipo detectado por assinatura (magic bytes), nunca pela extensão. SVG, HTML e executáveis são recusados. Nome higienizado (sem path, sem reservados do Windows).

## Anexos

| RPC | Efeito |
|---|---|
| `attachFile({ streamKind, ownerId, name, bytesBase64 })` | guarda em `<PERSONA_HOME>/attachments/<projectId>/<hash>` |
| `postMessage({ attachmentIds })` | vincula os ids à mensagem |
| `listAttachments` | por `messageId`, ou pelo stream se `messageId` vazio |
| `getAttachment` / `getAttachmentBytes` | metadados / bytes. ACL no servidor |

Limites: 8 MB/arquivo, 8 arquivos/mensagem, 20 MB/mensagem, 200 MB/projeto. Texto com cara de credencial: `credentialWarning: true` (não bloqueia).

ACL: canal = membro do workspace; DM = só participantes. Outra pessoa no DM → `forbidden` / lista vazia.

HTTP `GET /api/persona/media?kind=attachment&id=`: `Content-Type` fixo, `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`.

Runner: se `capabilities().vision === true` (Rivet), imagens vão como entrada de visão (`stageForRunner`); os demais arquivos (e todas as imagens sem visão) vão como cópia somente-leitura em `inputs/` do worktree. O prompt cita `Anexos: nome1, nome2`. ACL e limite 8 MB iguais ao anexo.

## Avatar (SCOPE §1)

| RPC | Efeito |
|---|---|
| `uploadPersonaAvatar({ personaId, name, bytesBase64 })` | PNG/JPEG/WebP ≤ 2 MB, lado ≤ 2048. `<PERSONA_HOME>/avatars/<hash>`. `avatarKind: upload` |
| `removePersonaAvatar` | silhueta; blob órfão apagado |

SVG recusado. Troca sem deixar órfão. HTTP `kind=avatar` + `id=<hash>` (`inline`).

## Composer (Prism)

Até estes métodos existirem os botões ficam desabilitados. Com o Remote no ar: `PERSONA_MESSAGE_ATTACHMENTS_HOST_READY` e `PERSONA_AVATAR_UPLOAD_HOST_READY`.
