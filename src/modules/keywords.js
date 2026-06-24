// 关键词标注：COCO-SSD 识别 → 氛围词；DOM 标签可拖动/改字/删除；导出时按归一化坐标重绘。
import { wordForDetection, ambientWords, colorVibes, resetUsed } from './vibeWords.js'

let cocoModel = null
let modelLoading = null

async function loadModel(onProgress) {
  if (cocoModel) return cocoModel
  if (modelLoading) return modelLoading
  modelLoading = (async () => {
    onProgress?.('加载识别模型…（首次约几 MB）')
    await import('@tensorflow/tfjs')
    const cocoSsd = await import('@tensorflow-models/coco-ssd')
    onProgress?.('初始化模型…')
    cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
    return cocoModel
  })()
  return modelLoading
}

export class Keywords {
  constructor(layerEl) {
    this.layer = layerEl
    this.labels = []
    this.selected = null
    this.idc = 0
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

  // 识别并标注
  async detect(baseCanvas, theme, onStatus) {
    resetUsed()
    const model = await loadModel(onStatus)
    onStatus?.('识别中…')
    const preds = await model.detect(baseCanvas, 20, 0.45)

    // 取平均色推断氛围词池
    const colorPool = colorVibes(avgColor(baseCanvas))

    const W = baseCanvas.width, H = baseCanvas.height
    const placed = []
    let idx = 0
    for (const p of preds) {
      const [x, y, w, h] = p.bbox
      const word = wordForDetection(p.class, theme, colorPool, idx++)
      if (!word) continue
      // 放在框的上方居中，避开太靠边
      let cx = (x + w / 2) / W
      let cy = (y) / H - 0.02
      cx = Math.max(0.06, Math.min(0.94, cx))
      cy = Math.max(0.05, Math.min(0.95, cy))
      // 简单避让已放置的
      for (const q of placed) {
        if (Math.abs(q.xN - cx) < 0.1 && Math.abs(q.yN - cy) < 0.06) cy += 0.08
      }
      const lab = this.add(word, cx, Math.min(0.95, cy))
      placed.push(lab)
    }

    // 没识别到物体 → 撒氛围词
    if (placed.length === 0) {
      const words = ambientWords(theme, colorPool, 5)
      const spots = [[0.2, 0.18], [0.72, 0.22], [0.3, 0.7], [0.78, 0.66], [0.5, 0.42]]
      words.forEach((w, i) => this.add(w, spots[i][0], spots[i][1]))
      onStatus?.(`未识别到明确物体，撒了 ${words.length} 个氛围词 ✦`)
      return 0
    }
    onStatus?.(`识别到 ${placed.length} 处，已标注 ✦ 可拖动微调`)
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
