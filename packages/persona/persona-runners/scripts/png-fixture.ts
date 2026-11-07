/**
 * A valid PNG built by hand (no image library, no fixture file) for the scripts that need a real image of a chosen size.
 * Bands of colour from top to bottom, so a model asked to describe it has something to say; the size is what the token cost depends on.
 */

import { deflateSync } from 'node:zlib'

const CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc(body))
  return Buffer.concat([head, body, tail])
}

/**
 * @param width - Pixels.
 * @param height - Pixels.
 * @param bands - Colours from the top; each takes an equal share of the height (a single colour is a solid image).
 */
export function bandedPng(width: number, height: number, bands: readonly (readonly [number, number, number])[]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour
  const rows: Buffer[] = []
  for (let y = 0; y < height; y += 1) {
    const colour = bands[Math.min(bands.length - 1, Math.floor((y * bands.length) / height))] ?? [0, 0, 0]
    rows.push(Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [...colour]).flat())]))
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
