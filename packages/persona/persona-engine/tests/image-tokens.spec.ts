import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { IMAGE_CACHE_WRITE_FACTOR, IMAGE_COST_MEASURED, IMAGE_MAX_EDGE, IMAGE_TOKENS_MAX, IMAGE_TOKENS_UNKNOWN, imageSizeOf, imageTokens } from '../src/ux/image-tokens.ts'

function pngOf(width: number, height: number): Uint8Array {
  const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  const header = [...u32(width), ...u32(height), 8, 2, 0, 0, 0]
  const chunk = (type: string, data: number[]): number[] => [...u32(data.length), ...Array.from(type, c => c.charCodeAt(0)), ...data, 0, 0, 0, 0]
  const idat = Array.from(deflateSync(Buffer.from([0])))
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', header), ...chunk('IDAT', idat), ...chunk('IEND', [])])
}

const ascii = (text: string): number[] => Array.from(text, c => c.charCodeAt(0))

describe('imageSizeOf: the size from the first bytes, no image library', () => {
  it('PNG', () => {
    expect(imageSizeOf(pngOf(48, 32))).toEqual({ width: 48, height: 32 })
    expect(imageSizeOf(pngOf(4000, 3000))).toEqual({ width: 4000, height: 3000 })
  })

  it('GIF', () => {
    expect(imageSizeOf(Uint8Array.from([...ascii('GIF89a'), 0x40, 0x01, 0xf0, 0x00, 0, 0]))).toEqual({ width: 320, height: 240 })
  })

  it('JPEG: skips other segments, reads the Start Of Frame', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 14 }, () => 0)]
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
    expect(imageSizeOf(Uint8Array.from([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]))).toEqual({ width: 640, height: 480 })
    // a progressive frame (SOF2) too; DHT (0xC4) is not a frame
    const dht = [0xff, 0xc4, 0x00, 0x04, 0, 0]
    const sof2 = [0xff, 0xc2, 0x00, 0x11, 8, 0x00, 0x64, 0x00, 0xc8, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
    expect(imageSizeOf(Uint8Array.from([0xff, 0xd8, ...dht, ...sof2]))).toEqual({ width: 200, height: 100 })
  })

  it('WebP: lossy, lossless and extended', () => {
    const riff = (kind: string, body: number[]): number[] => [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(kind), 0, 0, 0, 0, ...body]
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00])
    expect(imageSizeOf(Uint8Array.from([...lossy, 0, 0, 0, 0]))).toEqual({ width: 320, height: 240 })
    // lossless: 14 bits width-1, 14 bits height-1 after the 0x2f signature
    const bits = (639 & 0x3fff) | ((479 & 0x3fff) << 14)
    const lossless = riff('VP8L', [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255])
    expect(imageSizeOf(Uint8Array.from([...lossless, 0, 0, 0, 0, 0, 0]))).toEqual({ width: 640, height: 480 })
    const extended = riff('VP8X', [0, 0, 0, 0, 0x7f, 0x02, 0x00, 0xdf, 0x01, 0x00])
    expect(imageSizeOf(Uint8Array.from([...extended, 0, 0, 0, 0, 0, 0]))).toEqual({ width: 640, height: 480 })
  })

  it('anything else, cut-short bytes and absurd sizes give undefined, never a guess', () => {
    expect(imageSizeOf(Uint8Array.from([]))).toBeUndefined()
    expect(imageSizeOf(Uint8Array.from(ascii('not an image at all, just text bytes here')))).toBeUndefined()
    expect(imageSizeOf(pngOf(48, 32).subarray(0, 20))).toBeUndefined()
    expect(imageSizeOf(pngOf(0, 10))).toBeUndefined()
    expect(imageSizeOf(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeUndefined()
  })
})

describe('imageTokens: a range from the public rule, wide when the size is unknown', () => {
  it('a small image costs about width × height ÷ 750', () => {
    const range = imageTokens({ width: 750, height: 400 })
    expect(range.min).toBeLessThanOrEqual(400)
    expect(range.max).toBeGreaterThanOrEqual(400)
    expect(range.max - range.min).toBeLessThan(100)
  })

  it('a big image is scaled down first, and never passes the cap', () => {
    const big = imageTokens({ width: 4000, height: 3000 })
    expect(big.max).toBeLessThanOrEqual(IMAGE_TOKENS_MAX)
    expect(big.min).toBeGreaterThan(1000)
    // same picture at 2× the pixels costs the same once it is over the vendor's size limit
    expect(imageTokens({ width: 8000, height: 6000 })).toEqual(big)
    expect(IMAGE_MAX_EDGE).toBe(1568)
  })

  it('unknown or invalid sizes give the wide range', () => {
    expect(imageTokens()).toEqual(IMAGE_TOKENS_UNKNOWN)
    expect(imageTokens({ width: 0, height: 10 })).toEqual(IMAGE_TOKENS_UNKNOWN)
    expect(imageTokens({ width: Number.NaN, height: 10 })).toEqual(IMAGE_TOKENS_UNKNOWN)
  })

  it('a tiny image is at least 1 token and the range is ordered', () => {
    const tiny = imageTokens({ width: 1, height: 1 })
    expect(tiny.min).toBeGreaterThanOrEqual(1)
    expect(tiny.max).toBeGreaterThanOrEqual(tiny.min)
  })
})

describe('imageTokens is calibrated by the ONE real measurement (reports/image-cost-real.md)', () => {
  it('a 1500×1000 image is the 2,018 tokens the vendor reported, and the range brackets it', () => {
    const range = imageTokens({ width: 1500, height: 1000 })
    expect(IMAGE_COST_MEASURED).toMatchObject({ width: 1500, height: 1000, tokens: 2018 })
    expect(range).toEqual({ min: 1816, max: 2220 })
    expect(range.min).toBeLessThanOrEqual(2018)
    expect(range.max).toBeGreaterThanOrEqual(2018)
  })

  it('no extra "megapixel cut": the old rule predicted at most ~1,600 for this image and was wrong', () => {
    expect(imageTokens({ width: 1500, height: 1000 }).min).toBeGreaterThan(1600)
    // only the long-edge limit (1568 px) scales an image down: 4000×3000 → 1568×1176
    const big = imageTokens({ width: 4000, height: 3000 })
    expect(big).toEqual(imageTokens({ width: 1568, height: 1176 }))
    expect(big.min).toBeGreaterThan(2000)
  })

  it('the largest image the vendor keeps (1568×1568) is the ceiling, never above IMAGE_TOKENS_MAX', () => {
    const largest = imageTokens({ width: 1568, height: 1568 })
    expect(largest.max).toBeLessThanOrEqual(IMAGE_TOKENS_MAX)
    expect(largest.min).toBeGreaterThan(2900)
    expect(imageTokens({ width: 20_000, height: 20_000 })).toEqual(largest)
  })

  it('an image goes to the cache: it is billed at the cache-WRITE price (measured)', () => {
    expect(IMAGE_CACHE_WRITE_FACTOR).toBe(1.25)
  })
})
