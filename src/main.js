import './style.css'
import { Keywords } from './modules/keywords.js'
import { renderAscii, clearAscii } from './modules/ascii.js'
import { Effects } from './modules/effects.js'
import { Doodles } from './modules/doodles.js'
import { exportPNG, exportSVG, exportWebM, exportGIF, download } from './modules/exporter.js'
import { SHAPES, SHAPE_KEYS } from './modules/shapes.js'
import { MOTIONS, MOTION_KEYS } from './modules/motions.js'
import { extractPalette, rgbHex, avgColor, inferShapeKey } from './modules/palette.js'

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
  collage: { enabled: false, layout: 'lr', side: 'a', bands: 3, palette: [] },
  glitchImg: { rgb: 0 },   // RGB 分离强度 0..100，作用于照片本身（tmnl 风），烘进 baseCanvas
}

// 原图离屏画布：永远保存「未拼贴」的原始像素，供识别 / 取色 / 拼贴重组用。
// baseCanvas 则保存「合成后」用于显示 / ASCII / 导出的画面。
const origCanvas = document.createElement('canvas')

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
  // 原图落到离屏 origCanvas
  origCanvas.width = w
  origCanvas.height = h
  origCanvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
  baseCanvas.width = w
  baseCanvas.height = h
  // 新图换一套主色调
  state.collage.palette = []
  composeBase()
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

// 把 origCanvas（原图）合成到 baseCanvas：普通模式直接画原图；拼贴模式切两半。
function composeBase() {
  const W = state.natW, H = state.natH
  if (!W || !H) return
  const ctx = baseCanvas.getContext('2d')
  const col = state.collage
  if (!col.enabled) {
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(origCanvas, 0, 0, W, H)
    finishBase(ctx, W, H)
    return
  }
  if (!col.palette.length) col.palette = extractPalette(origCanvas, Math.max(6, col.bands))
  const bands = Math.max(1, Math.min(col.bands, col.palette.length))
  // 两个矩形：照片半 / 色板半
  const lr = col.layout === 'lr'
  const aFirst = col.side === 'a' // 照片在 左/上
  let photoR, colorR
  if (lr) {
    const left = { x: 0, y: 0, w: W / 2, h: H }, right = { x: W / 2, y: 0, w: W / 2, h: H }
    photoR = aFirst ? left : right; colorR = aFirst ? right : left
  } else {
    const top = { x: 0, y: 0, w: W, h: H / 2 }, bottom = { x: 0, y: H / 2, w: W, h: H / 2 }
    photoR = aFirst ? top : bottom; colorR = aFirst ? bottom : top
  }
  ctx.clearRect(0, 0, W, H)
  // 色板半：沿长边平铺 N 条主色
  for (let i = 0; i < bands; i++) {
    const c = col.palette[i % col.palette.length]
    ctx.fillStyle = c.hex || rgbHex(c)
    if (lr) ctx.fillRect(colorR.x, colorR.y + (colorR.h / bands) * i, colorR.w, colorR.h / bands + 1)
    else ctx.fillRect(colorR.x + (colorR.w / bands) * i, colorR.y, colorR.w / bands + 1, colorR.h)
  }
  // 照片半：cover 裁切填满
  drawCover(ctx, origCanvas, photoR.x, photoR.y, photoR.w, photoR.h)
  // 接缝细分隔线
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  if (lr) ctx.fillRect(W / 2 - 1, 0, 2, H)
  else ctx.fillRect(0, H / 2 - 1, W, 2)
  finishBase(ctx, W, H)
}

// 底图收尾：烘 RGB 分离（tmnl 风），再刷新 glitch 取色缩略图
function finishBase(ctx, W, H) {
  if (state.glitchImg.rgb > 0) applyRgbSplit(ctx, W, H, Math.max(1, Math.round((state.glitchImg.rgb / 100) * 0.025 * W)))
  effects.setSampler(baseCanvas)
}

// 把照片自身的 R / B 通道左右错位 → 色散撕裂（一次性像素处理）
function applyRgbSplit(ctx, W, H, dx) {
  if (dx < 1) return
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const s = Uint8ClampedArray.from(d)
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      const i = (row + x) * 4
      const rx = x - dx < 0 ? 0 : x - dx
      const bx = x + dx >= W ? W - 1 : x + dx
      d[i] = s[(row + rx) * 4]          // R 取左
      d[i + 2] = s[(row + bx) * 4 + 2]  // B 取右
    }
  }
  ctx.putImageData(img, 0, 0)
}

function drawCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.width, ih = img.height
  const rr = dw / dh, ir = iw / ih
  let sw, sh, sx, sy
  if (ir > rr) { sh = ih; sw = sh * rr; sx = (iw - sw) / 2; sy = 0 }
  else { sw = iw; sh = sw / rr; sx = 0; sy = (ih - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
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
// 随机图。crossOrigin=anonymous 让画布不被污染，ASCII 取像素 / 导出都正常。
// 首选：Unsplash 实时 query —— 每次从持续更新的全库里随取一张「日系/清新/氛围」好图，
// 重复率极低、库一直在更新、Unsplash 授权无版权风险（需一枚免费 Access Key）。
// 没配 key 时回退 Picsum（能用但非精选、目录固定会重复）。
const AESTHETIC_QUERIES = [
  'japanese aesthetic', 'minimal japan', 'film photography japan', 'soft pastel aesthetic',
  'calm nature japan', 'tokyo street film', 'aesthetic flowers soft light', 'muji minimal interior',
  'fresh green nature morning', 'quiet morning light window', 'vintage film portrait soft',
  'pastel sky ocean', 'warm cafe aesthetic', 'cherry blossom soft', 'elegant still life soft light',
  'foggy mountain calm', 'beige minimal aesthetic',
]
const UNSPLASH_KEY_LS = 'vibepic_unsplash_key'
const RAND_SEEN_LS = 'vibepic_seen_ids'
// 默认 key 走本地 .env.local 的 VITE_UNSPLASH_KEY（已 gitignore，不进公开仓库）。
// Unsplash「Access Key」= 客户端公开 client_id（非 Secret），随请求暴露给前端属正常。
// 克隆者没有该文件时此值为空 → 随机图回退 Picsum，点 🔑 填自己的 key 即可。
const DEFAULT_UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_KEY || ''
const getUnsplashKey = () => { try { return localStorage.getItem(UNSPLASH_KEY_LS) || DEFAULT_UNSPLASH_KEY } catch (_) { return DEFAULT_UNSPLASH_KEY } }
function setUnsplashKey() {
  const v = prompt('粘贴 Unsplash Access Key —— 免费申请：unsplash.com/developers → New Application → 复制「Access Key」。\n留空并确定 = 清除（回退 Picsum）。', getUnsplashKey())
  if (v === null) return
  try { localStorage.setItem(UNSPLASH_KEY_LS, v.trim()) } catch (_) {}
  toast(v.trim() ? '已保存图源 ✦ 随机图走精选图源' : '已清除 key，回退 Picsum')
}
const _seenIds = () => { try { return JSON.parse(localStorage.getItem(RAND_SEEN_LS) || '[]') } catch (_) { return [] } }
function _pushSeen(id) {
  try { const a = _seenIds().filter((x) => x !== id); a.push(id); localStorage.setItem(RAND_SEEN_LS, JSON.stringify(a.slice(-40))) } catch (_) {}
}
function mountFromUrl(url) {
  const img = new Image()
  img.crossOrigin = 'anonymous'; img.decoding = 'async'
  img.onload = () => mountBitmap(img, img.naturalWidth, img.naturalHeight)
  img.onerror = () => toast('图片加载失败：检查网络 / 代理后重试')
  img.src = url
}
function loadPicsum() {
  const landscape = Math.random() < 0.4
  const seed = Math.floor(Math.random() * 1e7)
  mountFromUrl(`https://picsum.photos/seed/${seed}/1080/${landscape ? 720 : 1350}`)
}
async function loadRandom() {
  const key = getUnsplashKey()
  if (!key) { toast('随机一张…（点 🔑 配精选图源，更好看不重复）'); return loadPicsum() }
  const q = AESTHETIC_QUERIES[(Math.random() * AESTHETIC_QUERIES.length) | 0]
  const orient = Math.random() < 0.7 ? 'portrait' : 'landscape'
  toast('正在精选一张好看的图…')
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&orientation=${orient}&content_filter=high&client_id=${encodeURIComponent(key)}`)
      if (res.status === 401) { toast('图源 key 无效，点 🔑 重填'); return loadPicsum() }
      if (res.status === 403) { toast('图源达每小时上限，暂用 Picsum'); return loadPicsum() }
      if (!res.ok) throw new Error('http ' + res.status)
      const d = await res.json()
      if (attempt === 0 && d.id && _seenIds().includes(d.id)) continue // 撞最近看过的，换一张
      if (d.id) _pushSeen(d.id)
      const base = (d.urls && (d.urls.raw || d.urls.regular)) || ''
      if (!base) throw new Error('no url')
      const sep = base.includes('?') ? '&' : '?'
      const w = orient === 'portrait' ? 1080 : 1280, h = orient === 'portrait' ? 1350 : 853
      return mountFromUrl(`${base}${sep}w=${w}&h=${h}&fit=crop&crop=entropy&q=80&fm=jpg`)
    }
  } catch (e) {
    console.error('[vibepic] unsplash failed', e); toast('精选源出错，暂用 Picsum'); loadPicsum()
  }
}
$('#btn-random').addEventListener('click', loadRandom)
$('#btn-random-2').addEventListener('click', loadRandom)
$('#btn-unsplash-key').addEventListener('click', setUnsplashKey)
$('#btn-reset').addEventListener('click', () => {
  keywords.clearAll(); clearAscii(asciiCanvas); state.hasAscii = false
  state.region = null; state.asciiRegionNorm = null; regionBox.hidden = true
  effects.clear(); document.querySelectorAll('.fx-card').forEach((c) => c.classList.remove('active'))
  if (typeof refreshFxRegionUI === 'function') refreshFxRegionUI()
  if (typeof renderComboList === 'function') renderComboList()
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
  fresh: { theme: 'fresh', fxColor: '#eafff2', fx: ['sparkle', 'twinkle', 'snow', 'waves'], glyphs: ['flower1', 'flower2', 'spark', 'note1'], ddColor: '#ffffff' },
  calm: { theme: 'calm', fxColor: '#e3f1ff', fx: ['sparkle', 'snow', 'twinkle', 'waves'], glyphs: ['spark', 'star', 'note2', 'heart'], ddColor: '#ffffff' },
  warm: { theme: 'romance', fxColor: '#ffe7c2', fx: ['notes', 'sparkle', 'hearts', 'fireworks'], glyphs: ['note1', 'note2', 'clef', 'spark'], ddColor: '#e0a64b' },
  blush: { theme: 'romance', fxColor: '#ffd9e6', fx: ['hearts', 'sparkle', 'twinkle', 'notes'], glyphs: ['heart', 'flower1', 'spark', 'note3'], ddColor: '#ffffff' },
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

  const tone = _tone(_avgColor(origCanvas))
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
  renderComboList()

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
    await keywords.detect(origCanvas, T.theme, (m) => ($('#detect-status').textContent = m))
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
    await keywords.detect(origCanvas, $('#kw-theme').value, (m) => (status.textContent = m))
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
  const labels = { rain: '🌧 雨滴', notes: '♪ 音符', waves: '≈ 浪花', sparkle: '✦ 星星', fireworks: '🎆 烟花', twinkle: '★ 闪烁星', snow: '❄ 雪花', hearts: '♥ 心', glitchBars: '▬ 霓虹色条', glitchBlocks: '▪ 错位方块', glitchMosaic: '▦ 像素马赛克', glitchScan: '▤ 扫描线', glitchCode: '⌗ 代码乱码' }
  const prev = sel.value
  sel.innerHTML = ''
  for (const t of list) {
    const o = document.createElement('option')
    o.value = t
    const name = effects.label(t) || labels[t] || t
    o.textContent = name + (effects.isFull(t) ? '（全屏）' : '（已框定）')
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
  renderComboList()
})

// ====== 形状 × 动效 自由组合 ======
;(function initComboSelects() {
  const shapeSel = $('#combo-shape')
  const autoOpt = document.createElement('option')
  autoOpt.value = 'auto'; autoOpt.textContent = '🔮 自动（按画面联想）'
  shapeSel.appendChild(autoOpt)
  for (const k of SHAPE_KEYS) {
    const o = document.createElement('option'); o.value = k; o.textContent = SHAPES[k].label; shapeSel.appendChild(o)
  }
  const motionSel = $('#combo-motion')
  for (const k of MOTION_KEYS) {
    const o = document.createElement('option'); o.value = k; o.textContent = MOTIONS[k].label; motionSel.appendChild(o)
  }
})()

// 当前形状 spec：自定义 emoji 优先；否则下拉值；'auto' 现场联想
function currentShapeSpec() {
  const custom = $('#combo-custom').value.trim()
  if (custom) return { glyph: custom }
  const key = $('#combo-shape').value
  if (key === 'auto') return { key: autoShapeKey() }
  return { key }
}
function autoShapeKey() {
  const color = state.collage.palette[0] || avgColor(origCanvas)
  return inferShapeKey(keywords.lastClasses, color)
}
function renderComboList() {
  const wrap = $('#combo-list')
  wrap.innerHTML = ''
  for (const key of effects.list()) {
    if (!effects.isCombo(key)) continue
    const row = document.createElement('div')
    row.className = 'combo-item'
    const lab = document.createElement('span')
    lab.className = 'ci-label'
    lab.textContent = effects.label(key) + (effects.isFull(key) ? '' : ' · 已框定')
    const region = document.createElement('button')
    region.className = 'ci-btn'; region.title = '在画面框选范围'; region.textContent = '▢'
    region.addEventListener('click', () => {
      beginRegionDraw((norm) => {
        if (norm) { effects.setRegion(key, norm); toast('已框定该层范围 ✦') }
        renderComboList(); refreshFxRegionUI()
        setTimeout(() => (regionBox.hidden = true), 500)
      })
    })
    const full = document.createElement('button')
    full.className = 'ci-btn'; full.title = '恢复全屏'; full.textContent = '⤢'
    full.addEventListener('click', () => { effects.setRegion(key, null); renderComboList(); refreshFxRegionUI() })
    const del = document.createElement('button')
    del.className = 'ci-btn ci-del'; del.title = '删除这层'; del.textContent = '×'
    del.addEventListener('click', () => { effects.remove(key); renderComboList(); refreshFxRegionUI() })
    row.append(lab, region, full, del)
    wrap.appendChild(row)
  }
}
function addCombo() {
  if (!state.img) return toast('先上传一张照片')
  const spec = currentShapeSpec()
  const motion = $('#combo-motion').value
  effects.addCombo(spec, motion)
  renderComboList(); refreshFxRegionUI()
  toast('已添加一层 ✦ 在「密度/速度/主色」里可调，下方可设范围')
}
$('#btn-combo-add').addEventListener('click', addCombo)
$('#btn-combo-random').addEventListener('click', () => {
  // 随机挑 形状（含自动）+ 动效，回填下拉再添加
  $('#combo-custom').value = ''
  const pool = ['auto', ...SHAPE_KEYS]
  $('#combo-shape').value = pool[(Math.random() * pool.length) | 0]
  $('#combo-motion').value = MOTION_KEYS[(Math.random() * MOTION_KEYS.length) | 0]
  addCombo()
})

// ====== 拼贴（collage） ======
function renderSwatches() {
  const wrap = $('#col-swatches')
  wrap.innerHTML = ''
  const pal = state.collage.palette.slice(0, Math.max(state.collage.bands, 5))
  for (const c of pal) {
    const sw = document.createElement('div')
    sw.className = 'sw'; sw.style.background = c.hex || rgbHex(c)
    sw.title = (c.hex || rgbHex(c))
    wrap.appendChild(sw)
  }
}
// 任何拼贴参数变更 → 重组底图。ASCII 此时已过期，清掉让用户重生成。
function applyCollage(msg) {
  if (!state.img) { _setSeg('#col-enable', 'col', 'off'); state.collage.enabled = false; return toast('先上传一张照片') }
  composeBase()
  if (state.hasAscii) { clearAscii(asciiCanvas); state.hasAscii = false }
  renderSwatches()
  if (msg) toast(msg)
}
seg('#col-enable', 'col', (v) => { state.collage.enabled = v === 'on'; applyCollage(state.collage.enabled ? '拼贴开启 ✦ ASCII 已清，可重新生成' : '拼贴关闭') })
seg('#col-layout', 'layout', (v) => { state.collage.layout = v; if (state.collage.enabled) applyCollage() })
seg('#col-side', 'side', (v) => { state.collage.side = v; if (state.collage.enabled) applyCollage() })
$('#col-bands').addEventListener('input', (e) => {
  state.collage.bands = +e.target.value
  $('#col-bands-val').textContent = e.target.value
  if (state.collage.enabled) applyCollage()
  else renderSwatches()
})
let _recolorJit = 0
$('#btn-col-recolor').addEventListener('click', () => {
  if (!state.img) return toast('先上传一张照片')
  state.collage.palette = extractPalette(origCanvas, Math.max(6, state.collage.bands), ++_recolorJit)
  if (state.collage.enabled) applyCollage('换了一组主色 ✦')
  else { renderSwatches(); toast('已取色 ✦ 开启拼贴看效果') }
})

// ====== 像素故障 tab ======
// 复用 effects 引擎：四种 glitch 元素就是四个 effect 图层，密度/速度走 effects 全局。
document.querySelectorAll('#glitch-grid .fx-card').forEach((card) => {
  card.addEventListener('click', () => {
    if (!state.img) return toast('先上传一张照片')
    const type = card.dataset.glitch
    effects.toggle(type)
    card.classList.toggle('active', effects.has(type))
    refreshFxRegionUI()
  })
})
$('#glitch-amount').addEventListener('input', (e) => {
  $('#glitch-amount-val').textContent = e.target.value
  effects.setAmount(+e.target.value)
  $('#fx-amount').value = e.target.value; $('#fx-amount-val').textContent = e.target.value
})
$('#glitch-speed').addEventListener('input', (e) => {
  $('#glitch-speed-val').textContent = e.target.value
  effects.speed = +e.target.value / 100
  $('#fx-speed').value = e.target.value; $('#fx-speed-val').textContent = e.target.value
})
$('#btn-glitch-clear').addEventListener('click', () => {
  for (const t of ['glitchBars', 'glitchBlocks', 'glitchMosaic', 'glitchScan', 'glitchCode']) effects.remove(t)
  document.querySelectorAll('#glitch-grid .fx-card').forEach((c) => c.classList.remove('active'))
  refreshFxRegionUI()
})
// 像素马赛克：霓虹纯色 / 从图片取色
seg('#glitch-mosaic-color', 'mcol', (v) => { effects.glitchSampled = v === 'sampled' })
// RGB 分离：作用于照片本身，烘进底图（节流，避免拖动时反复全图像素处理）
let _rgbRaf = 0
$('#glitch-rgb').addEventListener('input', (e) => {
  state.glitchImg.rgb = +e.target.value
  $('#glitch-rgb-val').textContent = e.target.value
  if (!state.img || _rgbRaf) return
  _rgbRaf = requestAnimationFrame(() => {
    _rgbRaf = 0
    composeBase()
    if (state.hasAscii) { clearAscii(asciiCanvas); state.hasAscii = false }
  })
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
$('#btn-export-svg').addEventListener('click', () => {
  if (!state.img) return toast('先上传一张照片')
  const blob = exportSVG({
    base: baseCanvas, ascii: asciiCanvas, hasAscii: state.hasAscii,
    effects, doodles, labels: keywords.getExportLabels(), fontScale: fontScale(), scale: state.exportScale,
  })
  download(blob, `vibepic-${Date.now()}.svg`)
  toast('SVG 已导出 ✦ 文字为可编辑矢量')
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
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
    download(blob, `vibepic-${Date.now()}.${ext}`)
    status.textContent = `视频已导出（${ext.toUpperCase()}）✦`
    toast('动画已导出 ✦')
  } catch (err) {
    console.error(err); status.textContent = '录制失败：' + (err?.message || err)
  } finally {
    previewPaused = false
  }
})
$('#btn-export-gif').addEventListener('click', async () => {
  if (!state.img) return toast('先上传一张照片')
  if (effects.isEmpty && doodles.isEmpty) return toast('先加一个动效或装饰再导 GIF')
  const status = $('#export-status')
  previewPaused = true
  status.textContent = 'GIF 编码中… 0%'
  try {
    const blob = await exportGIF({
      base: baseCanvas, ascii: asciiCanvas, hasAscii: state.hasAscii,
      effects, doodles, labels: keywords.getExportLabels(), fontScale: fontScale(),
      scale: state.exportScale, duration: state.recDur, fps: 12, maxSide: 800,
      onTick: (p) => (status.textContent = `GIF 编码中… ${Math.round(p * 100)}%`),
    })
    download(blob, `vibepic-${Date.now()}.gif`)
    status.textContent = `GIF 已导出 ✦ ${(blob.size / 1048576).toFixed(1)}MB`
    toast('GIF 已导出 ✦')
  } catch (err) {
    console.error(err); status.textContent = 'GIF 导出失败：' + (err?.message || err)
  } finally {
    previewPaused = false
  }
})
