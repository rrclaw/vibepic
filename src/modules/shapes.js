// 形状库：把「形状」从「动效」里解耦出来，供「形状 × 动效」自由组合用。
// 每个形状最终暴露成 draw(ctx, x, y, size, rot, color, alpha)；
// 矢量形状跟随 color，emoji 形状自带颜色（fillStyle 对彩色 emoji 无效，符合预期）。

function withT(ctx, x, y, rot, alpha, fn) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  if (rot) ctx.rotate(rot)
  fn()
  ctx.restore()
}

function poly(ctx, pts) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

function starPath(ctx, r, pts, inner = 0.45) {
  ctx.beginPath()
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * 6.2832 - 1.5708
    const a2 = a + Math.PI / pts
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    ctx.lineTo(Math.cos(a2) * r * inner, Math.sin(a2) * r * inner)
  }
  ctx.closePath()
}

// 矢量绘制器：fn(ctx, size, color)，已在 withT 里平移/旋转/设 alpha
const vector = {
  star: (ctx, s, c) => { ctx.fillStyle = c; starPath(ctx, s, 5, 0.45); ctx.fill() },
  sparkle: (ctx, s, c) => { ctx.fillStyle = c; starPath(ctx, s, 4, 0.32); ctx.fill() },
  diamond: (ctx, s, c) => { ctx.fillStyle = c; poly(ctx, [[0, -s], [s * 0.68, 0], [0, s], [-s * 0.68, 0]]); ctx.fill() },
  dot: (ctx, s, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, 6.2832); ctx.fill() },
  ring: (ctx, s, c) => { ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.16); ctx.beginPath(); ctx.arc(0, 0, s * 0.78, 0, 6.2832); ctx.stroke() },
  bubble: (ctx, s, c) => {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.1)
    ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, 6.2832); ctx.stroke()
    ctx.globalAlpha *= 0.6; ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.3, s * 0.16, 0, 6.2832); ctx.fill()
  },
  heart: (ctx, s, c) => {
    ctx.fillStyle = c
    const k = s * 0.95
    ctx.beginPath()
    ctx.moveTo(0, k * 0.32)
    ctx.bezierCurveTo(k * 0.1, -k * 0.28, k * 0.95, -k * 0.06, 0, k)
    ctx.bezierCurveTo(-k * 0.95, -k * 0.06, -k * 0.1, -k * 0.28, 0, k * 0.32)
    ctx.fill()
  },
  petal: (ctx, s, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, 6.2832); ctx.fill() },
  raindrop: (ctx, s, c) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(0, -s * 1.3)
    ctx.bezierCurveTo(s * 0.82, -s * 0.1, s * 0.7, s * 0.85, 0, s * 0.85)
    ctx.bezierCurveTo(-s * 0.7, s * 0.85, -s * 0.82, -s * 0.1, 0, -s * 1.3)
    ctx.fill()
  },
  flower: (ctx, s, c) => {
    ctx.fillStyle = c
    const pet = 6
    for (let k = 0; k < pet; k++) {
      ctx.save(); ctx.rotate((k / pet) * 6.2832)
      ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.3, s * 0.55, 0, 0, 6.2832); ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = '#fff3c0'
    ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, 6.2832); ctx.fill()
  },
  leaf: (ctx, s, c) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.8, 0, 0, s); ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s)
    ctx.fill()
  },
}

function glyphDraw(ch, font = "'Segoe UI Symbol','Apple Color Emoji',serif") {
  return (ctx, s, c) => {
    ctx.font = `${s * 2.2}px ${font}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = c
    ctx.fillText(ch, 0, 0)
  }
}

// 预设形状表。kind: vector | glyph
export const SHAPES = {
  star: { label: '星星 ✦', kind: 'vector', fn: vector.star },
  sparkle: { label: '闪光 ✶', kind: 'vector', fn: vector.sparkle },
  flower: { label: '花朵 ❀', kind: 'vector', fn: vector.flower },
  petal: { label: '花瓣 🌸', kind: 'vector', fn: vector.petal },
  heart: { label: '爱心 ♥', kind: 'vector', fn: vector.heart },
  raindrop: { label: '雨滴 💧', kind: 'vector', fn: vector.raindrop },
  diamond: { label: '钻石 ◆', kind: 'vector', fn: vector.diamond },
  dot: { label: '圆点 ●', kind: 'vector', fn: vector.dot },
  ring: { label: '圆环 ○', kind: 'vector', fn: vector.ring },
  bubble: { label: '气泡 ◌', kind: 'vector', fn: vector.bubble },
  leaf: { label: '叶子 🍃', kind: 'vector', fn: vector.leaf },
  clover: { label: '四叶草 🍀', kind: 'glyph', ch: '🍀' },
  snow: { label: '雪花 ❄', kind: 'glyph', ch: '❄' },
  note: { label: '音符 ♪', kind: 'glyph', ch: '♪' },
  moon: { label: '月亮 ☾', kind: 'glyph', ch: '☾' },
  sun: { label: '太阳 ☀', kind: 'glyph', ch: '☀' },
  cloud: { label: '云朵 ☁', kind: 'glyph', ch: '☁' },
  icecream: { label: '冰淇淋 🍦', kind: 'glyph', ch: '🍦' },
  butterfly: { label: '蝴蝶 🦋', kind: 'glyph', ch: '🦋' },
  fish: { label: '小鱼 🐟', kind: 'glyph', ch: '🐟' },
  coffee: { label: '咖啡 ☕', kind: 'glyph', ch: '☕' },
}

export const SHAPE_KEYS = Object.keys(SHAPES)

// spec：{ key } 用预设；{ glyph:'☁' } 用任意 emoji/字符
export function shapeDrawer(spec) {
  let render
  if (spec && spec.glyph) {
    render = glyphDraw(spec.glyph)
  } else {
    const sh = SHAPES[spec && spec.key] || SHAPES.star
    render = sh.kind === 'glyph' ? glyphDraw(sh.ch) : sh.fn
  }
  return (ctx, x, y, size, rot, color, alpha) => withT(ctx, x, y, rot, alpha, () => render(ctx, size, color))
}

export function shapeSpecLabel(spec) {
  if (spec && spec.glyph) return spec.glyph
  const sh = SHAPES[spec && spec.key]
  return sh ? sh.label : '形状'
}
