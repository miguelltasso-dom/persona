// CV-9 (Muse 07/11, lote 1 da galeria): o cabeçalho do balão saía "Nina· Pesquisa · 12:43" (sem o espaço antes do "·"). O `.meta` do balão é flex com gap 0 e o espaço
// INICIAL do item `.metaSoft` (" · Pesquisa") é descartado pela colapsagem de espaços do item flex. O texto está certo ('Nina · Pesquisa · 14:05' em message-bubbles.client.spec);
// o que faltava era o espaço VISUAL. jsdom não tem layout, então este teste fixa as duas regras de CSS que o devolvem.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const chatDir = fileURLToPath(new URL('../src/client/chat/', import.meta.url))
const css = readFileSync(`${chatDir}GeneralChannelView.module.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

describe('o cabeçalho do balão: "Nome · função · hora"', () => {
  it('o .meta do balão é flex com gap 0 (é por isso que o espaço inicial do item some)', () => {
    expect(css).toMatch(/\.bubbleRow \.meta\s*\{[^}]*display:\s*flex[^}]*gap:\s*0\b/u)
  })

  it('a parte suave (" · função · hora") tem a margem que devolve o espaço entre o nome e o "·"', () => {
    expect(css).toMatch(/\.bubbleRow \.metaSoft\s*\{[^}]*margin-inline-start:\s*0\.3em/u)
  })
})
