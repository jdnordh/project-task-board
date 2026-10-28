/**
 * fx.ts — feature-completion animations. A copy of the row animates in a
 * fixed layer on <body> (so the scroll area can't clip it) while the real
 * row hides and folds away. Sequencing uses timers only.
 */

import { pickFx } from './lib'

let lastFx: string | null = null

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const CONFETTI = ['#4ade80', '#f5c542', '#45d3bb', '#f0876a', '#b68cff', '#38e1ff', '#ff5c72']

function layer(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:120;overflow:visible'
  document.body.appendChild(el)
  return el
}

function particle(host: HTMLElement, x: number, y: number, color: string, size: number, round = false) {
  const p = document.createElement('i')
  p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${round ? size : size * 0.45}px;background:${color};border-radius:${round ? '50%' : '2px'};will-change:transform,opacity`
  host.appendChild(p)
  return p
}

function burst(host: HTMLElement, x: number, y: number, n: number, spread: number, dur: number, round = false, delay = 0) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4
    const d = spread * (0.5 + Math.random() * 0.6)
    const p = particle(host, x, y, CONFETTI[i % CONFETTI.length], round ? 5 : 9, round)
    p.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + (round ? 30 : 90)}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: dur, delay, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'both' })
  }
}

const PLAY: Record<string, (clone: HTMLElement, host: HTMLElement, r: DOMRect, ms: number) => void> = {
  swipe(clone, _h, _r, ms) {
    clone.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(70%)', opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' })
  },
  confetti(clone, host, r, ms) {
    clone.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.15 }, { transform: 'scale(.9)', opacity: 0 }], { duration: ms * 0.6, fill: 'forwards' })
    burst(host, r.left + r.width / 2, r.top + r.height / 2, 46, Math.max(260, r.width * 0.7), ms * 0.9)
  },
  rocket(clone, host, r, ms) {
    clone.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(-2px,1px)', offset: 0.08 }, { transform: 'translate(2px,-1px)', offset: 0.16 },
      { transform: 'translate(-2px,0)', offset: 0.24 }, { transform: 'translate(0,0)', offset: 0.3 },
      { transform: `translate(0,-${r.bottom + 120}px) scaleY(1.15)`, opacity: 0.2 },
    ], { duration: ms, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards' })
    for (let i = 0; i < 18; i++) {
      const p = particle(host, r.left + r.width / 2 + (Math.random() - 0.5) * r.width * 0.5, r.bottom, i % 2 ? '#f5c542' : '#f0876a', 8, true)
      p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: `translate(${(Math.random() - 0.5) * 60}px, ${40 + Math.random() * 60}px) scale(.2)`, opacity: 0 }],
        { duration: ms * 0.5, delay: ms * 0.3 + i * 18, fill: 'both' })
    }
  },
  shatter(clone, host, _r, ms) {
    clone.style.opacity = '0'
    const cols = 6
    const rows = 3
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const shard = clone.cloneNode(true) as HTMLElement
        shard.style.opacity = '1'
        shard.style.clipPath = `inset(${(y / rows) * 100}% ${100 - ((x + 1) / cols) * 100}% ${100 - ((y + 1) / rows) * 100}% ${(x / cols) * 100}%)`
        host.appendChild(shard)
        const dx = (x - cols / 2 + 0.5) * 30 + (Math.random() - 0.5) * 40
        shard.animate([
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: 'translate(0,0) rotate(0)', opacity: 1, offset: 0.12 },
          { transform: `translate(${dx}px, ${220 + Math.random() * 220}px) rotate(${(Math.random() - 0.5) * 90}deg)`, opacity: 0 },
        ], { duration: ms, delay: Math.random() * 120, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'both' })
      }
    }
  },
  blackhole(clone, host, r, ms) {
    const hole = document.createElement('i')
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    hole.style.cssText = `position:fixed;left:${cx - 30}px;top:${cy - 30}px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,#000 45%,#2b1a55 62%,transparent 72%);box-shadow:0 0 40px 12px rgba(120,80,255,.45)`
    host.appendChild(hole)
    hole.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.6)', offset: 0.35 }, { transform: 'scale(1.6)', offset: 0.75 }, { transform: 'scale(0)' }], { duration: ms, fill: 'forwards' })
    clone.animate([
      { transform: 'scale(1) rotate(0)', opacity: 1, filter: 'blur(0)' },
      { transform: 'scale(1) rotate(0)', opacity: 1, offset: 0.2 },
      { transform: 'scale(0.02) rotate(540deg)', opacity: 0, filter: 'blur(2px)', offset: 0.8 },
      { transform: 'scale(0) rotate(540deg)', opacity: 0 },
    ], { duration: ms, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' })
  },
  stamp(clone, host, r, ms) {
    const s = document.createElement('div')
    s.textContent = 'DONE'
    s.style.cssText = `position:fixed;left:${r.left + r.width / 2 - 90}px;top:${r.top + r.height / 2 - 34}px;width:180px;height:68px;display:grid;place-items:center;font:900 38px var(--font-display);font-stretch:125%;letter-spacing:.08em;color:#4ade80;border:5px solid #4ade80;border-radius:10px;background:rgba(5,8,6,.55)`
    host.appendChild(s)
    s.animate([
      { transform: 'scale(3) rotate(-14deg)', opacity: 0 }, { transform: 'scale(1) rotate(-14deg)', opacity: 1, offset: 0.22 },
      { transform: 'scale(1.05) rotate(-14deg)', opacity: 1, offset: 0.3 }, { transform: 'scale(1) rotate(-14deg)', opacity: 1, offset: 0.75 },
      { transform: 'scale(1) rotate(-14deg)', opacity: 0 },
    ], { duration: ms, fill: 'forwards' })
    clone.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)', offset: 0.23 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }],
      { duration: ms, fill: 'forwards' })
  },
  fireworks(clone, host, r, ms) {
    clone.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: ms * 0.7, fill: 'forwards' })
    const points = [[0.2, -0.6], [0.55, -1.4], [0.85, -0.8], [0.4, -0.2]]
    points.forEach(([fx, fy], i) => burst(host, r.left + r.width * fx, r.top + r.height * fy, 26, 120, ms * 0.6, true, i * ms * 0.12))
  },
}

/**
 * Animate a feature row out, then write the change.
 * `row` is the real row element; `write` runs at `ms`.
 */
export function playCompletion(row: HTMLElement | null, extrasOn: boolean, write: () => void) {
  if (!row || reduced()) {
    write()
    return
  }
  const fx = pickFx(extrasOn, lastFx)
  lastFx = fx.id
  const r = row.getBoundingClientRect()
  const host = layer()
  const clone = row.cloneNode(true) as HTMLElement
  clone.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;box-sizing:border-box`
  host.appendChild(clone)
  row.style.visibility = 'hidden'
  PLAY[fx.id](clone, host, r, fx.ms)

  setTimeout(() => {
    row.style.overflow = 'hidden'
    row.style.height = `${r.height}px`
    row.style.transition = 'height 220ms ease, margin 220ms ease'
    requestAnimationFrame(() => { row.style.height = '0px'; row.style.marginBottom = `-14px` })
  }, Math.max(0, fx.ms - 240))
  setTimeout(() => {
    write()
    host.remove()
  }, fx.ms)
}
