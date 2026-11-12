import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Higiene de teste (Gauge 12/11, achado do Forge): o host com banco em memória (testes) guardava os perfis do navegador e os grants num caminho FIXO (`tmpdir/persona-browser-profiles`), o mesmo para
 * todo host de todo spec e de todos os workers: um grant deixado por um spec fazia account-swap-policy/team-offer tentarem abrir o Chrome de verdade. Agora cada host em memória recebe a sua pasta
 * (mkdtemp), apagada quando o processo sai. Nada é criado dentro do checkout.
 */
const made = new Set<string>()
let hooked = false

/** @returns Uma pasta nova e vazia para os perfis do navegador de UM host em memória. */
export function scratchBrowserRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'persona-browser-profiles-'))
  made.add(dir)
  if (!hooked) {
    hooked = true
    process.once('exit', () => {
      for (const path of made) {
        try { rmSync(path, { recursive: true, force: true }) } catch { /* pasta ainda em uso: o sistema limpa o tmp */ }
      }
    })
  }
  return dir
}

/**
 * A pasta de UM host em memória some junto com o host (o dispose do contexto): não espera o fim do processo. Uma pasta que não foi criada por {@link scratchBrowserRoot} (o dado de um
 * produto de verdade) nunca é tocada.
 * @param path - A pasta devolvida por {@link scratchBrowserRoot} (ou a pasta de dados de um host de verdade, que fica como está).
 */
export function dropScratchBrowserRoot(path: string): void {
  if (!made.delete(path)) return
  try { rmSync(path, { recursive: true, force: true }) } catch { /* ainda em uso: o fim do processo ou o sistema limpa */ }
}
