import './style.css'
import { Keywords } from './modules/keywords.js'
import { renderAscii, clearAscii } from './modules/ascii.js'
import { Effects } from './modules/effects.js'
import { Doodles } from './modules/doodles.js'
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
  region: null,           // natural-pixel region for ascii mask
  asciiRegionNorm: null,  // normalized [0,1] rect for box display
  asciiOpts: { mode: 'highlight', threshold: 0.6, density: 100, charset: 'sparkle', colorMode: 'mono', monoColor: '#ffffff', opacity: 100, bg: 'transparent', scope: 'full' },
  exportScale: 1,
  recDur: 5,
}

const keywords = new Keywords(labelsLayer)
const effects = new Effects()
const doodles = new Doodles()
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
  // 上传后自动生成一套默认设计（关键词+ASCII+动效+装饰），用户再微调
  autoDesign()
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
  const W = fxCanvas.width, H = fxCanvas.height
  if (!previewPaused) { effects.update(dt); doodles.update(dt) }
  effects.draw(ctx, W, H)
  doodles.draw(ctx, W, H)
  if (inDoodleTab()) doodles.drawSelection(ctx, W, H)
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
  state.region = null; state.asciiRegionNorm = null; regionBox.hidden = true
  effects.clear(); document.querySelectorAll('.fx-card').forEach((c) => c.classList.remove('active'))
  if (typeof refreshFxRegionUI === 'function') refreshFxRegionUI()
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

// ================= 一键设计 =================
const _rand = (a, b) => a + Math.random() * (b - a)
const _pick = (arr) => arr[(Math.random() * arr.length) | 0]
function _sample(arr, n) {
  const a = [...arr]; const out = []
  while (a.length && out.length < n) out.push(a.splice((Math.random() * a.length) | 0, 1)[0])
  return out
}
function _avgColor(canvas) {
  const t = document.createElement('canvas'); t.width = 40; t.height = 40
  const c = t.getContext('2d'); c.drawImage(canvas, 0, 0, 40, 40)
  const d = c.getImageData(0, 0, 40, 40).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
  return { r: r / n, g: g / n, b: b / n }
}
function _tone({ r, g, b }) {
  const bright = (r + g + b) / 3
  if (g > r + 8 && g > b + 8) return 'fresh'
  if (b > r + 8 && b >= g - 4) return 'calm'
  if (r > 150 && b > 130 && g < r - 10) return 'blush'
  if (r > 140 && g > 110 && b < 120) return 'warm'
  return bright > 150 ? 'fresh' : 'calm'
}
const TONE = {
  fresh: { theme: 'fresh', fxColor: '#eafff2', fx: ['petals', 'sparkle', 'clover', 'twinkle'], glyphs: ['flower1', 'flower2', 'spark', 'note1'], ddColor: '#ffffff' },
  calm: { theme: 'calm', fxColor: '#e3f1ff', fx: ['sparkle', 'snow', 'twinkle', 'bloom'], glyphs: ['spark', 'star', 'note2', 'heart'], ddColor: '#ffffff' },
  warm: { theme: 'romance', fxColor: '#ffe7c2', fx: ['notes', 'sparkle', 'hearts', 'fireworks'], glyphs: ['note1', 'note2', 'clef', 'spark'], ddColor: '#e0a64b' },
  blush: { theme: 'romance', fxColor: '#ffd9e6', fx: ['hearts', 'petals', 'sparkle', 'bloom'], glyphs: ['heart', 'flower1', 'spark', 'note3'], ddColor: '#ffffff' },
}
function _setSeg(sel, attr, val) {
  $(sel)?.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset[attr] === val))
}
function _syncAsciiUI() {
  const o = state.asciiOpts
  _setSeg('#ascii-mode', 'mode', o.mode)
  $('#ascii-thr-field').style.display = o.mode === 'highlight' ? '' : 'none'
  $('#ascii-thr').value = Math.round(o.threshold * 100); $('#ascii-thr-val').textContent = o.threshold.toFixed(2)
  $('#ascii-density').value = o.density; $('#ascii-density-val').textContent = o.density
  $('#ascii-charset').value = o.charset
  _setSeg('#ascii-color', 'acolor', o.colorMode); $('#ascii-mono-color').value = o.monoColor
  _setSeg('#ascii-scope', 'scope', o.scope)
}

