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
    glyphs: ['♪', '♫'],
    make(n) {
      const arr = []
      const count = Math.max(4, Math.round(n * 0.45)) // 收一半，别太密
      for (let i = 0; i < count; i++) arr.push({
        x: Math.random(), y: rand(0.3, 1.15), v: rand(0.07, 0.12),
        size: rand(0.032, 0.046), ph: Math.random() * 6.28, sw: rand(0.006, 0.016),
        g: TYPES.notes.glyphs[(Math.random() * 2) | 0], life: 0,
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.y -= p.v * sp * dt
        p.life += dt * sp
        if (p.y < -0.1) { p.y = 1.12; p.x = Math.random(); p.life = 0 }
      }
    },
    draw(ctx, w, h, arr, color) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const p of arr) {
        // 轻柔横向摆动 + 极小幅倾斜，不再乱转
        const cx = (p.x + Math.sin(p.life * 1.4 + p.ph) * p.sw) * w
        const cy = p.y * h
        const fade = Math.min(1, p.y < 0.12 ? p.y / 0.12 : (p.y > 0.92 ? (1.12 - p.y) / 0.2 : 1))
        ctx.globalAlpha = 0.9 * Math.max(0, fade)
        ctx.fillStyle = color
        ctx.font = `${p.size * w}px 'Space Mono', monospace`
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.sin(p.life * 1.2 + p.ph) * 0.08)
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

  // 烟花：从底部升起 → 爆开成彩色火花 → 重力下坠淡出
  fireworks: {
    make(n) {
      const rockets = Math.max(2, Math.round(n * 0.05))
      const st = { rockets: [], sparks: [], spawn: 0, cap: rockets }
      return st
    },
    update(st, dt, sp) {
      st.spawn -= dt * sp
      if (st.spawn <= 0 && st.rockets.length < st.cap) {
        st.spawn = rand(0.4, 1.1)
        st.rockets.push({ x: rand(0.15, 0.85), y: 1, ty: rand(0.18, 0.5), v: rand(0.5, 0.8), hue: (Math.random() * 360) | 0 })
      }
      for (const r of st.rockets) {
        r.y -= r.v * sp * dt
        if (r.y <= r.ty) { explode(st, r); r.dead = true }
      }
      st.rockets = st.rockets.filter((r) => !r.dead)
      for (const s of st.sparks) {
        s.vy += 0.4 * dt * sp
        s.x += s.vx * dt * sp; s.y += s.vy * dt * sp
        s.life -= dt * sp
      }
      st.sparks = st.sparks.filter((s) => s.life > 0)
    },
    draw(ctx, w, h, st) {
      for (const r of st.rockets) {
        ctx.globalAlpha = 0.9; ctx.fillStyle = `hsl(${r.hue},90%,75%)`
        ctx.beginPath(); ctx.arc(r.x * w, r.y * h, Math.max(1.5, w * 0.004), 0, 6.28); ctx.fill()
      }
      for (const s of st.sparks) {
        ctx.globalAlpha = Math.max(0, s.life / s.maxLife)
        ctx.fillStyle = `hsl(${s.hue},90%,${s.lum}%)`
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r * w, 0, 6.28); ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  },

  // 闪烁星星：原地五角星，明暗呼吸（不下落）。只用白/黄，不彩色
  twinkle: {
    palette: ['#ffffff', '#fffbe8', '#fff3c2', '#ffe89a', '#ffd96b'],
    make(n) {
      const arr = []
      const count = Math.round(n * 1.4)
      for (let i = 0; i < count; i++) arr.push({
        x: Math.random(), y: Math.random(), size: rand(0.006, 0.02),
        ph: Math.random() * 6.28, tw: rand(1, 3), col: TYPES.twinkle.palette[(Math.random() * 5) | 0],
        points: Math.random() < 0.5 ? 4 : 5,
      })
      return arr
    },
    update(arr, dt, sp) { for (const p of arr) p.ph += p.tw * dt * sp },
    draw(ctx, w, h, arr, color) {
      for (const p of arr) {
        const a = (Math.sin(p.ph) + 1) / 2
        if (a < 0.04) continue
        ctx.globalAlpha = a
        ctx.fillStyle = p.col
        drawStar(ctx, p.x * w, p.y * h, p.size * w * (0.5 + a * 0.7), p.points)
      }
      ctx.globalAlpha = 1
    },
  },

  // 雪花：六角雪花字符飘落 + 左右摇摆 + 自转
  snow: {
    glyphs: ['❄', '❅', '❆', '✻', '✼'],
    make(n) {
      const arr = []
      for (let i = 0; i < n; i++) arr.push({
        x: Math.random(), y: Math.random() * 1.2 - 0.2, v: rand(0.04, 0.12),
        size: rand(0.012, 0.032), sway: rand(0.015, 0.05), ph: Math.random() * 6.28,
        rot: Math.random() * 6.28, vr: rand(-1, 1),
        g: TYPES.snow.glyphs[(Math.random() * 5) | 0],
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.y += p.v * sp * dt; p.ph += dt * sp; p.rot += p.vr * dt * sp
        if (p.y > 1.15) { p.y = -0.1; p.x = Math.random() }
      }
    },
    draw(ctx, w, h, arr, color) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const p of arr) {
        const cx = (p.x + Math.sin(p.ph) * p.sway) * w
        ctx.globalAlpha = 0.85
        ctx.fillStyle = color
        ctx.font = `${p.size * w}px ${"'Segoe UI Symbol',serif"}`
        ctx.save(); ctx.translate(cx, p.y * h); ctx.rotate(p.rot)
        ctx.fillText(p.g, 0, 0); ctx.restore()
      }
      ctx.globalAlpha = 1
    },
  },

  // 四叶草：飘落 + 摇摆 + 自转
  clover: {
    glyphs: ['🍀', '☘', '🍀', '✤'],
    make(n) {
      const arr = []
      for (let i = 0; i < n; i++) arr.push({
        x: Math.random(), y: Math.random() * 1.2 - 0.2, v: rand(0.05, 0.13),
        size: rand(0.018, 0.04), sway: rand(0.02, 0.06), ph: Math.random() * 6.28,
        rot: Math.random() * 6.28, vr: rand(-1.5, 1.5),
        g: TYPES.clover.glyphs[(Math.random() * 4) | 0],
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.y += p.v * sp * dt; p.ph += dt * sp; p.rot += p.vr * dt * sp
        if (p.y > 1.15) { p.y = -0.1; p.x = Math.random() }
      }
    },
    draw(ctx, w, h, arr, color) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const p of arr) {
        const cx = (p.x + Math.sin(p.ph) * p.sway) * w
        ctx.globalAlpha = 0.9
        ctx.fillStyle = color
        ctx.font = `${p.size * w}px ${"'Segoe UI Symbol','Apple Color Emoji',serif"}`
        ctx.save(); ctx.translate(cx, p.y * h); ctx.rotate(p.rot * 0.4)
        ctx.fillText(p.g, 0, 0); ctx.restore()
      }
      ctx.globalAlpha = 1
    },
  },

  // 心：自下而上轻柔升起 + 微摆 + 心跳缩放（不混多彩 emoji，跟随主色）
  hearts: {
    glyphs: ['♥', '♡'],
    make(n) {
      const arr = []
      const count = Math.max(4, Math.round(n * 0.4)) // 收一半多，别太密
      for (let i = 0; i < count; i++) arr.push({
        x: Math.random(), y: rand(0.5, 1.2), v: rand(0.06, 0.11),
        size: rand(0.022, 0.04), sway: rand(0.008, 0.02), ph: Math.random() * 6.28,
        g: TYPES.hearts.glyphs[(Math.random() * 2) | 0],
      })
      return arr
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.y -= p.v * sp * dt; p.ph += dt * sp
        if (p.y < -0.12) { p.y = 1.12; p.x = Math.random() }
      }
    },
    draw(ctx, w, h, arr, color) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const p of arr) {
        const cx = (p.x + Math.sin(p.ph * 0.9) * p.sway) * w
        const fade = p.y > 0.85 ? (1.12 - p.y) / 0.27 : (p.y < 0.1 ? Math.max(0, p.y / 0.1) : 1)
        const beat = 1 + Math.sin(p.ph * 3) * 0.05 // 轻微心跳
        ctx.globalAlpha = 0.88 * Math.max(0, Math.min(1, fade))
        ctx.fillStyle = color
        ctx.font = `${p.size * w * beat}px ${"'Segoe UI Symbol',serif"}`
        ctx.fillText(p.g, cx, p.y * h)
      }
      ctx.globalAlpha = 1
    },
  },
}

