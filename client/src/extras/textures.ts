/**
 * textures.ts — draws the 12 camo textures once (seamless 256px canvases)
 * and exposes each as a CSS custom property `--grove-tex-camo-<id>`.
 * Called when Extras first turns on.
 */

const SIZE = 256
let drawn = false

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Ctx = CanvasRenderingContext2D

/** Draw at every wrapped offset so shapes crossing an edge tile seamlessly. */
function wrapped(_ctx: Ctx, draw: (dx: number, dy: number) => void) {
  for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) draw(dx, dy)
}

function blob(ctx: Ctx, cx: number, cy: number, r: number, color: string, rand: () => number, stretch = 1) {
  const k = 9
  const pts = Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2
    const rr = r * (0.55 + rand() * 0.7)
    return [Math.cos(a) * rr * stretch, Math.sin(a) * rr]
  })
  wrapped(ctx, (dx, dy) => {
    ctx.beginPath()
    const mid = (i: number) => {
      const a = pts[i % k]
      const b = pts[(i + 1) % k]
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    }
    const m0 = mid(0)
    ctx.moveTo(cx + dx + m0[0], cy + dy + m0[1])
    for (let i = 1; i <= k; i++) {
      const p = pts[i % k]
      const m = mid(i)
      ctx.quadraticCurveTo(cx + dx + p[0], cy + dy + p[1], cx + dx + m[0], cy + dy + m[1])
    }
    ctx.fillStyle = color
    ctx.fill()
  })
}

function blobCamo(ctx: Ctx, seed: number, colors: string[], sizes: number[], counts: number[], stretch = 1) {
  const rand = rng(seed)
  ctx.fillStyle = colors[0]
  ctx.fillRect(0, 0, SIZE, SIZE)
  colors.slice(1).forEach((c, i) => {
    for (let n = 0; n < counts[i]; n++) blob(ctx, rand() * SIZE, rand() * SIZE, sizes[i] * (0.7 + rand() * 0.6), c, rand, stretch)
  })
}

function digital(ctx: Ctx, seed: number, colors: string[]) {
  const rand = rng(seed)
  const cell = 8
  const n = SIZE / cell
  const grid: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  colors.slice(1).forEach((_, ci) => {
    for (let w = 0; w < 26; w++) {
      let x = Math.floor(rand() * n)
      let y = Math.floor(rand() * n)
      for (let s = 0; s < 22; s++) {
        grid[y][x] = ci + 1
        if (rand() < 0.5) grid[(y + 1) % n][x] = ci + 1
        x = (x + (rand() < 0.5 ? 1 : n - 1)) % n
        y = (y + (rand() < 0.6 ? 0 : rand() < 0.5 ? 1 : n - 1)) % n
      }
    }
  })
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    ctx.fillStyle = colors[grid[y][x]]
    ctx.fillRect(x * cell, y * cell, cell, cell)
  }
}

