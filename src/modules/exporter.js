// 导出：把 base + ascii + 关键词 + 动效合成到目标 canvas。
// PNG = 当前帧静态合成；WebM = 录制带动效的动画。

function fontString(font, px) {
  switch (font) {
    case 'sans': return `600 ${px}px 'Inter', sans-serif`
    case 'serif': return `${px}px 'DM Serif Display', serif`
    case 'script': return `700 ${px}px 'Caveat', cursive`
    default: return `${px}px 'Space Mono', monospace`
  }
}

function drawLabels(ctx, labels, tW, tH, fontScale) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const l of labels) {
    const px = l.size * fontScale
    ctx.font = fontString(l.font, px)
    ctx.fillStyle = l.color
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = px * 0.12
    ctx.shadowOffsetY = px * 0.05
    ctx.fillText(l.text, l.xN * tW, l.yN * tH)
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
}

function drawBackground(ctx, base, ascii, hasAscii, tW, tH) {
  ctx.clearRect(0, 0, tW, tH)
  ctx.drawImage(base, 0, 0, tW, tH)
  if (hasAscii) ctx.drawImage(ascii, 0, 0, tW, tH)
}

// ctx2d 配置
export function exportPNG({ base, ascii, hasAscii, effects, doodles, labels, fontScale, scale }) {
  const tW = Math.round(base.width * scale)
  const tH = Math.round(base.height * scale)
  const c = document.createElement('canvas')
  c.width = tW; c.height = tH
  const ctx = c.getContext('2d')
  drawBackground(ctx, base, ascii, hasAscii, tW, tH)
  if (effects && !effects.isEmpty) effects.draw(ctx, tW, tH)
  if (doodles && !doodles.isEmpty) doodles.draw(ctx, tW, tH)
  drawLabels(ctx, labels, tW, tH, fontScale * scale)
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
}

// 录制 WebM
export function exportWebM({ base, ascii, hasAscii, effects, doodles, labels, fontScale, scale, duration, onTick }) {
  return new Promise((resolve, reject) => {
    const tW = Math.round(base.width * scale)
    const tH = Math.round(base.height * scale)
    const c = document.createElement('canvas')
    c.width = tW; c.height = tH
    const ctx = c.getContext('2d')

    const stream = c.captureStream(30)
    // 优先 MP4（Safari 支持，手机/剪辑/Live Photo 更友好），否则回退 WebM
    const cands = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    const mime = cands.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm'
    const outType = mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm'
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => resolve(new Blob(chunks, { type: outType }))
    rec.onerror = (e) => reject(e.error || e)

    let last = performance.now()
    const start = last
    rec.start()
    const lblScale = fontScale * scale

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      drawBackground(ctx, base, ascii, hasAscii, tW, tH)
      if (effects) { effects.update(dt); effects.draw(ctx, tW, tH) }
      if (doodles) { doodles.update(dt); doodles.draw(ctx, tW, tH) }
      drawLabels(ctx, labels, tW, tH, lblScale)
      const elapsed = (now - start) / 1000
      onTick?.(Math.min(1, elapsed / duration))
      if (elapsed >= duration) { rec.stop(); return }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

// 导出 GIF（256 色，固定 fps，长边限制以控体积）。gifenc 动态加载。
export async function exportGIF({ base, ascii, hasAscii, effects, doodles, labels, fontScale, scale, duration, fps = 12, maxSide = 800, onTick }) {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
  // GIF 尺寸：在 scale 基础上再把长边限制到 maxSide
  const longest = Math.max(base.width, base.height) * scale
  const gscale = scale * Math.min(1, maxSide / longest)
  const tW = Math.max(2, Math.round(base.width * gscale))
  const tH = Math.max(2, Math.round(base.height * gscale))
  const c = document.createElement('canvas')
  c.width = tW; c.height = tH
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const enc = GIFEncoder()
  const frames = Math.max(2, Math.round(duration * fps))
  const delay = Math.round(1000 / fps)
  const dt = 1 / fps
  const lblScale = fontScale * gscale

  for (let i = 0; i < frames; i++) {
    drawBackground(ctx, base, ascii, hasAscii, tW, tH)
    if (effects) { effects.update(dt); effects.draw(ctx, tW, tH) }
    if (doodles) { doodles.update(dt); doodles.draw(ctx, tW, tH) }
    drawLabels(ctx, labels, tW, tH, lblScale)
    const { data } = ctx.getImageData(0, 0, tW, tH)
    const palette = quantize(data, 256, { format: 'rgb444' })
    const index = applyPalette(data, palette, 'rgb444')
    enc.writeFrame(index, tW, tH, { palette, delay })
    onTick?.((i + 1) / frames)
    // 让出主线程，避免卡死 UI
    if (i % 4 === 3) await new Promise((r) => requestAnimationFrame(r))
  }
  enc.finish()
  return new Blob([enc.bytes()], { type: 'image/gif' })
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
