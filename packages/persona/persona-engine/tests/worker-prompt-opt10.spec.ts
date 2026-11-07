/**
 * OPT-10 (cut of the Persona worker prompt): the redundant text of the worker prompt is gone, every rule it carried is still there, and the cut
 * is MEASURED dry against the frozen text of before. Measured on the real CLI (OPT-8b, 05/11): the Persona arm's prompt cost +464 tokens over the
 * direct text for +1,152 characters = 2.483 characters per vendor token; the estimator of the ledger (4 characters per token) is kept as the
 * second reading. No model is called.
 */
import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { describe, expect, it } from 'vitest'
import { FIXTURE_NINA } from '../src/bench/token-fixtures.ts'
import { workerPromptText } from '../src/bench/token-faithful.ts'
import { composeTurnPrompt } from '../src/prompts/stable-prefix.ts'
import { composePrompt, OWNER_NORMS, PROMPT_TEMPLATES, WORKER_PROMPT_MARK } from '../src/prompts/templates.ts'

/** The worker system prompt of Nina exactly as the host sent it before OPT-10 (frozen, verbatim, 1,242 characters with the task line). */
const BEFORE = [
  'Você é Nina, Padeira-chefe. Você executa a Tarefa autorizada.',
  '',
  'Fique no escopo da autorização. Relate progresso, bloqueio ou resultado com as ferramentas da Persona quando disponíveis e necessárias.',
  'Não fale no canal: a coordenação responde às pessoas.',
  'Em tarefas que pedem apenas uma resposta em texto com contexto fornecido, não use ferramentas: devolva o resultado e a evidência no texto final. Não inspecione arquivos, diretório de trabalho ou histórico, não execute comandos e não crie registros para a tarefa proposta.',
  'Em tarefas com operações externas autorizadas, inspecione o diretório de trabalho e o histórico antes de repetir uma operação externa.',
  '',
  '',
  'Normas de dono:',
  '- Termine o que o mandato pede. Não devolva trabalho que cabe a você.',
  '- Verifique o critério de aceite com evidência (teste, arquivo, comando).',
  '- Reporte com evidência (IDs, caminhos, resultado).',
  '- Proponha o próximo passo que descobriu — proposta estruturada, não "posso fazer se você quiser".',
  '- Proibido encerrar com "posso fazer X se você quiser" quando X está no mandato: faça e reporte.',
  '',
  'Persona instructions:',
  'Montar cardápios, calcular encomendas e conferir estoque antes de confirmar. Registrar o que decidiu e o que falta.',
  '',
].join('\n')

/** Characters per vendor token measured on the real pair (OPT-8b: +464 tokens for +1,152 characters). */
const CHARS_PER_VENDOR_TOKEN = 1152 / 464

const AFTER = workerPromptText(FIXTURE_NINA, true)

describe('the worker prompt lost its redundant text (OPT-10), measured dry', () => {
  it('the instructions of the fixture are the ones the frozen text has (so the comparison is like for like)', () => {
    expect(BEFORE).toContain(FIXTURE_NINA.instructions)
    expect(AFTER).toContain(FIXTURE_NINA.instructions)
    expect(AFTER.startsWith('Você é Nina, Padeira-chefe. Você executa a Tarefa autorizada.')).toBe(true)
  })

  it('is at least 89 vendor tokens shorter (calibrated on OPT-8b) and 54 tokens shorter by the ledger estimator', () => {
    const cutChars = BEFORE.length - AFTER.length
    const cutVendorTokens = cutChars / CHARS_PER_VENDOR_TOKEN
    const cutEstimated = estimateTokens(BEFORE) - estimateTokens(AFTER)
    expect(cutVendorTokens).toBeGreaterThanOrEqual(89)
    expect(cutEstimated).toBeGreaterThanOrEqual(54)
    // the absolute size is held too, so a later edit cannot give the cut back without a test noticing
    expect(AFTER.length).toBeLessThanOrEqual(1000)
  })

  it('the owner norms are written once, in one wording, and the template does not carry a second copy when the policy has them', () => {
    expect(AFTER.match(/Normas de dono/g)).toHaveLength(1)
    expect(AFTER).toContain(OWNER_NORMS)
    expect(OWNER_NORMS.includes('\n')).toBe(false)
    const bare = composePrompt({ part: 'worker', identity: { name: 'Nina', title: 'Padeira-chefe' }, policy: '' })
    expect(bare).toContain(OWNER_NORMS)
    expect(bare.match(/Normas de dono/g)).toHaveLength(1)
  })
})

