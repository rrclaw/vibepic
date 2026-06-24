import './style.css'
import { Keywords } from './modules/keywords.js'
import { renderAscii, clearAscii } from './modules/ascii.js'
import { Effects } from './modules/effects.js'
import { exportPNG, exportWebM, download } from './modules/exporter.js'

// ---------- refs ----------
const $ = (s) => document.querySelector(s)
const stageWrap = $('#stage-wrap')
const stageEmpty = $('#stage-empty')
const stage = $('#stage')
const baseCanvas = $('#canvas-base')
const asciiCanvas = $('#canvas-ascii')
const fxCanvas = $('#canvas-fx')
const labelsLayer = $('#layer-labels')
const regionBox = $('#region-box')
const fileInput = $('#file-input')
const toastEl = $('#toast')

// ---------- state ----------
const state = {
  img: null,
  natW: 0, natH: 0,
  dispW: 0, dispH: 0,
  hasAscii: false,
  region: null,        // natural-pixel region for ascii
  asciiOpts: { density: 90, charset: 'blocks', colorMode: 'sampled', monoColor: '#eafff2', opacity: 100, bg: 'transparent', scope: 'region' },
  exportScale: 1,
  recDur: 5,
}

const keywords = new Keywords(labelsLayer)
const effects = new Effects()
let previewPaused = false

// ---------- toast ----------
let toastT
function toast(msg) {
  toastEl.textContent = msg
  toastEl.hidden = false
  clearTimeout(toastT)
  toastT = setTimeout(() => (toastEl.hidden = true), 2200)
}

// ---------- image loading ----------
// 把已 decode 的位图(ImageBitmap / HTMLImageElement)落到画布
function mountBitmap(bmp, w, h) {
  state.img = bmp
  state.natW = w
  state.natH = h
  baseCanvas.width = w
  baseCanvas.height = h
  baseCanvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
  asciiCanvas.width = w
  asciiCanvas.height = h
  state.hasAscii = false
  clearAscii(asciiCanvas)
  keywords.clearAll()
  state.region = null
  regionBox.hidden = true
  layout()
  stageEmpty.hidden = true
  stage.hidden = false
  toast('照片已载入 ✦ 试试「智能识别关键词」')
}

// 从 URL（dataURL / blobURL）载入，走 <img>，自动处理 EXIF 朝向
function loadImage(src) {
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => mountBitmap(img, img.naturalWidth, img.naturalHeight)
  img.onerror = () => toast('图片加载失败：该 URL 无法解码')
  img.src = src
}

// 健壮的 File 载入：识别 HEIC 自动转码，其它格式直接解，错误如实回报
async function loadFile(file) {
  if (!file) return
  const name = (file.name || '').toLowerCase()
  const isHeic = /image\/heic|image\/heif/.test(file.type) || /\.(heic|heif)$/.test(name)
  try {
    if (isHeic) {
      toast('检测到 HEIC，正在转码…')
      const heic2any = (await import('heic2any')).default
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
      const jpegBlob = Array.isArray(out) ? out[0] : out
      loadImage(URL.createObjectURL(jpegBlob))
      return
    }
    // 优先 createImageBitmap（带 EXIF 朝向校正），失败回退 <img>
    if ('createImageBitmap' in window) {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
        mountBitmap(bmp, bmp.width, bmp.height)
        return
      } catch (_) { /* 回退 */ }
    }
    loadImage(URL.createObjectURL(file))
  } catch (err) {
    console.error('[vibepic] load failed', err)
    const hint = isHeic
      ? 'HEIC 转码失败，请在手机相册导出为 JPG 再传'
      : `无法读取该图片（${file.type || '未知格式'}）`
    toast('图片加载失败：' + hint)
  }
}

function layout() {
  if (!state.img) return
  const pad = 56
  const availW = stageWrap.clientWidth - pad
  const availH = stageWrap.clientHeight - pad
  const ratio = state.natW / state.natH
  let w = availW, h = w / ratio
  if (h > availH) { h = availH; w = h * ratio }
  state.dispW = Math.round(w)
  state.dispH = Math.round(h)
  stage.style.width = w + 'px'
  stage.style.height = h + 'px'
  for (const c of [baseCanvas, asciiCanvas, fxCanvas]) {
    c.style.width = w + 'px'
    c.style.height = h + 'px'
  }
  // fx canvas 用显示分辨率（性能）
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  fxCanvas.width = Math.round(w * dpr)
  fxCanvas.height = Math.round(h * dpr)
}
window.addEventListener('resize', layout)

// fontScale: 自然分辨率 / 显示宽度（标签字号在显示坐标系里设定）
function fontScale() { return state.dispW ? state.natW / state.dispW : 1 }

