/** Host quota `limitedUntil` is ISO; card copy expects a short local time (Muse PERSONA-CARD-SPEC). */
export function formatCardQuotaLimitedUntil(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
