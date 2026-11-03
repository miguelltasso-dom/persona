import fs from 'node:fs'
import path from 'node:path'

const dir = path.join(process.cwd(), 'packages/persona/client-ui-persona/locale-sources')
const ptTitle = 'Não consegui falar com a equipe agora'
const enTitle = "Couldn't reach the team right now"
const files = [
  'kanban', 'knowledge', 'files', 'routines', 'usage', 'connections',
  'approvals', 'rules', 'profile', 'members', 'canvas',
]

for (const base of files) {
  for (const lang of ['pt', 'en']) {
    const p = path.join(dir, `${base}.${lang}.json`)
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (j['error.title'] !== undefined) {
      j['error.title'] = lang === 'pt' ? ptTitle : enTitle
      fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`)
    }
  }
}

for (const [name, label] of [['importers.en.json', 'Import progress'], ['importers.pt.json', 'Progresso da importação']]) {
  const p = path.join(dir, name)
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j['progressLabel'] = label
  fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`)
}

console.log('patched lumen remote error copy')
