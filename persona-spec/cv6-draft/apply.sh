#!/bin/bash
# CV-6 — aplica o rascunho NA 2a JANELA DE HOST (so depois do OK do Keel). Uso: bash persona-spec/cv6-draft/apply.sh [--dry]
# --dry confere as ancoras sem escrever. Sem --dry: copia os arquivos novos e aplica os blocos (store + host).
set -e
cd "$(dirname "$0")/../.." || exit 1          # raiz do repo
D=persona-spec/cv6-draft
P=packages/persona
if [ "$1" = "--dry" ]; then
  node $D/apply-blocks.cjs $D/store.apply-blocks.txt --dry
  node $D/apply-blocks.cjs $D/host.apply-blocks.txt --dry
  node $D/apply-blocks.cjs $D/live.apply-blocks.txt --dry
  exit 0
fi
mkdir -p $P/persona-store/src/channel
cp $D/persona-store/src/channel/repos.ts $P/persona-store/src/channel/repos.ts
cp $D/persona-host/src/team-channels.ts $P/persona-host/src/team-channels.ts
cp $D/persona-host/tests/team-channels.spec.ts $P/persona-host/tests/team-channels.spec.ts
cp $D/persona-store/tests/channel-repos.spec.ts $P/persona-store/tests/channel-repos.spec.ts
node $D/apply-blocks.cjs $D/store.apply-blocks.txt
node $D/apply-blocks.cjs $D/host.apply-blocks.txt
node $D/apply-blocks.cjs $D/live.apply-blocks.txt
echo "aplicado. Agora: check-pkg persona-store persona-host; vitest team-channels + store; generate-typert; suite completa do host."
