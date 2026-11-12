// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountList, AccountPolicyPicker, AccountRow, MenuButton, Notice, RecordingPill, TeachStepCard, TeachStepList, formatElapsed } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

const ROW_LABELS = { fiveHour: '5h', week: 'Semana', quotaUnavailable: 'Sem estimativa ainda', usedBy: 'Em uso por', menu: 'Mais ações para Claude · Pessoal', inUse: 'Em uso agora' }

describe('AccountRow / AccountPolicyPicker / Notice (WAVE2-SPEC c)', () => {
  it('shows one state + one action, honest "no estimate", who uses it', () => {
    const login = vi.fn()
    render(<AccountList label="Contas Claude"><AccountRow label="Trabalho" providerName="Claude" state="login" stateText="Precisa entrar" action={{ label: 'Entrar', onClick: login }} labels={ROW_LABELS} usedBy={[{ name: 'Nina' }, { name: 'Bento' }]} /></AccountList>)
    expect(screen.getByText('Sem estimativa ainda')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('img', { name: 'Em uso por: Nina, Bento' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(login).toHaveBeenCalled()
  })

  it('renders official meters when the provider reports them', () => {
    render(<AccountList label="Contas"><AccountRow label="Pessoal" providerName="Claude" state="limit" stateText="No limite até 18:30" quota={{ fiveHourPct: 100, weekPct: 40 }} labels={ROW_LABELS} inUse /></AccountList>)
    expect(screen.getByRole('progressbar', { name: '5h' }).getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByText('Em uso agora')).toBeTruthy()
  })

  it('policy is an explicit radio choice, without a recommended badge (regra 0.1 da Muse)', () => {
    const onChange = vi.fn()
    const copy = {
      fixed: { title: 'Ficar na mesma conta', body: 'Espera a cota voltar.' },
      next_on_limit: { title: 'Passar para a próxima', body: 'Usa Trabalho no limite.' },
      split_balance: { title: 'Dividir o uso', body: 'Alterna entre as contas.' },
      ask: { title: 'Perguntar antes de trocar', body: 'Aparece em Precisa de você.' },
    }
    render(<AccountPolicyPicker legend="Quando uma conta chega ao limite" name="p" value="fixed" onChange={onChange} copy={copy} />)
    expect(screen.getByRole('group', { name: 'Quando uma conta chega ao limite' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: /Ficar na mesma conta/u }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByText('Recomendado')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Perguntar antes de trocar/u }))
    expect(onChange).toHaveBeenCalledWith('ask')
  })

  it('Notice is a note with text', () => {
    render(<Notice>Cada provedor tem termos próprios.</Notice>)
    expect(screen.getByRole('note').textContent).toContain('termos próprios')
  })
})

describe('MenuButton', () => {
  it('opens, moves with arrows and closes with Esc returning focus', () => {
    const pick = vi.fn()
    render(<MenuButton label="Mais ações" items={[{ id: 'a', label: 'Renomear', onSelect: pick }, { id: 'b', label: 'Arquivar', onSelect: () => undefined }]} />)
    const button = screen.getByRole('button', { name: 'Mais ações' })
    fireEvent.click(button)
    const menu = screen.getByRole('menu', { name: 'Mais ações' })
    expect(document.activeElement?.textContent).toBe('Renomear')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('Arquivar')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

describe('Teach primitives (WAVE2-SPEC b)', () => {
  const labels = { recording: 'Gravando', paused: 'Pausado', pause: 'Pausar', resume: 'Continuar', stop: 'Parar', micOn: 'Microfone ligado', micOff: 'Microfone desligado', region: 'Gravação em andamento' }

  it('pill: timer, pause/resume, stop; paused state is spoken', () => {
    const onPause = vi.fn()
    const onStop = vi.fn()
    const { rerender } = render(<RecordingPill state="recording" watchingText="Nina está olhando" personaName="Nina" elapsedSec={65} labels={labels} onPause={onPause} onResume={() => undefined} onStop={onStop} />)
    expect(screen.getByText('1:05')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Parar' }))
    expect(onPause).toHaveBeenCalled()
    expect(onStop).toHaveBeenCalled()
    rerender(<RecordingPill state="paused" watchingText="Nina está olhando" personaName="Nina" elapsedSec={65} labels={labels} onPause={onPause} onResume={() => undefined} onStop={onStop} />)
    expect(screen.getByRole('status').textContent).toContain('Pausado')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy()
    expect(formatElapsed(600)).toBe('10:00')
  })

  it('step card: editable instruction, reorder bounds, remove', () => {
    const onChange = vi.fn()
    const onMove = vi.fn()
    const stepLabels = { step: 'Passo 1', instruction: 'O que fazer', check: 'O que conferir', moveUp: 'Subir', moveDown: 'Descer', remove: 'Remover passo', blur: 'Borrar parte', enlarge: 'Ampliar', noThumbnail: 'Sem imagem' }
    render(<TeachStepList label="Passos"><TeachStepCard order={1} total={3} instruction="Abra Aprovações" onInstructionChange={onChange} onMove={onMove} onRemove={() => undefined} labels={stepLabels} /></TeachStepList>)
    fireEvent.change(screen.getByLabelText('O que fazer'), { target: { value: 'Abra o painel' } })
    expect(onChange).toHaveBeenCalledWith('Abra o painel')
    expect((screen.getByRole('button', { name: 'Subir' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Descer' }))
    expect(onMove).toHaveBeenCalledWith(1)
    expect(screen.getByText('Sem imagem')).toBeTruthy()
  })
})
