// 关键词标注：COCO-SSD 识别 → 氛围词；DOM 标签可拖动/改字/删除；导出时按归一化坐标重绘。
import { ambientWords, resetUsed, pickWord, contentWords, colorWords, moodWord, THEME_POOLS } from './vibeWords.js'

let cocoModel = null
let modelLoading = null
let mobilenetModel = null
let mnLoading = null

async function loadModel(onProgress) {
  if (cocoModel) return cocoModel
  if (modelLoading) return modelLoading
  modelLoading = (async () => {
    onProgress?.('加载识别模型…（首次约几 MB）')
    await import('@tensorflow/tfjs')
    const cocoSsd = await import('@tensorflow-models/coco-ssd')
    cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
    return cocoModel
  })()
  return modelLoading
}

// MobileNet 1000 类图像分类器：给「画面是什么」的内容词（ice cream / seashore / daisy…）
async function loadMobilenet(onProgress) {
  if (mobilenetModel) return mobilenetModel
  if (mnLoading) return mnLoading
  mnLoading = (async () => {
    onProgress?.('加载内容识别模型…（首次约几 MB）')
    await import('@tensorflow/tfjs')
    const mobilenet = await import('@tensorflow-models/mobilenet')
    mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 })
    return mobilenetModel
  })()
  return mnLoading
}

export class Keywords {
  constructor(layerEl) {
    this.layer = layerEl
    this.labels = []
    this.selected = null
    this.idc = 0
    this.lastClasses = []   // 最近一次识别到的物体类别，供「自动联想形状」用
    this.style = { font: 'mono', bracket: 'round', size: 28, color: '#ffffff' }
    this._bindLayer()
  }

  _bindLayer() {
    // 点空白处取消选中
    this.layer.addEventListener('pointerdown', (e) => {
      if (e.target === this.layer) this.select(null)
    })
  }

  setStyle(patch) {
    Object.assign(this.style, patch)
    if (this.selected) {
      Object.assign(this.selected, patch)
      this._renderLabel(this.selected)
    }
  }

  // bracket 包裹
  _wrap(text) {
    const b = this.style.bracket
    if (this.selected && this.selected._tmp) {} // no-op
    return text
  }

  add(text, xN = 0.5, yN = 0.5, styleOverride = {}) {
    const lab = {
      id: ++this.idc, text, xN, yN,
      font: this.style.font, bracket: this.style.bracket,
      size: this.style.size, color: this.style.color,
      ...styleOverride,
    }
    this.labels.push(lab)
    this._mount(lab)
    return lab
  }

  _format(lab) {
    if (lab.bracket === 'round') return `（${lab.text}）`.replace('（', '(').replace('）', ')')
    if (lab.bracket === 'square') return `[${lab.text}]`
    return lab.text
  }