function explode(st, r) {
  const count = 22 + ((Math.random() * 16) | 0)
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * 6.28 + rand(-0.1, 0.1)
    const spd = rand(0.06, 0.20)
    const life = rand(0.7, 1.4)
    st.sparks.push({
      x: r.x, y: r.ty, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life, maxLife: life, hue: r.hue + rand(-20, 20), lum: 60 + ((Math.random() * 25) | 0),
      r: rand(0.002, 0.005),
    })
  }
}

function drawStar(ctx, cx, cy, r, pts = 5) {
  ctx.beginPath()
  const step = Math.PI / pts
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * 6.283 - 1.571
    const a2 = a + step
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45)
  }
  ctx.closePath()
  ctx.fill()
}

const FULL = { x: 0, y: 0, w: 1, h: 1 }

export class Effects {
  constructor() {
    this.active = new Map()   // type -> { state, region }
    this.amount = 50
    this.speed = 1
    this.color = '#eafff2'
  }
  has(type) { return this.active.has(type) }
  list() { return [...this.active.keys()] }
  toggle(type) { this.has(type) ? this.remove(type) : this.add(type) }
  add(type) {
    if (!TYPES[type]) return
    const n = Math.round(8 + (this.amount / 100) * 90)
    const prev = this.active.get(type)
    this.active.set(type, { state: TYPES[type].make(n), region: prev?.region || { ...FULL } })
  }
  remove(type) { this.active.delete(type) }
  clear() { this.active.clear() }
  setAmount(v) {
    this.amount = v
    for (const type of this.list()) this.add(type) // 重新生成粒子，保留 region
  }
  setRegion(type, region) {
    const ent = this.active.get(type)
    if (ent) ent.region = region || { ...FULL }
  }
  getRegion(type) { return this.active.get(type)?.region || { ...FULL } }
  isFull(type) {
    const r = this.getRegion(type)
    return r.x === 0 && r.y === 0 && r.w === 1 && r.h === 1
  }
  get isEmpty() { return this.active.size === 0 }

  update(dt) {
    const sp = this.speed
    for (const [type, ent] of this.active) TYPES[type].update(ent.state, dt, sp)
  }
  // 每个动效裁剪到自己的 region；归一化粒子映射进该子矩形。
  draw(ctx, W, H) {
    for (const [type, ent] of this.active) {
      const reg = ent.region || FULL
      const rx = reg.x * W, ry = reg.y * H, rw = reg.w * W, rh = reg.h * H
      ctx.save()
      ctx.beginPath()
      ctx.rect(rx, ry, rw, rh)
      ctx.clip()
      ctx.translate(rx, ry)
      TYPES[type].draw(ctx, rw, rh, ent.state, this.color)
      ctx.restore()
    }
  }
}
