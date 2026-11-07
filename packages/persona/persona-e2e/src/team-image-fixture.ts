/**
 * A deterministic, dependency-free PNG for the TEAM-10 real round ("opinando sobre uma imagem de verdade"): a flat "promotion poster" the model can
 * describe from its shapes and colors — a red circle on a blue field, a yellow band at the bottom, two white bars (the "text lines"). No
 * personal data, no network, byte-identical on every run, a few KB.
 */
import { deflateSync } from 'node:zlib'

export const POSTER_WIDTH = 640
export const POSTER_HEIGHT = 400
/** What the persona writes as the image's `alt` (EQUIPE-REAL-SPEC: "o `alt` escrito pela persona"). */
export const POSTER_ALT = 'Cartaz de promoção: círculo vermelho sobre fundo azul, faixa amarela embaixo e duas linhas brancas de texto.'
/** What an honest description of the poster should mention (the round checks that at least one persona names two of them). */
export const POSTER_FACTS = ['vermelho', 'azul', 'amarel', 'círculo', 'circulo', 'faixa'] as const

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

type Rgb = readonly [number, number, number]
const BLUE: Rgb = [30, 64, 175]
const RED: Rgb = [220, 38, 38]
const YELLOW: Rgb = [250, 204, 21]
const WHITE: Rgb = [255, 255, 255]

function pixelAt(x: number, y: number): Rgb {
  if (y >= 320) return YELLOW
  if ((x - 320) ** 2 + (y - 130) ** 2 <= 80 ** 2) return RED
  if (y >= 232 && y < 248 && x >= 140 && x < 500) return WHITE
  if (y >= 262 && y < 274 && x >= 190 && x < 450) return WHITE
  return BLUE
}

/** @returns The poster as a PNG (8-bit RGB). */
export function buildPosterPng(): Buffer {
  const rows: Buffer[] = []
  for (let y = 0; y < POSTER_HEIGHT; y += 1) {
    const row = Buffer.alloc(1 + POSTER_WIDTH * 3) // filter byte 0 + RGB
    for (let x = 0; x < POSTER_WIDTH; x += 1) {
      const [r, g, b] = pixelAt(x, y)
      row[1 + x * 3] = r
      row[2 + x * 3] = g
      row[3 + x * 3] = b
    }
    rows.push(row)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(POSTER_WIDTH, 0)
  header.writeUInt32BE(POSTER_HEIGHT, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}
