import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { PathEscapeError, confineAbsolute, confinePath, confineSegment } from '../src/index.ts'

it('confineSegment recusa vazio, ponto, absoluto e separador', () => {
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'C:\\x', '\0x']) {
    expect(() => confineSegment(bad), bad).toThrow(PathEscapeError)
  }
  expect(confineSegment('tick-1')).toBe('tick-1')
})

it('confinePath recusa NUL, vazio, absoluto e ..; admite relativo interno', () => {
  const root = join(tmpdir(), 'persona-confine-ok')
  mkdirSync(root, { recursive: true })
  expect(() => confinePath(root, '')).toThrow(PathEscapeError)
  expect(() => confinePath(root, '\0secret')).toThrow(PathEscapeError)
  expect(() => confinePath(root, join(root, 'x'))).toThrow(PathEscapeError)
  expect(confinePath(root, 'src/app.ts').startsWith(root)).toBe(true)
  const inside = confinePath(root, 'keep.txt')
  writeFileSync(inside, 'ok')
  expect(confinePath(root, 'keep.txt')).toBe(inside)
})

it('confineAbsolute só admite destino já absoluto sob o root', () => {
  const root = join(tmpdir(), 'persona-confine-abs')
  mkdirSync(root, { recursive: true })
  const dest = join(root, 'nested', 'file.ts')
  expect(() => confineAbsolute(root, 'nested/file.ts')).toThrow(PathEscapeError)
  expect(() => confineAbsolute(root, '\0C:\\x')).toThrow(PathEscapeError)
  expect(() => confineAbsolute(root, join(root, '..', 'outside'))).toThrow(PathEscapeError)
  expect(confineAbsolute(root, dest)).toBe(dest)
})