function tiger(ctx: Ctx, seed: number, base: string, mid: string, dark: string) {
  const rand = rng(seed)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (const [color, count, thick] of [[mid, 9, 12], [dark, 11, 7]] as const) {
    for (let i = 0; i < count; i++) {
      const y0 = rand() * SIZE
      const len = 90 + rand() * 120
      const x0 = rand() * SIZE
      const amp = 6 + rand() * 10
      const ph = rand() * Math.PI * 2
      wrapped(ctx, (dx, dy) => {
        ctx.beginPath()
        for (let s = 0; s <= 24; s++) {
          const t = s / 24
          const x = x0 + dx + t * len
          const w = thick * Math.sin(Math.PI * t) + 1
          const y = y0 + dy + Math.sin(ph + t * 5) * amp - w / 2
          if (s === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        for (let s = 24; s >= 0; s--) {
          const t = s / 24
          const x = x0 + dx + t * len
          const w = thick * Math.sin(Math.PI * t) + 1
          const y = y0 + dy + Math.sin(ph + t * 5) * amp + w / 2
          ctx.lineTo(x, y)
        }
        ctx.fillStyle = color
        ctx.fill()
      })
    }
  }
}

function metal(ctx: Ctx, seed: number, a: string, b: string, c: string, light: string) {
  blobCamo(ctx, seed, [a, b, c], [46, 30], [10, 14])
  // Seamless sheen: periodic diagonal bands.
  const img = ctx.getImageData(0, 0, SIZE, SIZE)
  const lc = parseInt(light.slice(1), 16)
  const [lr, lg, lb] = [(lc >> 16) & 255, (lc >> 8) & 255, lc & 255]
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const v = 0.5 + 0.5 * Math.sin(((x + y) / SIZE) * Math.PI * 2 * 3)
    const k = Math.pow(v, 6) * 0.38
    const i = (y * SIZE + x) * 4
    img.data[i] += (lr - img.data[i]) * k
    img.data[i + 1] += (lg - img.data[i + 1]) * k
    img.data[i + 2] += (lb - img.data[i + 2]) * k
  }
  ctx.putImageData(img, 0, 0)
}

function damascus(ctx: Ctx) {
  const img = ctx.createImageData(SIZE, SIZE)
  const T = (n: number) => (n / SIZE) * Math.PI * 2
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const warp = Math.sin(T(x) * 2) * 2.2 + Math.sin(T(y) * 3 + T(x)) * 1.4 + Math.cos(T(x) * 1 - T(y) * 2) * 1.1
    const v = 0.5 + 0.5 * Math.sin(T(y) * 9 + warp * 2)
    const g = 70 + v * 120
    const i = (y * SIZE + x) * 4
    img.data[i] = g * 0.92
    img.data[i + 1] = g * 0.96
    img.data[i + 2] = g * 1.04
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

function obsidian(ctx: Ctx, seed: number) {
  const rand = rng(seed)
  ctx.fillStyle = '#0c0912'
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 26; i++) {
    const cx = rand() * SIZE
    const cy = rand() * SIZE
    const r = 18 + rand() * 40
    const sides = 3 + Math.floor(rand() * 3)
    const rot = rand() * Math.PI
    const shade = Math.floor(14 + rand() * 30)
    const tint = rand() < 0.3
    // Points are fixed before wrapping, so every copy is the same shape.
    const pts = Array.from({ length: sides }, (_, s) => {
      const a = rot + (s / sides) * Math.PI * 2
      const rr = r * (0.6 + rand() * 0.5)
      return [Math.cos(a) * rr, Math.sin(a) * rr]
    })
    wrapped(ctx, (dx, dy) => {
      ctx.beginPath()
      pts.forEach(([px, py], s) => (s === 0 ? ctx.moveTo(cx + dx + px, cy + dy + py) : ctx.lineTo(cx + dx + px, cy + dy + py)))
      ctx.closePath()
      ctx.fillStyle = tint ? `rgba(${shade + 60},${shade + 20},${shade + 110},0.55)` : `rgba(${shade},${shade},${shade + 12},0.85)`
      ctx.fill()
      ctx.strokeStyle = 'rgba(190,160,255,0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
    })
  }
}

const RECIPES: Record<string, (ctx: Ctx) => void> = {
  desert: (c) => blobCamo(c, 11, ['#d8bf8a', '#b8955c', '#8c6a3e', '#e8d7ae'], [40, 30, 18], [9, 10, 12]),
  arctic: (c) => blobCamo(c, 23, ['#e6eef2', '#b9cbd6', '#8ea4b3', '#ffffff'], [42, 30, 16], [9, 10, 10]),
  woodland: (c) => blobCamo(c, 37, ['#4f6a2e', '#2f3f1c', '#7a5a34', '#151a10'], [44, 34, 20], [8, 9, 12]),
  digital: (c) => digital(c, 41, ['#7c9585', '#55705e', '#3a4e40', '#a7b8a2']),
  urban: (c) => blobCamo(c, 53, ['#8b9096', '#5e646b', '#b7bcc1', '#2e3236'], [42, 30, 18], [9, 10, 11]),
  bluetiger: (c) => tiger(c, 67, '#4f86e8', '#2a4fa8', '#0f1e45'),
  redtiger: (c) => tiger(c, 71, '#d65a3c', '#962c1d', '#3a0d08'),
  fall: (c) => blobCamo(c, 83, ['#d2772e', '#9c4a1c', '#e8b04a', '#5a2a12'], [40, 30, 18], [9, 10, 12], 1.4),
  gold: (c) => metal(c, 97, '#d9a22b', '#f2c94c', '#a8761b', '#fff3c4'),
  platinum: (c) => metal(c, 101, '#cfd6de', '#eef2f6', '#9aa4ae', '#ffffff'),
  damascus: (c) => damascus(c),
  obsidian: (c) => obsidian(c, 113),
}

export function drawTextures() {
  if (drawn) return
  drawn = true
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const root = document.documentElement.style
  for (const [id, draw] of Object.entries(RECIPES)) {
    ctx.clearRect(0, 0, SIZE, SIZE)
    draw(ctx)
    root.setProperty(`--grove-tex-camo-${id}`, `url("${canvas.toDataURL('image/png')}")`)
  }
}