async function autoDesign() {
  if (!state.img) return toast('先上传一张照片')
  // 清掉旧图层（换一版从干净开始）
  keywords.clearAll(); clearAscii(asciiCanvas); state.hasAscii = false
  state.region = null; state.asciiRegionNorm = null; regionBox.hidden = true
  effects.clear(); doodles.clear()
  document.querySelectorAll('#fx-grid .fx-card').forEach((c) => c.classList.remove('active'))

  const tone = _tone(_avgColor(baseCanvas))
  const T = TONE[tone]

  // 1) ASCII：整图高光散点
  state.asciiOpts = {
    mode: 'highlight', threshold: +_rand(0.6, 0.74).toFixed(2),
    density: _pick([90, 110, 130]), charset: _pick(['sparkle', 'arrows', 'star']),
    colorMode: 'mono', monoColor: '#ffffff', opacity: 100, bg: 'transparent', scope: 'full',
  }
  renderAscii(baseCanvas, asciiCanvas, { ...state.asciiOpts, region: null })
  state.hasAscii = true
  _syncAsciiUI()

  // 2) 动效：按色调挑 1~2 个，中等密度
  effects.color = T.fxColor
  const chosenFx = _sample(T.fx, 1 + ((Math.random() < 0.6) ? 1 : 0))
  const amt = 38
  $('#fx-amount').value = amt; $('#fx-amount-val').textContent = amt
  effects.amount = amt
  for (const t of chosenFx) {
    effects.add(t)
    document.querySelector(`#fx-grid .fx-card[data-fx="${t}"]`)?.classList.add('active')
  }
  $('#fx-color').value = T.fxColor
  refreshFxRegionUI()

  // 3) 装饰：撒几个音符/花朵贴纸
  doodles.color = T.ddColor
  _setSeg('#dd-preset', 'ddcol', T.ddColor === '#e0a64b' ? '#e0a64b' : '#ffffff')
  $('#dd-color').value = T.ddColor
  const spots = _sample([[0.18, 0.2], [0.82, 0.24], [0.26, 0.72], [0.78, 0.68], [0.5, 0.16], [0.62, 0.5]], 2 + ((Math.random() * 2) | 0))
  const gl = _sample(T.glyphs, spots.length)
  spots.forEach((s, i) => doodles.addGlyph(gl[i] || 'spark', s[0], s[1]))
  doodles.selected = null
  syncDoodleScale()

  toast('已生成默认设计 ✦ 各 tab 里逐层微调')

  // 4) 关键词识别（异步，最后跑，避免卡住前面的即时效果）
  $('#detect-status').textContent = ''
  try {
    await keywords.detect(baseCanvas, T.theme, (m) => ($('#detect-status').textContent = m))
  } catch (err) {
    console.error(err); $('#detect-status').textContent = '关键词识别失败：' + (err?.message || err)
  }
}
$('#btn-auto').addEventListener('click', autoDesign)

// ================= TABS =================
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'))
    document.querySelectorAll('.tab-pane').forEach((x) => x.classList.remove('active'))
    t.classList.add('active')
    $(`.tab-pane[data-pane="${t.dataset.tab}"]`).classList.add('active')
    // 离开 ASCII tab 时收起遮罩框
    if (t.dataset.tab !== 'ascii') regionBox.hidden = true
    else if (state.asciiOpts.scope === 'region' && state.asciiRegionNorm) showBoxFromNorm(state.asciiRegionNorm)
    syncLabelsPE()
    stage.style.cursor = t.dataset.tab === 'doodle' ? 'crosshair' : 'default'
  })
})

