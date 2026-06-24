// 动效图层。所有粒子用归一化坐标 [0..1]，draw(ctx,w,h) 时缩放到任意分辨率，
// 这样预览（屏幕尺寸）和导出（自然分辨率）共用同一套状态。
// 支持多种动效同时叠加。

const rand = (a, b) => a + Math.random() * (b - a)
const SPARKLE_COLORS = ['#ff9ec4', '#ffd56b', '#9be8a0', '#8cd6ff', '#c79bff', '#ff8f6b', '#7fe3ff']

// ---- 各动效的粒子工厂 + 更新 + 绘制 ----
const TYPES = {
  rain: {
    make(n) {
      const arr = []
      for (let i = 0; i < n; i++) arr.push({
        x: Math.random(), y: Math.random() * 1.2 - 0.2,
        v: rand(0.18, 0.42), size: rand(0.018, 0.04), drift: rand(-0.04, 0.04),
        ph: Math.random() * 6.28,
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.y += p.v * sp * dt
        p.x += Math.sin(p.y * 8 + p.ph) * 0.0008 * sp + p.drift * dt * sp * 0.15
        if (p.y > 1.15) { p.y = -0.15; p.x = Math.random() }
      }
    },
    draw(ctx, w, h, arr, color) {
      for (const p of arr) {
        const cx = p.x * w, cy = p.y * h
        const r = p.size * w
        // 水滴轮廓
        ctx.fillStyle = color
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.moveTo(cx, cy - r * 1.7)
        ctx.bezierCurveTo(cx + r, cy - r * 0.2, cx + r, cy + r, cx, cy + r)
        ctx.bezierCurveTo(cx - r, cy + r, cx - r, cy - r * 0.2, cx, cy - r * 1.7)
        ctx.closePath()
        // 网点填充：剪裁后画点阵
        ctx.save()
        ctx.clip()
        const step = Math.max(2, r * 0.5)
        ctx.globalAlpha = 0.85
        for (let yy = cy - r * 1.8; yy < cy + r * 1.2; yy += step) {
          for (let xx = cx - r * 1.2; xx < cx + r * 1.2; xx += step) {
            ctx.beginPath()
            ctx.arc(xx, yy, step * 0.22, 0, 6.28)
            ctx.fill()
          }
        }
        ctx.restore()
        // 高光描边
        ctx.globalAlpha = 0.5
        ctx.lineWidth = Math.max(1, r * 0.12)
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(cx, cy - r * 1.7)
        ctx.bezierCurveTo(cx + r, cy - r * 0.2, cx + r, cy + r, cx, cy + r)
        ctx.bezierCurveTo(cx - r, cy + r, cx - r, cy - r * 0.2, cx, cy - r * 1.7)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    },
  },

  notes: {
    glyphs: ['♪', '♫', '♩', '♬', '𝄞'],
    make(n) {
      const arr = []
      for (let i = 0; i < n; i++) arr.push({
        x: Math.random(), y: rand(0.4, 1.1), v: rand(0.08, 0.2),
        size: rand(0.03, 0.06), ph: Math.random() * 6.28, sw: rand(0.02, 0.05),
        g: TYPES.notes.glyphs[(Math.random() * 5) | 0], life: 0,
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.y -= p.v * sp * dt
        p.life += dt * sp
        if (p.y < -0.1) { p.y = 1.1; p.x = Math.random(); p.life = 0 }
      }
    },
    draw(ctx, w, h, arr, color) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const p of arr) {
        const cx = (p.x + Math.sin(p.life * 3 + p.ph) * p.sw) * w
        const cy = p.y * h
        const fade = Math.min(1, p.y < 0.15 ? p.y / 0.15 : (p.y > 0.95 ? (1.1 - p.y) / 0.15 : 1))
        ctx.globalAlpha = 0.92 * fade
        ctx.fillStyle = color
        ctx.font = `${p.size * w}px 'Space Mono', monospace`
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.sin(p.life * 2 + p.ph) * 0.25)
        ctx.fillText(p.g, 0, 0)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    },
  },

  bloom: {
    make(n) {
      const arr = []
      const c = Math.max(3, Math.round(n * 0.4))
      for (let i = 0; i < c; i++) arr.push({
        x: rand(0.1, 0.9), y: rand(0.15, 0.85), max: rand(0.05, 0.1),
        t: Math.random(), spd: rand(0.25, 0.5), petals: 5 + ((Math.random() * 3) | 0),
        hue: rand(-20, 20),
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.t += p.spd * sp * dt * 0.5
        if (p.t > 2) { p.t = 0; p.x = rand(0.1, 0.9); p.y = rand(0.15, 0.85) }
      }
    },
    draw(ctx, w, h, arr, color) {
      for (const p of arr) {
        // t: 0→1 绽放，1→2 保持后渐隐
        const grow = Math.min(1, p.t)
        const fade = p.t > 1.4 ? Math.max(0, (2 - p.t) / 0.6) : 1
        const R = p.max * w * grow
        const cx = p.x * w, cy = p.y * h
        ctx.globalAlpha = 0.85 * fade
        for (let k = 0; k < p.petals; k++) {
          const ang = (k / p.petals) * 6.28 + p.t
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(ang)
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.ellipse(R * 0.6, 0, R * 0.5, R * 0.26, 0, 0, 6.28)
          ctx.fill()
          ctx.restore()
        }
        ctx.globalAlpha = fade
        ctx.fillStyle = '#fff7d6'
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, 6.28); ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  },

  waves: {
    make(n) {
      const foam = []
      for (let i = 0; i < n * 2; i++) foam.push({ x: Math.random(), y: rand(0.7, 0.98), s: rand(0.004, 0.01), ph: Math.random() * 6.28 })
      return { foam, t: 0 }
    },
    update(st, dt, sp) {
      st.t += dt * sp
      for (const f of st.foam) { f.x += 0.03 * sp * dt; if (f.x > 1.05) f.x = -0.05 }
    },
    draw(ctx, w, h, st, color) {
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55
      for (let line = 0; line < 3; line++) {
        const baseY = (0.74 + line * 0.07) * h
        const amp = (6 + line * 4)
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let x = 0; x <= w; x += 6) {
          const y = baseY + Math.sin(x * 0.02 + st.t * 2 + line) * amp
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 0.8; ctx.fillStyle = color
      for (const f of st.foam) {
        const y = f.y * h + Math.sin(f.x * 30 + st.t * 2) * 4
        ctx.beginPath(); ctx.arc(f.x * w, y, f.s * w, 0, 6.28); ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  },

  sparkle: {
    make(n) {
      const arr = []
      for (let i = 0; i < n * 1.5; i++) arr.push({
        x: Math.random(), y: Math.random(), size: rand(0.006, 0.018),
        ph: Math.random() * 6.28, tw: rand(1.5, 4), drift: rand(-0.02, 0.02),
        col: SPARKLE_COLORS[(Math.random() * SPARKLE_COLORS.length) | 0], fall: rand(0.01, 0.05),
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.ph += p.tw * dt * sp
        p.y += p.fall * dt * sp
        p.x += Math.sin(p.ph * 0.5) * 0.0006 * sp
        if (p.y > 1.05) { p.y = -0.05; p.x = Math.random() }
      }
    },
    draw(ctx, w, h, arr, color) {
      for (const p of arr) {
        const a = (Math.sin(p.ph) + 1) / 2
        if (a < 0.05) continue
        ctx.globalAlpha = a
        ctx.fillStyle = p.col
        drawStar(ctx, p.x * w, p.y * h, p.size * w * (0.6 + a * 0.6))
      }
      ctx.globalAlpha = 1
    },
  },

  petals: {
    make(n) {
      const arr = []
      for (let i = 0; i < n; i++) arr.push({
        x: Math.random(), y: Math.random() * 1.2 - 0.2, v: rand(0.06, 0.16),
        size: rand(0.015, 0.03), rot: Math.random() * 6.28, vr: rand(-2, 2),
        sway: rand(0.02, 0.06), ph: Math.random() * 6.28,
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.y += p.v * sp * dt
        p.ph += dt * sp
        p.rot += p.vr * dt * sp
        if (p.y > 1.15) { p.y = -0.15; p.x = Math.random() }
      }
    },
    draw(ctx, w, h, arr, color) {
      for (const p of arr) {
        const cx = (p.x + Math.sin(p.ph) * p.sway) * w
        const cy = p.y * h
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(p.rot)
        ctx.globalAlpha = 0.85
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size * w, p.size * w * 0.55, 0, 0, 6.28)
        ctx.fill()
        ctx.restore()
      }
      ctx.globalAlpha = 1
    },
  },
}

function drawStar(ctx, cx, cy, r) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.283 - 1.571
    const a2 = a + 0.628
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45)
  }
  ctx.closePath()
  ctx.fill()
}

export class Effects {
  constructor() {
    this.active = new Map()   // type -> particle state
    this.amount = 50
    this.speed = 1
    this.color = '#eafff2'
  }
  has(type) { return this.active.has(type) }
  toggle(type) { this.has(type) ? this.remove(type) : this.add(type) }
  add(type) {
    if (!TYPES[type]) return
    const n = Math.round(8 + (this.amount / 100) * 90)
    this.active.set(type, TYPES[type].make(n))
  }
  remove(type) { this.active.delete(type) }
  clear() { this.active.clear() }
  setAmount(v) {
    this.amount = v
    // 重新生成各动效粒子数
    for (const type of [...this.active.keys()]) this.add(type)
  }
  get isEmpty() { return this.active.size === 0 }

  update(dt) {
    const sp = this.speed
    for (const [type, st] of this.active) TYPES[type].update(st, dt, sp)
  }
  draw(ctx, w, h) {
    for (const [type, st] of this.active) TYPES[type].draw(ctx, w, h, st, this.color)
  }
}
