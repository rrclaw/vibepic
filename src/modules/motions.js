// 动效（运动）库：把「怎么动」从「长什么样」里解耦。
// 每个 motion 暴露：make(n) 造粒子；update(arr,dt,sp) 推进；place(p,aspect) 给出
// 该帧的归一化呈现 {x,y,size,rot,alpha}（x/y∈[0,1] 相对所在区域，size 是区域宽的占比）。
// aspect = 区域宽/高，用来把「环形/透视/旋涡」画成视觉正圆而非椭圆。

const rand = (a, b) => a + Math.random() * (b - a)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

function scatterSpawn(p) {
  p.cx = rand(0.2, 0.8); p.cy = rand(0.25, 0.75)
  const ang = rand(0, 6.2832), spd = rand(0.1, 0.55)
  p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd
  p.life = rand(0.5, 1.3); p.maxLife = p.life
  p.x = p.cx; p.y = p.cy
  p.bs = rand(0.015, 0.034); p.rot = rand(0, 6.28); p.vr = rand(-3, 3)
}

export const MOTIONS = {
  // 漂浮：原地轻柔摆动，几乎不位移
  float: {
    label: '漂浮',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ ax: rand(0.08, 0.92), ay: rand(0.1, 0.9), bs: rand(0.02, 0.045), ph: rand(0, 6.28), sp: rand(0.6, 1.3), amp: rand(0.012, 0.03) })
      return a
    },
    update(arr, dt, sp) { for (const p of arr) p.ph += dt * sp * p.sp },
    place(p) {
      return { x: p.ax + Math.sin(p.ph) * p.amp, y: p.ay + Math.cos(p.ph * 0.8) * p.amp, size: p.bs * (0.95 + Math.sin(p.ph * 2) * 0.06), rot: Math.sin(p.ph) * 0.25, alpha: 0.85 }
    },
  },

  // 洒落：自上而下飘落 + 横向轻摆 + 自转
  fall: {
    label: '洒落',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: rand(-0.2, 1.2), v: rand(0.08, 0.3), bs: rand(0.02, 0.045), rot: rand(0, 6.28), vr: rand(-1.5, 1.5), ph: rand(0, 6.28), sway: rand(0.01, 0.04) })
      return a
    },
    update(arr, dt, sp) {
      for (const p of arr) { p.y += p.v * sp * dt; p.ph += dt * sp; p.rot += p.vr * dt * sp; if (p.y > 1.18) { p.y = -0.18; p.x = Math.random() } }
    },
    place(p) { return { x: p.x + Math.sin(p.ph) * p.sway, y: p.y, size: p.bs, rot: p.rot, alpha: 0.88 } },
  },

  // 升腾：自下而上升起（适合心/泡泡/音符）
  rise: {
    label: '升腾',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: rand(0.4, 1.3), v: rand(0.07, 0.2), bs: rand(0.02, 0.045), rot: 0, ph: rand(0, 6.28), sway: rand(0.008, 0.026) })
      return a
    },
    update(arr, dt, sp) {
      for (const p of arr) { p.y -= p.v * sp * dt; p.ph += dt * sp; if (p.y < -0.18) { p.y = 1.18; p.x = Math.random() } }
    },
    place(p) {
      const fade = p.y > 0.88 ? clamp01((1.2 - p.y) / 0.32) : (p.y < 0.1 ? clamp01(p.y / 0.1) : 1)
      return { x: p.x + Math.sin(p.ph) * p.sway, y: p.y, size: p.bs, rot: Math.sin(p.ph) * 0.18, alpha: 0.86 * fade }
    },
  },

  // 绽放：原地从 0 放大 → 保持 → 渐隐 → 换位重开
  bloom: {
    label: '绽放',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ x: rand(0.08, 0.92), y: rand(0.1, 0.9), t: Math.random() * 2, spd: rand(0.3, 0.6), bs: rand(0.03, 0.06), rot: rand(0, 6.28), vr: rand(-1, 1) })
      return a
    },
    update(arr, dt, sp) {
      for (const p of arr) { p.t += p.spd * sp * dt; p.rot += p.vr * dt * sp; if (p.t > 2) { p.t = 0; p.x = rand(0.08, 0.92); p.y = rand(0.1, 0.9) } }
    },
    place(p) {
      const grow = Math.min(1, p.t)
      const fade = p.t > 1.4 ? Math.max(0, (2 - p.t) / 0.6) : 1
      return { x: p.x, y: p.y, size: p.bs * (0.2 + grow * 1.1), rot: p.rot, alpha: 0.9 * fade }
    },
  },

  // 环形：绕中心做圆周轨道
  ring: {
    label: '环形',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ a: rand(0, 6.28), r: rand(0.12, 0.42), w: rand(0.3, 0.8) * (Math.random() < 0.5 ? 1 : -1), bs: rand(0.018, 0.04), ph: rand(0, 6.28) })
      return a
    },
    update(arr, dt, sp) { for (const p of arr) { p.a += p.w * sp * dt; p.ph += dt * sp } },
    place(p, aspect) {
      return { x: 0.5 + Math.cos(p.a) * p.r, y: 0.5 + Math.sin(p.a) * p.r * aspect, size: p.bs * (0.9 + Math.sin(p.ph * 2) * 0.1), rot: p.a + 1.57, alpha: 0.85 }
    },
  },

  // 透视：星空俯冲 —— 从中心(远)向边缘(近)冲来，越近越大越实
  perspective: {
    label: '透视',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ ang: rand(0, 6.28), z: Math.random(), v: rand(0.2, 0.5), bs: rand(0.02, 0.05), rot: rand(0, 6.28), vr: rand(-0.5, 0.5) })
      return a
    },
    update(arr, dt, sp) {
      for (const p of arr) { p.z += p.v * sp * dt; p.rot += p.vr * dt * sp; if (p.z > 1) { p.z = 0; p.ang = rand(0, 6.28) } }
    },
    place(p, aspect) {
      const e = p.z * p.z
      const alpha = p.z < 0.12 ? p.z / 0.12 : (p.z > 0.85 ? (1 - p.z) / 0.15 : 1)
      return { x: 0.5 + Math.cos(p.ang) * e * 0.62, y: 0.5 + Math.sin(p.ang) * e * 0.62 * aspect, size: p.bs * (0.15 + p.z * 1.9), rot: p.rot, alpha: Math.max(0, alpha) * 0.95 }
    },
  },

  // 失重：零重力布朗漂移，四向游走、边缘环绕
  weightless: {
    label: '失重',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: Math.random(), vx: rand(-0.05, 0.05), vy: rand(-0.05, 0.05), bs: rand(0.02, 0.045), rot: rand(0, 6.28), vr: rand(-0.8, 0.8), ph: rand(0, 6.28) })
      return a
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.ph += dt * sp
        p.vx += Math.sin(p.ph * 0.7) * 0.004 * dt * sp
        p.vy += Math.cos(p.ph * 0.5) * 0.004 * dt * sp
        p.x += p.vx * sp * dt; p.y += p.vy * sp * dt; p.rot += p.vr * dt * sp
        if (p.x < -0.05) p.x = 1.05; else if (p.x > 1.05) p.x = -0.05
        if (p.y < -0.05) p.y = 1.05; else if (p.y > 1.05) p.y = -0.05
      }
    },
    place(p) { return { x: p.x, y: p.y, size: p.bs, rot: p.rot, alpha: 0.8 + Math.sin(p.ph) * 0.15 } },
  },

  // 闪烁：原地明暗 + 微缩放呼吸
  twinkle: {
    label: '闪烁',
    make(n) {
      const a = []
      const c = Math.round(n * 1.3)
      for (let i = 0; i < c; i++) a.push({ x: Math.random(), y: Math.random(), ph: rand(0, 6.28), tw: rand(1, 3), bs: rand(0.012, 0.03) })
      return a
    },
    update(arr, dt, sp) { for (const p of arr) p.ph += p.tw * sp * dt },
    place(p) { const a = (Math.sin(p.ph) + 1) / 2; return { x: p.x, y: p.y, size: p.bs * (0.4 + a * 0.8), rot: 0, alpha: a } },
  },

  // 旋涡：螺旋向心收拢，到芯重置到外圈
  swirl: {
    label: '旋涡',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) a.push({ a: rand(0, 6.28), r: rand(0.05, 0.45), w: rand(0.5, 1.1) * (Math.random() < 0.5 ? 1 : -1), vr: rand(0.04, 0.1), bs: rand(0.015, 0.035), ph: rand(0, 6.28) })
      return a
    },
    update(arr, dt, sp) {
      for (const p of arr) { p.a += p.w * sp * dt; p.r -= p.vr * sp * dt; p.ph += dt * sp; if (p.r < 0.04) { p.r = 0.46; p.a = rand(0, 6.28) } }
    },
    place(p, aspect) {
      return { x: 0.5 + Math.cos(p.a) * p.r, y: 0.5 + Math.sin(p.a) * p.r * aspect, size: p.bs * (0.7 + p.r), rot: p.a, alpha: Math.min(1, (p.r / 0.46) * 1.4) }
    },
  },

  // 喷发：从随机点爆散开、受重力、淡出后再爆（任意形状的烟花化）
  scatter: {
    label: '喷发',
    make(n) {
      const a = []
      for (let i = 0; i < n; i++) { const p = {}; scatterSpawn(p); p.life = Math.random() * p.maxLife; a.push(p) }
      return a
    },
    update(arr, dt, sp) {
      for (const p of arr) {
        p.vy += 0.25 * dt * sp
        p.x += p.vx * sp * dt; p.y += p.vy * sp * dt; p.life -= dt * sp; p.rot += p.vr * dt * sp
        if (p.life <= 0) scatterSpawn(p)
      }
    },
    place(p) { const k = p.life / p.maxLife; return { x: p.x, y: p.y, size: p.bs * (0.6 + (1 - k) * 0.7), rot: p.rot, alpha: Math.max(0, k) } },
  },
}

export const MOTION_KEYS = Object.keys(MOTIONS)