// 装饰 tab 时关闭关键词标签的指针事件，让画布接收装饰拖拽；其它 tab 恢复
function syncLabelsPE() {
  if (regionDraw.active) { labelsLayer.style.pointerEvents = 'none'; return }
  labelsLayer.style.pointerEvents = $('.tab.active')?.dataset.tab === 'doodle' ? 'none' : 'auto'
}

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

// ================= 通用区域框选（一次性） =================
// onDone 收到归一化矩形 {x,y,w,h}（相对 stage，0..1）；w/h 太小视为取消返回 null。
let regionDraw = { active: false, cb: null, start: null }
function beginRegionDraw(cb) {
  if (!state.img) return toast('先上传一张照片')
  regionDraw = { active: true, cb, start: null }
  labelsLayer.style.pointerEvents = 'none'
  stage.style.cursor = 'crosshair'
  toast('在画面上拖一个矩形（松手完成）')
}
function showBoxFromNorm(norm) {
  if (!norm) { regionBox.hidden = true; return }
  const r = stage.getBoundingClientRect()
  regionBox.hidden = false
  regionBox.style.left = norm.x * r.width + 'px'
  regionBox.style.top = norm.y * r.height + 'px'
  regionBox.style.width = norm.w * r.width + 'px'
  regionBox.style.height = norm.h * r.height + 'px'
}
stage.addEventListener('pointerdown', (e) => {
  if (!regionDraw.active) return
  const rect = stage.getBoundingClientRect()
  regionDraw.start = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  regionBox.hidden = false
  regionBox.style.left = regionDraw.start.x + 'px'
  regionBox.style.top = regionDraw.start.y + 'px'
  regionBox.style.width = '0px'; regionBox.style.height = '0px'
  stage.setPointerCapture(e.pointerId)
})
stage.addEventListener('pointermove', (e) => {
  if (!regionDraw.active || !regionDraw.start) return
  const rect = stage.getBoundingClientRect()
  const cx = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const cy = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  const x = Math.min(cx, regionDraw.start.x), y = Math.min(cy, regionDraw.start.y)
  regionBox.style.left = x + 'px'; regionBox.style.top = y + 'px'
  regionBox.style.width = Math.abs(cx - regionDraw.start.x) + 'px'
  regionBox.style.height = Math.abs(cy - regionDraw.start.y) + 'px'
})
stage.addEventListener('pointerup', (e) => {
  if (!regionDraw.active || !regionDraw.start) return
  const rect = stage.getBoundingClientRect()
  const cx = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const cy = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  const x = Math.min(cx, regionDraw.start.x), y = Math.min(cy, regionDraw.start.y)
  const w = Math.abs(cx - regionDraw.start.x), h = Math.abs(cy - regionDraw.start.y)
  const cb = regionDraw.cb
  regionDraw = { active: false, cb: null, start: null }
  stage.style.cursor = inDoodleTab() ? 'crosshair' : 'default'
  syncLabelsPE()
  if (w < 8 || h < 8) { regionBox.hidden = true; cb?.(null); return }
  cb?.({ x: x / rect.width, y: y / rect.height, w: w / rect.width, h: h / rect.height })
})

