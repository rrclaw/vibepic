// 把图像渲染成 ASCII。两种模式：
//   highlight 高光网点（pixpic 风）：只在亮部撒字符，暗部留空，字符顺着受光区域长出来。
//   fill 填充：整块按亮度铺满字符（旧行为）。
// region 仅作可选遮罩（null = 整图）。

const CHARSETS = {
  // 高光集：低位也是醒目符号（不放细点），亮度越高符号越重
  sparkle: [' ', '>', '+', '*', '✳', '#'],          // 散点星花（pixpic 风）
  star: [' ', '*', '✦', '✳', '❋', '❀'],             // 星花朵
  hash: [' ', '+', '*', '#', '%', '@'],
  arrows: [' ', '·', '>', '»', '*', '#'],            // 含少量点，更像图7
  blocks: ' ░▒▓█',
  dots: ' ⠁⠉⠋⠛⠟⠿⡿⣿',
  code: ' .,:;|/\\(){}#',
}

// opts: { mode:'highlight'|'fill', density, charset, threshold(0..1, highlight用),
//         colorMode:'mono'|'sampled', monoColor, opacity, bg, region|null }
export function renderAscii(sourceCanvas, asciiCanvas, opts) {
  const natW = sourceCanvas.width
  const natH = sourceCanvas.height
  asciiCanvas.width = natW
  asciiCanvas.height = natH
  const ctx = asciiCanvas.getContext('2d')
  ctx.clearRect(0, 0, natW, natH)

  const region = opts.region || { x: 0, y: 0, w: natW, h: natH }
  const chars = CHARSETS[opts.charset] || CHARSETS.sparkle
  const mode = opts.mode || 'highlight'
  const thr = opts.threshold ?? 0.6

  const cols = Math.max(8, Math.round(opts.density))
  const cell = region.w / cols
  const rows = Math.max(1, Math.floor(region.h / cell))

  const sctx = sourceCanvas.getContext('2d')
  const img = sctx.getImageData(region.x, region.y, Math.max(1, region.w), Math.max(1, region.h))
  const data = img.data
  const iw = img.width

  if (opts.bg === 'dark') {
    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    ctx.fillRect(region.x, region.y, region.w, region.h)
  }

  ctx.globalAlpha = (opts.opacity ?? 100) / 100
  const fontPx = cell * (mode === 'highlight' ? 1.05 : 1.15)
  ctx.font = `${fontPx}px 'Space Mono', monospace`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  // 高光模式：采样 cell 区域平均亮度，更稳定
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const lum = cellLuma(data, iw, img.height, rx, ry, cell)
      if (lum < 0) continue // 透明

      let ci, r, g, b
      if (mode === 'highlight') {
        if (lum.l < thr) continue // 暗部留空 → 稀疏高光
        let t = (lum.l - thr) / (1 - thr + 1e-6)
        t = Math.pow(t, 0.55) // gamma 提亮：让 * ✳ # 等重符号大量出现，而非全是低位
        // 加一点位置抖动，避免亮度分层成带状，更像手撒的散点
        const jitter = (((rx * 7 + ry * 13) % 5) - 2) * 0.06
        ci = 1 + Math.min(chars.length - 2, Math.max(0, Math.floor((t + jitter) * (chars.length - 1))))
      } else {
        ci = Math.min(chars.length - 1, Math.floor(lum.l * (chars.length - 1)))
        if (chars[ci] === ' ') continue
      }
      const ch = chars[ci]
      if (!ch || ch === ' ') continue

      if (opts.colorMode === 'sampled') {
        const boost = 1.18
        ctx.fillStyle = `rgb(${Math.min(255, lum.r * boost) | 0},${Math.min(255, lum.g * boost) | 0},${Math.min(255, lum.b * boost) | 0})`
      } else {
        ctx.fillStyle = opts.monoColor || '#ffffff'
      }
      const px = region.x + (rx + 0.5) * cell
      const py = region.y + (ry + 0.5) * cell
      ctx.fillText(ch, px, py)
    }
  }
  ctx.globalAlpha = 1
}

// 取 cell 内若干采样点的平均亮度与颜色；全透明返回 -1
function cellLuma(data, iw, ih, rx, ry, cell) {
  let r = 0, g = 0, b = 0, n = 0, opaque = 0
  const x0 = Math.floor(rx * cell), y0 = Math.floor(ry * cell)
  const x1 = Math.min(iw, Math.floor((rx + 1) * cell))
  const y1 = Math.min(ih, Math.floor((ry + 1) * cell))
  const stepX = Math.max(1, Math.floor((x1 - x0) / 3))
  const stepY = Math.max(1, Math.floor((y1 - y0) / 3))
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const i = (y * iw + x) * 4
      if (data[i + 3] < 10) continue
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; opaque++
    }
  }
  if (!n) return -1
  r /= n; g /= n; b /= n
  return { l: (0.299 * r + 0.587 * g + 0.114 * b) / 255, r, g, b }
}

export function clearAscii(asciiCanvas) {
  const ctx = asciiCanvas.getContext('2d')
  ctx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height)
}
