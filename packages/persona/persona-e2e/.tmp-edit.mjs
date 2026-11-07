import { readFileSync, writeFileSync } from 'node:fs'
const f = 'tests/mandatory-team-day-host.spec.ts'
let t = readFileSync(f, 'utf8')
const nl = t.includes('\r\n') ? '\r\n' : '\n'
function rep(a, b) { if (!t.includes(a)) throw new Error('nomatch: ' + a.slice(0, 70)); t = t.replace(a, b) }

// 1. readable names and no internal markers in the transcript
rep("function record(lines: Line[], scene: string, at: string, events: readonly Row[], seen: Set<string>): void {",
`const NAMES: Readonly<Record<string, string>> = { ana: 'Ana (você)', lia: 'Lia · Coordenação', bia: 'Bia · Redação', teo: 'Teo · Design', caio: 'Caio · Mídia', 'routine:manha': 'Rotina "Resumo da manhã"' }

/** What the person SEES: internal card markers become a plain note, ids become names (never prompts or ids in the transcript). */
function human(body: string): string {
  return body
    .replace(/\[\[gestor-plan:[^\]]*\]\]/gu, '(cartão do plano, com Aprovar / Ajustar / Agora não)')
    .replace(/\[\[task-proposal:[\s\S]*?\}\]\]/gu, '(cartão "Proposta de Teo": Aceitar / Agora não)')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 220)
}

function record(lines: Line[], scene: string, at: string, events: readonly Row[], seen: Set<string>): void {`)
rep("lines.push({ scene, at, actor: row.actorId, text: row.body.replace(/\s+/gu, ' ').slice(0, 220) })",
    "lines.push({ scene, at, actor: NAMES[row.actorId] ?? row.actorId, text: human(row.body) })")
// tests filter lines by actor id: use names now
t = t.split("line.actor === actor).map(line => line.text.split(':')[0])").join("line.actor.toLowerCase().startsWith(actor)).map(line => line.text.split(':')[0])")
rep("expect(order.slice(0, 2)).toEqual(['ana', 'lia'])", "expect(order.slice(0, 2)).toEqual(['Ana (você)', 'Lia · Coordenação'])")
rep("expect(order[2]).not.toBe('lia')", "expect(order[2]).not.toBe('Lia · Coordenação')")

// 2. scene 7: do not let orchestration.flush resolve the injected question on its own
rep(`    clock.ms += 3 * DAY
    await scheduler.cycle()
    await scheduler.whenIdle()
    await flush()
    stage('7 · três dias depois')`, `    clock.ms += 3 * DAY
    await scheduler.cycle()
    await scheduler.whenIdle()
    stage('7 · três dias depois')`)

// 3. scoreboard at the end of the transcript
rep("    writeFileSync(join(OUT, 'transcript.md'), `${md.join('\n')}\n`)",
`    const mark = (ok: boolean): string => (ok ? '✅ passa' : '❌ falta')
    md.push('', '## Placar: o que já é de equipe real e o que falta (D-090)', '',
      '| # | Comportamento | Hoje |', '|---|---|---|',
      \`| — | A Coordenação recebe o pedido e diz quem assume | \${mark(day.ask.coordinationAcknowledged)} |\`,
      \`| — | Com @menção, 3 pedidos vão a 3 personas diferentes | \${mark(day.mentions.executors.join() === 'Bia,Caio,Teo')} |\`,
      \`| — | O Gestor propõe; nada é contratado antes de aprovar | \${mark(day.plan.personasBeforeApprove === 0)} |\`,
      \`| — | A rotina da manhã chega à Coordenação | \${mark(day.morning.routineMessageArrived && day.morning.ownerReplied)} |\`,
      \`| — | Persona travada numa pergunta propõe sozinha | \${mark(day.idle.cardPersona === 'Teo')} |\`,
      \`| 1 | Passar contexto (bilhete) | \${mark(day.team.handoffEvent && day.team.ticketNote)} |\`,
      \`| 2 | Passar trabalho em cadeia (a dependência acorda a próxima) | \${mark(day.handoff.colleagueWoke && day.handoff.cardBlockedWhileWaiting)} |\`,
      \`| 3 | Pedir ajuda a um colega para terminar | \${mark(day.team.askColleagueRemote)} |\`,
      \`| 4 | Pedir opinião ao time todo (texto e imagem) | \${mark(day.team.opinionRemote)} |\`,
      \`| 5 | Revisão entre colegas ("Revisado pela Lia") | \${mark(day.team.reviewSeal)} |\`,
      \`| 6 | Reunião do dia "Bom dia" sem IA | \${mark(day.team.dailyBriefEvent)} |\`)
    writeFileSync(join(OUT, 'transcript.md'), \`\${md.join('\n')}\n\`)`)
writeFileSync(f, t)
console.log('ok')