// ================= ASCII =================
seg('#ascii-mode', 'mode', (v) => {
  state.asciiOpts.mode = v
  $('#ascii-thr-field').style.display = v === 'highlight' ? '' : 'none'
})
seg('#ascii-scope', 'scope', (v) => {
  state.asciiOpts.scope = v
  if (v === 'region') {
    beginRegionDraw((norm) => {
      if (!norm) { // 取消 → 回退整图
        state.region = null; state.asciiRegionNorm = null
        document.querySelector('#ascii-scope .seg-btn[data-scope="full"]').click()
        return
      }
      state.asciiRegionNorm = norm
      state.region = {
        x: Math.round(norm.x * state.natW), y: Math.round(norm.y * state.natH),
        w: Math.round(norm.w * state.natW), h: Math.round(norm.h * state.natH),
      }
      showBoxFromNorm(norm)
      toast('遮罩已框定，点「生成 ASCII」')
    })
  } else {
    regionBox.hidden = true
  }
})
seg('#ascii-color', 'acolor', (v) => (state.asciiOpts.colorMode = v))
seg('#ascii-bg', 'abg', (v) => (state.asciiOpts.bg = v))
$('#ascii-thr').addEventListener('input', (e) => {
  state.asciiOpts.threshold = +e.target.value / 100
  $('#ascii-thr-val').textContent = (state.asciiOpts.threshold).toFixed(2)
})
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
    if (!state.region) return toast('先框选一个遮罩区域')
    region = state.region
  }
  renderAscii(baseCanvas, asciiCanvas, { ...state.asciiOpts, region })
  state.hasAscii = true
  toast('ASCII 已生成 ✦')
})
$('#btn-ascii-clear').addEventListener('click', () => {
  clearAscii(asciiCanvas); state.hasAscii = false; toast('已清除 ASCII 图层')
})

// ================= EFFECTS =================
function refreshFxRegionUI() {
  const list = effects.list()
  const wrap = $('#fx-region-edit')
  wrap.hidden = list.length === 0
  const sel = $('#fx-region-target')
  const labels = { rain: '🌧 雨滴', notes: '♪ 音符', bloom: '❀ 花开', waves: '≈ 浪花', sparkle: '✦ 星星', petals: '🌸 花瓣', fireworks: '🎆 烟花', twinkle: '★ 闪烁星', snow: '❄ 雪花', clover: '🍀 四叶草', hearts: '♥ 心' }
  const prev = sel.value
  sel.innerHTML = ''
  for (const t of list) {
    const o = document.createElement('option')
    o.value = t
    o.textContent = labels[t] + (effects.isFull(t) ? '（全屏）' : '（已框定）')
    sel.appendChild(o)
  }
  if (list.includes(prev)) sel.value = prev
}
document.querySelectorAll('#fx-grid .fx-card').forEach((card) => {
  card.addEventListener('click', () => {
    const type = card.dataset.fx
    effects.toggle(type)
    card.classList.toggle('active', effects.has(type))
    refreshFxRegionUI()
  })
})
$('#btn-fx-region').addEventListener('click', () => {
  const type = $('#fx-region-target').value
  if (!type) return
  beginRegionDraw((norm) => {
    if (!norm) return
    effects.setRegion(type, norm)
    $('#fx-region-status').textContent = `「${type}」已框定范围 ✦`
    refreshFxRegionUI()
    setTimeout(() => (regionBox.hidden = true), 600)
  })
})
$('#btn-fx-region-full').addEventListener('click', () => {
  const type = $('#fx-region-target').value
  if (!type) return
  effects.setRegion(type, null)
  $('#fx-region-status').textContent = `「${type}」已恢复全屏`
  refreshFxRegionUI()
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
  refreshFxRegionUI()
})

