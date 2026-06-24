// 把图像（整图或区域）渲染成 ASCII 网点，叠到 ascii 图层 canvas 上。
// 输出按「自然分辨率」绘制，保证导出清晰。

const CHARSETS = {
  blocks: ' ░▒▓█',
  hash: ' .:-=+*#%@',
  dots: ' ⠁⠉⠋⠛⠟⠿⡿⣿',
  code: ' .,:;|/\\(){}#',
}

// opts: { density, charset, colorMode, monoColor, opacity, bg, region|null }
// region: {x,y,w,h} in natural-image pixels. null = full image.
export function renderAscii(sourceCanvas, asciiCanvas, opts) {
  const natW = sourceCanvas.width
  const natH = sourceCanvas.height
  asciiCanvas.width = natW
  asciiCanvas.height = natH
  const ctx = asciiCanvas.getContext('2d')
  ctx.clearRect(0, 0, natW, natH)

  const region = opts.region || { x: 0, y: 0, w: natW, h: natH }
  const chars = CHARSETS[opts.charset] || CHARSETS.blocks

  // 列数 → cell 尺寸（按区域宽度）
  const cols = Math.max(8, Math.round(opts.density))
  const cell = region.w / cols
  const rows = Math.max(1, Math.floor(region.h / cell))

  // 取源像素
  const sctx = sourceCanvas.getContext('2d')
  const img = sctx.getImageData(region.x, region.y, Math.max(1, region.w), Math.max(1, region.h))
  const data = img.data
  const iw = img.width

  // 背景压暗
  if (opts.bg === 'dark') {
    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    ctx.fillRect(region.x, region.y, region.w, region.h)
  }

  ctx.globalAlpha = (opts.opacity ?? 100) / 100
  const fontPx = cell * 1.15
  ctx.font = `${fontPx}px 'Space Mono', monospace`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      // 采样 cell 中心像素
      const sx = Math.min(iw - 1, Math.floor((rx + 0.5) * cell))
      const sy = Math.min(img.height - 1, Math.floor((ry + 0.5) * cell))
      const i = (sy * iw + sx) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 10) continue
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const ci = Math.min(chars.length - 1, Math.floor(lum * (chars.length - 1)))
      const ch = chars[ci]
      if (ch === ' ') continue

      if (opts.colorMode === 'mono') {
        ctx.fillStyle = opts.monoColor || '#eafff2'
      } else {
        // 采样原色，稍微提亮让网点透气
        const boost = 1.18
        ctx.fillStyle = `rgb(${Math.min(255, r * boost) | 0},${Math.min(255, g * boost) | 0},${Math.min(255, b * boost) | 0})`
      }
      const px = region.x + rx * cell
      const py = region.y + ry * cell
      ctx.fillText(ch, px, py)
    }
  }
  ctx.globalAlpha = 1
}

export function clearAscii(asciiCanvas) {
  const ctx = asciiCanvas.getContext('2d')
  ctx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height)
}