describe('every rule the worker prompt carried is still in it', () => {
  // One entry per behaviour the old text asked for. A cut that drops one of these has removed a rule, not a repetition.
  const RULES: readonly (readonly [string, RegExp])[] = [
    ['stay inside the authorization', /Fique no escopo da autorização/u],
    ['report progress, block or result with the Persona tools when they exist', /Relate progresso, bloqueio ou resultado com as ferramentas da Persona quando disponíveis/u],
    ['do not talk in the channel: the coordination answers people', /Não fale no canal: a coordenação responde às pessoas/u],
    ['a text-only task: no tools, files, commands, records, directory or history; result and evidence in the final text', /só uma resposta em texto[^\n]*sem ferramentas, arquivos, comandos, registros, diretório de trabalho ou histórico; resultado e evidência no texto final/u],
    ['the text-only rule is conditional on the context being supplied', /com o contexto fornecido/u],
    ['before repeating an external operation, check the directory and the history', /Antes de repetir uma operação externa, confira o diretório de trabalho e o histórico/u],
    ['finish what the mandate asks and do not hand back what is yours', /termine o que o mandato pede, sem devolver o que cabe a você/u],
    ['verify the acceptance criterion', /verifique o critério de aceite/u],
    ['report with evidence (tests, files, commands, ids, paths)', /reporte com evidência \(teste, arquivo, comando, IDs, caminhos\)/u],
    ['propose the next step as a structured proposal', /proponha o próximo passo como proposta estruturada/u],
    ['never close with "posso fazer X se você quiser" when X is in the mandate: do it and report', /nunca encerre com "posso fazer X se você quiser" quando X está no mandato: faça e reporte/u],
  ]
  it.each(RULES)('%s', (_name, rule) => {
    expect(AFTER).toMatch(rule)
  })

  it('and the old text had every one of them (the list is a faithful inventory, not a wish)', () => {
    // The old wording differs, so check the idea in the old text with its own words.
    for (const old of [/Fique no escopo da autorização/u, /ferramentas da Persona quando disponíveis/u, /Não fale no canal/u, /apenas uma resposta em texto com contexto fornecido/u, /inspecione o diretório de trabalho e o histórico antes de repetir/u, /Termine o que o mandato pede/u, /Verifique o critério de aceite/u, /Reporte com evidência \(IDs, caminhos/u, /Proponha o próximo passo/u, /Proibido encerrar com "posso fazer X se você quiser"/u]) {
      expect(BEFORE).toMatch(old)
    }
  })
})

describe('the worker block stays fixed text (the prefix cache needs it)', () => {
  it('the template has no variable data: two different personas differ only in name, title and instructions', () => {
    const one = composePrompt({ part: 'worker', identity: { name: 'Nina', title: 'Padeira-chefe' }, policy: OWNER_NORMS })
    const other = composePrompt({ part: 'worker', identity: { name: 'Teo', title: 'Redator' }, policy: OWNER_NORMS })
    expect(one.replaceAll('Nina', 'Teo').replaceAll('Padeira-chefe', 'Redator')).toBe(other)
    expect(one).not.toMatch(/\d{2}:\d{2}|hoje|agora/u)
    expect(one).not.toContain('{{')
  })
})

describe('the worker prompt of a call WITHOUT tools drops the two sentences that point at tools (OPT-10 B)', () => {
  const TOOLLESS = workerPromptText(FIXTURE_NINA, true, false, true)

  it('is shorter again: A + B is at least 148 vendor tokens below the frozen text of before', () => {
    expect((BEFORE.length - TOOLLESS.length) / CHARS_PER_VENDOR_TOKEN).toBeGreaterThanOrEqual(148)
    expect(TOOLLESS.length).toBeLessThan(AFTER.length - 140)
  })

  it('leaves out exactly the tools clause and the external-operation check, and nothing else', () => {
    expect(AFTER).toContain('com as ferramentas da Persona quando disponíveis')
    expect(AFTER).toContain('Antes de repetir uma operação externa')
    expect(TOOLLESS).not.toContain('ferramentas da Persona')
    expect(TOOLLESS).not.toContain('operação externa')
    expect(TOOLLESS).toContain('Relate progresso, bloqueio ou resultado. Não fale no canal')
    // the other rules are all still there: scope, channel, the text-only rule, and the five owner norms
    for (const rule of [/Fique no escopo da autorização/u, /Não fale no canal/u, /só uma resposta em texto[^\n]*sem ferramentas, arquivos, comandos, registros/u, /termine o que o mandato pede/u, /verifique o critério de aceite/u, /reporte com evidência/u, /proponha o próximo passo/u, /nunca encerre com "posso fazer X se você quiser"/u]) {
      expect(TOOLLESS).toMatch(rule)
    }
    expect(TOOLLESS).not.toContain('{{')
  })

  it('a turn WITH tools keeps the full text, and unsure means full: only an explicit tools:none removes them', () => {
    const identity = { name: 'Nina', title: 'Padeira-chefe' }
    const full = composePrompt({ part: 'worker', identity, policy: OWNER_NORMS })
    expect(full).toContain('ferramentas da Persona quando disponíveis')
    expect(composePrompt({ part: 'worker', identity, policy: OWNER_NORMS, tools: 'none' })).not.toContain('ferramentas da Persona quando disponíveis')
    // the option belongs to the worker: the other parts are untouched
    expect(composePrompt({ part: 'talk', identity, policy: 'x', tools: 'none' })).toBe(composePrompt({ part: 'talk', identity, policy: 'x' }))
  })

  it('composeTurnPrompt: no tools offered (the answer-only route) = toolless worker; tools offered = full', () => {
    const fields = { identity: { name: 'Nina', title: 'Padeira-chefe' }, personality: 'Calorosa.', instructions: 'Montar cardápios.', functionLabel: 'Padeira-chefe', vault: '' }
    const none = composeTurnPrompt({ fields, part: 'worker', tools: [], required: '' })
    const some = composeTurnPrompt({ fields, part: 'worker', tools: ['persona_report'], required: '' })
    expect(none.text).not.toContain('ferramentas da Persona quando disponíveis')
    expect(some.text).toContain('ferramentas da Persona quando disponíveis')
    expect(none.text).toContain('Você executa a Tarefa autorizada.')
  })
})

describe('the mark that says a prompt is already a worker prompt', () => {
  it('is in the worker template and in no other part (the wrap of the runner decides by it)', () => {
    expect(PROMPT_TEMPLATES.worker).toContain(WORKER_PROMPT_MARK)
    for (const part of ['talk', 'coordinator', 'dispatch', 'replies', 'subscriptions', 'watchdog', 'handoff'] as const) {
      expect(PROMPT_TEMPLATES[part]).not.toContain(WORKER_PROMPT_MARK)
    }
  })
})
