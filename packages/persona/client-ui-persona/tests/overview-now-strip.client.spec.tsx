// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OverviewNowStrip } from '../src/client/overview/OverviewNowStrip.tsx'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { WORK_STATUS_KEY, type PersonaNowSnapshot } from '../src/client/team/persona-work-state.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

const t = (key: string, params?: Readonly<Record<string, string>>): string => {
  let text: string = shellPt[key as keyof typeof shellPt] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, value)
  }
  return text
}

describe('OverviewNowStrip (PRO-4 honest states, DESIGN-01 #09)', () => {
  it('shows distinct state chips for who is busy, and folds the available into one "prontos" line', () => {
    const rows: readonly PersonaNowSnapshot[] = [
      { member: { id: 'sol', name: 'Sol', role: 'Engenharia', state: 'working' }, queueCount: 2, currentTask: 'API v2' },
      { member: { id: 'luna', name: 'Luna', role: 'Pesquisa', state: 'resting' }, queueCount: 0 },
      { member: { id: 'nina', name: 'Nina', role: 'Design', state: 'stuck' }, queueCount: 1, currentTask: 'Landing' },
    ]
    render(<OverviewNowStrip t={t as never} rows={rows} />)
    expect(screen.getByText('API v2')).toBeTruthy()
    expect(screen.getByText(t(WORK_STATUS_KEY.working))).toBeTruthy()
    expect(screen.getByText(t(WORK_STATUS_KEY.stuck))).toBeTruthy()
    expect(screen.getByText(t('overview.nowQueue', { count: '2' }))).toBeTruthy()
    // the idle persona has no card of her own: no "Sem tarefa agora" / "Fila vazia" / "Descansando" for her
    expect(screen.getByText('1 pronto para começar')).toBeTruthy()
    expect(screen.queryByText(t('overview.nowNoTask'))).toBeNull()
    expect(screen.queryByText(t(WORK_STATUS_KEY.resting))).toBeNull()
  })
})
