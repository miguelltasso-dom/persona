// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'

installPreviewTheme()

const t = (key: string) => shellPt[key as keyof typeof shellPt] ?? key

describe('OverviewView suggested task (C8 / PRO-4)', () => {
  afterEach(() => { cleanup() })
  it('shows live task title when host suggests one and team has no active task', () => {
    render(
      <OverviewView
        t={t}
        attentionItems={[]}
        nowRows={[{ member: { id: 'atlas', name: 'Coord', role: 'Coordenação', state: 'resting' }, queueCount: 0 }]}
        awayEvents={[]}
        suggestedTask={{ id: 't1', title: 'Revisar contrato de rescisão' }}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Revisar contrato de rescisão' })).toBeTruthy()
  })

  it('hides nudge when a persona has an active task', () => {
    render(
      <OverviewView
        t={t}
        attentionItems={[]}
        nowRows={[{ member: { id: 'sol', name: 'A', role: 'R', state: 'working' }, queueCount: 0, currentTask: 'API' }]}
        awayEvents={[]}
      />,
    )
    expect(screen.queryByText(shellPt['overview.suggestedTaskTitle'])).toBeNull()
  })
})
