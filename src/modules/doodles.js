// 手绘装饰图层：路径涂鸦（五线谱/耳机线/涡卷/花藤，会自己描出来）+ 音符/花朵/花字贴纸。
// 全部画在 fx 画布上 → 预览会动、导出 WebM 也录得到。坐标归一化 [0,1]，任意分辨率通用。

const rand = (a, b) => a + Math.random() * (b - a)
const GLYPH_FONT = "'Segoe UI Symbol','Apple Color Emoji','Space Mono',serif"
const SCRIPT_FONT = "'Pinyon Script','Caveat',cursive"

const GLYPHS = {
  note1: '♪', note2: '♫', note3: '♬', clef: '𝄞',
  flower1: '❀', flower2: '✿', flower3: '❁', spark: '✦', heart: '♡', star: '✺',
}

// Catmull-Rom 经过 anchors 采样成密集折线（local 0..1）
function sampleCurve(anchors, seg = 24) {
  const pts = []
  const p = anchors
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p[i + 1]
    for (let t = 0; t < seg; t++) {
      const s = t / seg
      const s2 = s * s, s3 = s2 * s
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3)
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3)
      pts.push({ x, y })
    }
  }
  pts.push({ x: p[p.length - 1][0], y: p[p.length - 1][1] })
  return pts
}

// 各路径涂鸦的生成器：返回 { strokes:[[{x,y}..]], marks:[{x,y,ch,at,scale}] }（local 0..1）
const PATHS = {
  swirl() {
    const a = [[0.06, 0.55], [0.28, 0.18], [0.45, 0.62], [0.62, 0.2], [0.8, 0.6], [0.95, 0.35]]
    return { strokes: [sampleCurve(a)], marks: [{ x: 0.95, y: 0.35, ch: '✦', at: 1, scale: 1 }] }
  },
  cord() { // 耳机线：竖向下垂带回环
    const a = [[0.5, 0.0], [0.66, 0.13], [0.4, 0.26], [0.62, 0.4], [0.42, 0.55], [0.6, 0.7], [0.4, 0.86], [0.52, 1.0]]
    return { strokes: [sampleCurve(a)], marks: [{ x: 0.62, y: 0.4, ch: '♪', at: 0.55, scale: 1.1 }] }
  },
  vine() { // 花藤：横向波浪 + 沿途小花
    const a = [[0.04, 0.5], [0.24, 0.3], [0.46, 0.62], [0.68, 0.32], [0.9, 0.6], [0.98, 0.45]]
    const s = sampleCurve(a)
    const marks = []
    for (let i = 0; i < a.length; i++) if (i % 1 === 0) marks.push({ x: a[i][0], y: a[i][1], ch: ['❀', '✿', '❁'][i % 3], at: i / a.length, scale: 0.9 })
    return { strokes: [s], marks }
  },
  staff() { // 五线谱：5 条波浪线 + 谱号 + 音符
    const base = (off) => sampleCurve([[0.02, 0.5 + off], [0.25, 0.34 + off], [0.5, 0.58 + off], [0.75, 0.36 + off], [0.98, 0.52 + off]])
    const gap = 0.075
    const strokes = [-2, -1, 0, 1, 2].map((k) => base(k * gap))
    const marks = [
      { x: 0.06, y: 0.5, ch: '𝄞', at: 0.1, scale: 2.0 },
      { x: 0.34, y: 0.42, ch: '♪', at: 0.4, scale: 1.1 },
      { x: 0.5, y: 0.58, ch: '♬', at: 0.55, scale: 1.1 },
      { x: 0.66, y: 0.44, ch: '♫', at: 0.7, scale: 1.1 },
      { x: 0.86, y: 0.5, ch: '♪', at: 0.9, scale: 1.1 },
    ]
    return { strokes, marks }
  },
}

export class Doodles {
  constructor() {
    this.items = []
    this.color = '#ffffff'
    this.speed = 1
    this.selected = null
    this.idc = 0
  }
  get isEmpty() { return this.items.length === 0 }

  addGlyph(kind, x = 0.5, y = 0.5) {
    const it = {
      id: ++this.idc, type: 'glyph', kind, ch: GLYPHS[kind] || '♪',
      x, y, scale: 1, color: this.color, phase: rand(0, 6.28), anim: 'float',
    }
    this.items.push(it); this.selected = it; return it
  }
  addText(str, x = 0.5, y = 0.4) {
    const it = {
      id: ++this.idc, type: 'text', str, x, y, scale: 1, color: this.color,
      phase: rand(0, 6.28), anim: 'float',
    }
    this.items.push(it); this.selected = it; return it
  }
  addPath(kind, region) {
    const gen = (PATHS[kind] || PATHS.swirl)()
    const it = {
      id: ++this.idc, type: 'path', kind, region: region || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
      color: this.color, strokes: gen.strokes, marks: gen.marks,
      progress: 0, drawDur: 2.4, t: 0,
    }
    this.items.push(it); this.selected = it; return it
  }
  replay(it) { if (it && it.type === 'path') { it.progress = 0; it.t = 0 } }
  replayAll() { for (const it of this.items) this.replay(it) }

  remove(it) { this.items = this.items.filter((x) => x !== it); if (this.selected === it) this.selected = null }
  clear() { this.items = []; this.selected = null }

