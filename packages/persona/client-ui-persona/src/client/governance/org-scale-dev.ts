/** Dev/gallery override: `localStorage.setItem('persona.orgChartScaleSeed', '60'|'150')`. */

export const ORG_CHART_SCALE_SEED_KEY = 'persona.orgChartScaleSeed'
const KEY = ORG_CHART_SCALE_SEED_KEY

export function readOrgChartScaleSeed(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(KEY)?.trim()
  if (raw === undefined || raw === '') return null
  const n = Number.parseInt(raw, 10)
  if (n === 60 || n === 150) return n
  return null
}