// ================= DOODLE 装饰 =================
function setDoodleColor(c) {
  doodles.color = c
  $('#dd-color').value = c
  if (doodles.selected) doodles.selected.color = c
}
seg('#dd-preset', 'ddcol', (v) => setDoodleColor(v))
$('#dd-color').addEventListener('input', (e) => {
  document.querySelectorAll('#dd-preset .seg-btn').forEach((b) => b.classList.remove('active'))
  setDoodleColor(e.target.value)
})
// 手绘线条：点击 → 框选范围 → 在框里描出
document.querySelectorAll('[data-ddpath]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!state.img) return toast('先上传一张照片')
    const kind = btn.dataset.ddpath
    beginRegionDraw((norm) => {
      const region = norm || { x: 0.12, y: 0.12, w: 0.76, h: 0.5 }
      const it = doodles.addPath(kind, region)
      syncDoodleScale()
      setTimeout(() => (regionBox.hidden = true), 500)
      toast('线条描出来了 ✦ 可点选拖动')
    })
  })
})
// 音符/花朵贴纸：点即加（画面中心），可拖
document.querySelectorAll('[data-ddglyph]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!state.img) return toast('先上传一张照片')
    doodles.addGlyph(btn.dataset.ddglyph, 0.5, 0.4)
    syncDoodleScale()
    toast('贴纸已添加 ✦ 拖到想要的位置')
  })
})
// 英文花字
function addDoodleText() {
  const v = $('#dd-text').value.trim()
  if (!v) return
  if (!state.img) return toast('先上传一张照片')
  doodles.addText(v, 0.5, 0.35)
  $('#dd-text').value = ''
  syncDoodleScale()
}
$('#dd-text-add').addEventListener('click', addDoodleText)
$('#dd-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') addDoodleText() })
// 选中大小
$('#dd-scale').addEventListener('input', (e) => {
  $('#dd-scale-val').textContent = e.target.value
  const it = doodles.selected
  if (it && it.type !== 'path') it.scale = +e.target.value / 100
})
function syncDoodleScale() {
  const it = doodles.selected
  if (it && it.scale != null) {
    $('#dd-scale').value = Math.round(it.scale * 100)
    $('#dd-scale-val').textContent = Math.round(it.scale * 100)
  }
  const s = doodles.selected
  $('#dd-status').textContent = s ? `已选中：${s.type === 'path' ? s.kind + ' 线条' : (s.type === 'text' ? '花字「' + s.str + '」' : '贴纸 ' + s.ch)}` : '提示：点画面上的装饰可选中，再拖动 / 改大小 / 删除。'
}
$('#dd-speed').addEventListener('input', (e) => {
  $('#dd-speed-val').textContent = e.target.value
  doodles.speed = +e.target.value / 100
})
$('#dd-replay').addEventListener('click', () => { doodles.replayAll(); toast('重描 ✦') })
$('#dd-del').addEventListener('click', () => {
  if (doodles.selected) { doodles.remove(doodles.selected); syncDoodleScale() }
  else toast('先点选一个装饰')
})
$('#dd-clear').addEventListener('click', () => { doodles.clear(); syncDoodleScale() })

// ----- 画布上拖动装饰（仅装饰 tab） -----
function ptNorm(e) {
  const r = stage.getBoundingClientRect()
  return {
    xN: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
    yN: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
  }
}
function inDoodleTab() { return $('.tab.active')?.dataset.tab === 'doodle' }
let ddDrag = null
stage.addEventListener('pointerdown', (e) => {
  if (regionDraw.active || !inDoodleTab() || !state.img) return
  const { xN, yN } = ptNorm(e)
  const hit = doodles.hit(xN, yN)
  doodles.selected = hit
  syncDoodleScale()
  if (hit) {
    ddDrag = { xN, yN }
    stage.setPointerCapture(e.pointerId)
    stage.style.cursor = 'grabbing'
  }
})
stage.addEventListener('pointermove', (e) => {
  if (!ddDrag) return
  const { xN, yN } = ptNorm(e)
  doodles.moveTo(doodles.selected, xN, yN, xN - ddDrag.xN, yN - ddDrag.yN)
  ddDrag = { xN, yN }
})
stage.addEventListener('pointerup', () => {
  if (ddDrag) { ddDrag = null; stage.style.cursor = inDoodleTab() ? 'crosshair' : 'default' }
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
    effects, doodles, labels: keywords.getExportLabels(), fontScale: fontScale(), scale: state.exportScale,
  })
  download(blob, `vibepic-${Date.now()}.png`)
  toast('PNG 已导出 ✦')
})
$('#btn-export-webm').addEventListener('click', async () => {
  if (!state.img) return toast('先上传一张照片')
  if (effects.isEmpty && doodles.isEmpty) return toast('先加一个动效或装饰再录制')
  const status = $('#export-status')
  previewPaused = true
  status.textContent = '录制中… 0%'
  try {
    const blob = await exportWebM({
      base: baseCanvas, ascii: asciiCanvas, hasAscii: state.hasAscii,
      effects, doodles, labels: keywords.getExportLabels(), fontScale: fontScale(),
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