  // 命中测试（归一化点）：返回最上层 item
  hit(xN, yN) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      if (it.type === 'path') {
        const r = it.region
        if (xN >= r.x && xN <= r.x + r.w && yN >= r.y && yN <= r.y + r.h) return it
      } else {
        const rad = 0.05 * it.scale + 0.02
        if (Math.hypot(xN - it.x, yN - it.y) < rad) return it
      }
    }
    return null
  }
  moveTo(it, xN, yN, dx, dy) {
    if (!it) return
    if (it.type === 'path') {
      it.region.x = Math.max(0, Math.min(1 - it.region.w, it.region.x + dx))
      it.region.y = Math.max(0, Math.min(1 - it.region.h, it.region.y + dy))
    } else {
      it.x = Math.max(0, Math.min(1, xN)); it.y = Math.max(0, Math.min(1, yN))
    }
  }

  update(dt) {
    const sp = this.speed
    for (const it of this.items) {
      it.phase = (it.phase || 0) + dt * sp
      if (it.type === 'path') {
        it.t += dt * sp
        if (it.progress < 1) it.progress = Math.min(1, it.progress + dt * sp / it.drawDur)
      }
    }
  }

  draw(ctx, W, H) {
    const minWH = Math.min(W, H)
    for (const it of this.items) {
      if (it.type === 'glyph') this._drawGlyph(ctx, it, W, H, minWH)
      else if (it.type === 'text') this._drawText(ctx, it, W, H, minWH)
      else this._drawPath(ctx, it, W, H, minWH)
    }
  }

  // 仅预览调用：选中高亮（不进导出）
  drawSelection(ctx, W, H) {
    const it = this.selected
    if (!it) return
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 5])
    if (it.type === 'path') {
      const r = it.region
      ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H)
    } else {
      const rad = (it.type === 'text' ? 0.09 : 0.05) * (it.scale || 1) * Math.min(W, H) + 8
      ctx.beginPath(); ctx.arc(it.x * W, it.y * H, rad, 0, 6.28); ctx.stroke()
    }
    ctx.restore()
  }

  _drawGlyph(ctx, it, W, H, minWH) {
    const size = minWH * 0.06 * it.scale
    const bob = Math.sin(it.phase * 1.6) * size * 0.18
    const tw = 0.7 + (Math.sin(it.phase * 2.4) + 1) / 2 * 0.3
    ctx.save()
    ctx.translate(it.x * W, it.y * H + bob)
    ctx.rotate(Math.sin(it.phase) * 0.12)
    ctx.globalAlpha = tw
    ctx.font = `${size}px ${GLYPH_FONT}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = size * 0.15
    ctx.fillStyle = it.color
    ctx.fillText(it.ch, 0, 0)
    ctx.restore()
  }

  _drawText(ctx, it, W, H, minWH) {
    const size = minWH * 0.1 * it.scale
    const bob = Math.sin(it.phase * 1.4) * size * 0.06
    ctx.save()
    ctx.translate(it.x * W, it.y * H + bob)
    ctx.font = `${size}px ${SCRIPT_FONT}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = size * 0.12
    ctx.fillStyle = it.color
    ctx.fillText(it.str, 0, 0)
    ctx.restore()
  }

  _drawPath(ctx, it, W, H, minWH) {
    const r = it.region
    const mapX = (lx) => (r.x + lx * r.w) * W
    const mapY = (ly) => (r.y + ly * r.h) * H
    ctx.save()
    ctx.strokeStyle = it.color
    ctx.lineWidth = Math.max(1.5, minWH * 0.0045)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = ctx.lineWidth
    // 各笔画按 progress 部分描出
    for (const stroke of it.strokes) {
      const n = Math.max(2, Math.floor(stroke.length * it.progress))
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const px = mapX(stroke[i].x), py = mapY(stroke[i].y)
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    // 音符/花朵标记：progress 越过 at 才出现，带 pop-in
    ctx.shadowBlur = minWH * 0.01
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const m of it.marks) {
      if (it.progress < m.at) continue
      const pop = Math.min(1, (it.progress - m.at) / 0.08)
      const sz = minWH * 0.05 * (m.scale || 1) * pop
      const bob = Math.sin(it.phase * 1.8 + m.x * 8) * sz * 0.12
      ctx.font = `${sz}px ${GLYPH_FONT}`
      ctx.fillStyle = it.color
      ctx.fillText(m.ch, mapX(m.x), mapY(m.y) + bob)
    }
    // 描完后：一个高光沿首笔画游走，制造持续动感
    if (it.progress >= 1 && it.strokes[0]) {
      const s = it.strokes[0]
      const f = (it.t * 0.25 * this.speed) % 1
      const idx = Math.floor(f * (s.length - 1))
      const gx = mapX(s[idx].x), gy = mapY(s[idx].y)
      ctx.shadowBlur = minWH * 0.02
      ctx.fillStyle = it.color
      ctx.globalAlpha = 0.9
      ctx.beginPath(); ctx.arc(gx, gy, ctx.lineWidth * 1.4, 0, 6.28); ctx.fill()
    }
    ctx.restore()
  }
}

export const DOODLE_GLYPHS = GLYPHS