// ---------- preview animation loop ----------
let last = performance.now()
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const ctx = fxCanvas.getContext('2d')
  ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height)
  if (!previewPaused && !effects.isEmpty) {
    effects.update(dt)
    effects.draw(ctx, fxCanvas.width, fxCanvas.height)
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// ================= UPLOAD =================
function pickFile() { fileInput.click() }
$('#btn-upload').addEventListener('click', pickFile)
$('#btn-upload-2').addEventListener('click', pickFile)
fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0]
  if (!f) return
  loadFile(f)
  e.target.value = '' // 允许重复选同一文件
})
$('#btn-sample').addEventListener('click', () => {
  loadImage(makeSample())
})
$('#btn-reset').addEventListener('click', () => {
  keywords.clearAll(); clearAscii(asciiCanvas); state.hasAscii = false
  effects.clear(); document.querySelectorAll('.fx-card').forEach((c) => c.classList.remove('active'))
  toast('已清空图层')
})

// drag & drop
stageWrap.addEventListener('dragover', (e) => { e.preventDefault() })
stageWrap.addEventListener('drop', (e) => {
  e.preventDefault()
  const f = e.dataTransfer.files[0]
  if (f) loadFile(f)  // HEIC 的 type 可能为空，交给 loadFile 按扩展名判断
})

// 生成一张示例渐变图（无网络依赖）
function makeSample() {
  const c = document.createElement('canvas')
  c.width = 1080; c.height = 1350
  const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 1080, 1350)
  g.addColorStop(0, '#bfe3c6'); g.addColorStop(0.5, '#e8f0d4'); g.addColorStop(1, '#cfe0f0')
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1350)
  // 一些柔和圆
  for (let i = 0; i < 40; i++) {
    x.globalAlpha = 0.06 + Math.random() * 0.1
    x.fillStyle = ['#9bc7a0', '#f3c6d0', '#fff0b8', '#a9cdee'][i % 4]
    x.beginPath()
    x.arc(Math.random() * 1080, Math.random() * 1350, 40 + Math.random() * 160, 0, 6.28)
    x.fill()
  }
  x.globalAlpha = 1
  x.fillStyle = 'rgba(255,255,255,0.5)'
  x.font = "italic 60px 'DM Serif Display', serif"
  x.fillText('a quiet afternoon', 90, 700)
  return c.toDataURL()
}

// ================= TABS =================
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'))
    document.querySelectorAll('.tab-pane').forEach((x) => x.classList.remove('active'))
    t.classList.add('active')
    $(`.tab-pane[data-pane="${t.dataset.tab}"]`).classList.add('active')
    updateRegionMode()
  })
})

// segmented helper
function seg(containerSel, attr, cb) {
  const cont = $(containerSel)
  cont.querySelectorAll('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      cont.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      cb(b.dataset[attr])
    })
  })
}