  _mount(lab) {
    const el = document.createElement('div')
    el.className = `kw-label font-${lab.font}`
    lab.el = el
    this._renderLabel(lab)
    this.layer.appendChild(el)
    this._makeDraggable(lab)
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); this._editInline(lab) })
  }

  _renderLabel(lab) {
    const el = lab.el
    if (!el) return
    el.className = `kw-label font-${lab.font}` + (this.selected === lab ? ' selected' : '')
    el.style.left = lab.xN * 100 + '%'
    el.style.top = lab.yN * 100 + '%'
    el.style.fontSize = lab.size + 'px'
    el.style.color = lab.color
    el.innerHTML = ''
    const txt = document.createElement('span')
    txt.textContent = this._format(lab)
    el.appendChild(txt)
    const del = document.createElement('div')
    del.className = 'kw-del'
    del.textContent = '×'
    del.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.remove(lab) })
    el.appendChild(del)
  }

  _makeDraggable(lab) {
    const el = lab.el
    el.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('kw-del')) return
      e.preventDefault()
      this.select(lab)
      const rect = this.layer.getBoundingClientRect()
      el.setPointerCapture(e.pointerId)
      el.classList.add('dragging')
      const move = (ev) => {
        lab.xN = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
        lab.yN = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
        el.style.left = lab.xN * 100 + '%'
        el.style.top = lab.yN * 100 + '%'
      }
      const up = (ev) => {
        el.releasePointerCapture(e.pointerId)
        el.classList.remove('dragging')
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
    })
  }

  _editInline(lab) {
    const cur = lab.text
    const v = prompt('编辑关键词', cur)
    if (v != null && v.trim()) { lab.text = v.trim(); this._renderLabel(lab) }
  }

  select(lab) {
    if (this.selected && this.selected.el) this.selected.el.classList.remove('selected')
    this.selected = lab
    if (lab && lab.el) lab.el.classList.add('selected')
  }

  remove(lab) {
    lab.el?.remove()
    this.labels = this.labels.filter((l) => l !== lab)
    if (this.selected === lab) this.selected = null
  }

  clearAll() {
    for (const l of this.labels) l.el?.remove()
    this.labels = []
    this.selected = null
  }

  // 识别并标注。关键词来源优先级：画面内容(MobileNet 1000 类) > 人物 > 画面颜色 > 氛围。
  async detect(baseCanvas, theme, onStatus) {
    resetUsed()
    onStatus?.('识别画面内容…')

    // 并行跑 内容分类(MobileNet) + 物体检测(COCO，给文字落点)；任一失败都不致命
    let preds = [], classes = []
    try {
      const [coco, mn] = await Promise.all([loadModel(onStatus), loadMobilenet(onStatus)])
      onStatus?.('识别中…')
      const out = await Promise.all([coco.detect(baseCanvas, 20, 0.4), mn.classify(baseCanvas, 6)])
      preds = out[0] || []; classes = out[1] || []
    } catch (e) {
      console.warn('[vibepic] 双模型识别失败，尝试仅 COCO', e)
      try { const coco = await loadModel(onStatus); preds = await coco.detect(baseCanvas, 20, 0.4) } catch (_) {}
    }
    this.lastClasses = preds.map((p) => p.class)

    const avg = avgColor(baseCanvas)
    // 候选词，按优先级排序、去重
    const ordered = []
    const push = (w) => { if (w && !ordered.includes(w)) ordered.push(w) }
    contentWords(classes, 6).forEach(push)                 // 1) 真正按画面的内容词
    if (preds.some((p) => p.class === 'person')) push(pickWord(['girl', 'you', 'her', 'us', 'soul'], 0)) // 2) 人物
    colorWords(avg).slice(0, 3).forEach(push)              // 3) 画面颜色词
    push(moodWord(avg))                                    // 4) 一个氛围词
    // 用户在下拉里选了具体主题 → 末尾补两个主题词
    if (theme && theme !== 'auto' && THEME_POOLS[theme]) THEME_POOLS[theme].slice(0, 3).forEach(push)
    // 兜底：还不足就补氛围词（最后手段）
    if (ordered.length < 6) ambientWords(theme, [], 8).forEach(push)

    const W = baseCanvas.width, H = baseCanvas.height
    const target = Math.max(6, Math.min(9, ordered.length))
    const placed = []
    let wi = 0

    // 先把前几个词放到检测框上（贴着画面主体）
    for (const p of preds) {
      if (wi >= ordered.length || placed.length >= target) break
      const [x, y, w] = p.bbox
      let cx = (x + w / 2) / W, cy = y / H - 0.02
      cx = Math.max(0.08, Math.min(0.92, cx)); cy = Math.max(0.06, Math.min(0.92, cy))
      for (const q of placed) if (Math.abs(q.xN - cx) < 0.1 && Math.abs(q.yN - cy) < 0.06) cy += 0.08
      placed.push(this.add(ordered[wi++], cx, Math.min(0.93, cy)))
    }
    // 其余散点铺开
    const grid = [
      [0.16, 0.16], [0.5, 0.12], [0.84, 0.17], [0.12, 0.42], [0.88, 0.4],
      [0.2, 0.7], [0.5, 0.8], [0.8, 0.72], [0.34, 0.5], [0.66, 0.52], [0.5, 0.32],
    ]
    let gi = 0
    while (placed.length < target && wi < ordered.length) {
      let spot = null
      for (let t = 0; t < grid.length; t++) {
        const c = grid[(gi++) % grid.length]
        if (!placed.some((q) => Math.abs(q.xN - c[0]) < 0.12 && Math.abs(q.yN - c[1]) < 0.07)) { spot = c; break }
      }
      if (!spot) spot = grid[(gi++) % grid.length]
      placed.push(this.add(ordered[wi++], spot[0], spot[1]))
    }

    onStatus?.(classes.length
      ? `按画面内容撒了 ${placed.length} 个关键词 ✦ 可拖动/改字/删除`
      : `撒了 ${placed.length} 个关键词 ✦ 可拖动/改字/删除`)
    return placed.length
  }

  // 导出用：返回归一化标签 + 格式化文本
  getExportLabels() {
    return this.labels.map((l) => ({
      text: this._format(l), xN: l.xN, yN: l.yN,
      font: l.font, size: l.size, color: l.color,
    }))
  }
}

function avgColor(canvas) {
  const ctx = canvas.getContext('2d')
  const sw = 40, sh = 40
  const tmp = document.createElement('canvas')
  tmp.width = sw; tmp.height = sh
  const tctx = tmp.getContext('2d')
  tctx.drawImage(canvas, 0, 0, sw, sh)
  const d = tctx.getImageData(0, 0, sw, sh).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
  return { r: r / n, g: g / n, b: b / n }
}

export const FONT_CSS = {
  mono: "'Space Mono', monospace",
  sans: "600 1em 'Inter', sans-serif",
  serif: "'DM Serif Display', serif",
  script: "700 1em 'Caveat', cursive",
}
