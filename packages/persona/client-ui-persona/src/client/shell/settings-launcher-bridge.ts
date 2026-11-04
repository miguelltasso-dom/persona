/**
 * Ponte para abrir o modal de configurações do DSW (versão, avisos de terceiros, atualização do app) a partir do
 * nosso lugar "Configurações › Sobre e atualizações".
 *
 * O DSW entrega `openSettings` ao slot `settings.launcher`; quem registra esse slot (rodapé do rail) chama
 * {@link setOpenSettings} ao montar e `null` ao desmontar. A aba só chama {@link openSettingsModal}.
 */

let openSettings: (() => void) | null = null

/** Quem monta o `settings.launcher` entrega aqui o `openSettings` do DSW (e `null` ao desmontar). */
export function setOpenSettings(fn: (() => void) | null): void {
  openSettings = fn
}

/** Há um launcher montado que sabe abrir o modal? A aba usa isto para desabilitar o botão com o porquê. */
export function canOpenSettingsModal(): boolean {
  return openSettings !== null
}

/** Abre o modal do DSW; `false` se não houver launcher (o Ctrl+, continua valendo). */
export function openSettingsModal(): boolean {
  if (openSettings === null) return false
  openSettings()
  return true
}