// ================= KEYWORDS =================
$('#btn-detect').addEventListener('click', async () => {
  if (!state.img) return toast('先上传一张照片')
  const status = $('#detect-status')
  try {
    await keywords.detect(baseCanvas, $('#kw-theme').value, (m) => (status.textContent = m))
  } catch (err) {
    console.error(err)
    status.textContent = '识别失败：' + (err?.message || err)
  }
})
$('#kw-add').addEventListener('click', () => addManualWord())
$('#kw-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualWord() })
function addManualWord() {
  const v = $('#kw-input').value.trim()
  if (!v) return
  if (!state.img) return toast('先上传一张照片')
  keywords.add(v, 0.5, 0.5)
  $('#kw-input').value = ''
}
seg('#kw-font', 'font', (v) => keywords.setStyle({ font: v }))
seg('#kw-bracket', 'bracket', (v) => keywords.setStyle({ bracket: v }))
$('#kw-size').addEventListener('input', (e) => {
  $('#kw-size-val').textContent = e.target.value
  keywords.setStyle({ size: +e.target.value })
})
$('#kw-color').addEventListener('input', (e) => keywords.setStyle({ color: e.target.value }))

// ================= ASCII =================
seg('#ascii-scope', 'scope', (v) => { state.asciiOpts.scope = v; updateRegionMode() })
seg('#ascii-color', 'acolor', (v) => (state.asciiOpts.colorMode = v))
seg('#ascii-bg', 'abg', (v) => (state.asciiOpts.bg = v))
$('#ascii-density').addEventListener('input', (e) => {
  state.asciiOpts.density = +e.target.value
  $('#ascii-density-val').textContent = e.target.value
})
$('#ascii-charset').addEventListener('change', (e) => (state.asciiOpts.charset = e.target.value))
$('#ascii-mono-color').addEventListener('input', (e) => (state.asciiOpts.monoColor = e.target.value))
$('#ascii-opacity').addEventListener('input', (e) => {
  state.asciiOpts.opacity = +e.target.value
  $('#ascii-opacity-val').textContent = e.target.value
})
$('#btn-ascii-apply').addEventListener('click', () => {
  if (!state.img) return toast('先上传一张照片')
  let region = null
  if (state.asciiOpts.scope === 'region') {
    if (!state.region) return toast('先在画面上拖一个矩形框选区域')
    region = state.region
  }
  renderAscii(baseCanvas, asciiCanvas, { ...state.asciiOpts, region })
  state.hasAscii = true
  toast('ASCII 已生成 ✦')
})
$('#btn-ascii-clear').addEventListener('click', () => {
  clearAscii(asciiCanvas); state.hasAscii = false; toast('已清除 ASCII 图层')
})

// ----- region selection -----
let regionMode = false
function updateRegionMode() {
  const asciiActive = $('.tab.active')?.dataset.tab === 'ascii'
  regionMode = asciiActive && state.asciiOpts.scope === 'region'
  labelsLayer.style.pointerEvents = regionMode ? 'none' : 'auto'
  stage.style.cursor = regionMode ? 'crosshair' : 'default'
}
updateRegionMode()

let regStart = null
stage.addEventListener('pointerdown', (e) => {
  if (!regionMode || !state.img) return
  const rect = stage.getBoundingClientRect()
  regStart = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  regionBox.hidden = false
  regionBox.style.left = regStart.x + 'px'
  regionBox.style.top = regStart.y + 'px'
  regionBox.style.width = '0px'
  regionBox.style.height = '0px'
  stage.setPointerCapture(e.pointerId)
})
stage.addEventListener('pointermove', (e) => {
  if (!regStart) return
  const rect = stage.getBoundingClientRect()
  const cx = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const cy = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  const x = Math.min(cx, regStart.x), y = Math.min(cy, regStart.y)
  const w = Math.abs(cx - regStart.x), h = Math.abs(cy - regStart.y)
  regionBox.style.left = x + 'px'; regionBox.style.top = y + 'px'
  regionBox.style.width = w + 'px'; regionBox.style.height = h + 'px'
})
stage.addEventListener('pointerup', (e) => {
  if (!regStart) return
  const rect = stage.getBoundingClientRect()
  const cx = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const cy = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  const x = Math.min(cx, regStart.x), y = Math.min(cy, regStart.y)
  const w = Math.abs(cx - regStart.x), h = Math.abs(cy - regStart.y)
  regStart = null
  if (w < 8 || h < 8) { regionBox.hidden = true; state.region = null; return }
  const s = fontScale() // natural / display
  state.region = { x: Math.round(x * s), y: Math.round(y * s), w: Math.round(w * s), h: Math.round(h * s) }
})

// ================= EFFECTS =================
document.querySelectorAll('.fx-card').forEach((card) => {
  card.addEventListener('click', () => {
    const type = card.dataset.fx
    effects.toggle(type)
    card.classList.toggle('active', effects.has(type))
  })
})
$('#fx-amount').addEventListener('input', (e) => {
  $('#fx-amount-val').textContent = e.target.value
  effects.setAmount(+e.target.value)
})
$('#fx-speed').addEventListener('input', (e) => {
  $('#fx-speed-val').textContent = e.target.value
  effects.speed = +e.target.value / 100
})
$('#fx-color').addEventListener('input', (e) => (effects.color = e.target.value))
$('#btn-fx-clear').addEventListener('click', () => {
  effects.clear()
  document.querySelectorAll('.fx-card').forEach((c) => c.classList.remove('active'))
})

// ================= EXPORT =================
seg('#export-scale', 'scale', (v) => (state.exportScale = +v))
$('#rec-dur').addEventListener('input', (e) => {
  state.recDur = +e.target.value
  $('#rec-dur-val').textContent = e.target.value
})
$('#btn-export-png').addEventListener('click', async () => {
  if (!state.img) return toast('先上传一张照片')
  const blob = await exportPNG({
    base: baseCanvas, ascii: asciiCanvas, hasAscii: state.hasAscii,
    effects, labels: keywords.getExportLabels(), fontScale: fontScale(), scale: state.exportScale,
  })
  download(blob, `vibepic-${Date.now()}.png`)
  toast('PNG 已导出 ✦')
})
$('#btn-export-webm').addEventListener('click', async () => {
  if (!state.img) return toast('先上传一张照片')
  if (effects.isEmpty) return toast('先在「动效」里加一个动效再录制')
  const status = $('#export-status')
  previewPaused = true
  status.textContent = '录制中… 0%'
  try {
    const blob = await exportWebM({
      base: baseCanvas, ascii: asciiCanvas, hasAscii: state.hasAscii,
      effects, labels: keywords.getExportLabels(), fontScale: fontScale(),
      scale: state.exportScale, duration: state.recDur,
      onTick: (p) => (status.textContent = `录制中… ${Math.round(p * 100)}%`),
    })
    download(blob, `vibepic-${Date.now()}.webm`)
    status.textContent = 'WebM 已导出 ✦'
    toast('动画已导出 ✦')
  } catch (err) {
    console.error(err); status.textContent = '录制失败：' + (err?.message || err)
  } finally {
    previewPaused = false
  }
})
