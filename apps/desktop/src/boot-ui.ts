/** Static startup UI independent of the application plugin bundle. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Reserved same-origin location of the packaged startup assets. */
export const BOOT_UI_PATH = '/__persona-boot-ui__/'

/**
 * Attach the isolated startup UI before the application root is parsed.
 * @param html - Packaged application document.
 * @param renderer - Desktop renderer directory containing persona-boot.
 * @param firstRun - Whether the local database has not been created yet.
 * @param language - Shell locale.
 * @returns Document with static startup markup and an external script.
 */
export async function attachBootUi(html: string, renderer: string, firstRun: boolean, language: string): Promise<string> {
  const markup = await readFile(join(renderer, 'persona-boot', 'boot.html'), 'utf8')
  const params = new URLSearchParams({ first: firstRun ? '1' : '0', lang: language })
  return html.replace('<head>', `<head><link rel="stylesheet" href="${BOOT_UI_PATH}boot-fonts.css">`)
    .replace('<div id="root">', '<div id="root" hidden inert aria-hidden="true">')
    .replace('<body>', `<body>${markup}<script defer src="${BOOT_UI_PATH}boot.js?${params.toString().replaceAll('&', '&amp;')}"></script>`)
}
