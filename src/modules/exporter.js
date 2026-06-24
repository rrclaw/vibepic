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
export function exportPNG({ base, ascii, hasAscii, effects, labels, fontScale, scale }) {
  const tW = Math.round(base.width * scale)
  const tH = Math.round(base.height * scale)
  const c = document.createElement('canvas')
  c.width = tW; c.height = tH
  const ctx = c.getContext('2d')
  drawBackground(ctx, base, ascii, hasAscii, tW, tH)
  if (effects && !effects.isEmpty) effects.draw(ctx, tW, tH)
  drawLabels(ctx, labels, tW, tH, fontScale * scale)
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
}

// 录制 WebM
export function exportWebM({ base, ascii, hasAscii, effects, labels, fontScale, scale, duration, onTick }) {
  return new Promise((resolve, reject) => {
    const tW = Math.round(base.width * scale)
    const tH = Math.round(base.height * scale)
    const c = document.createElement('canvas')
    c.width = tW; c.height = tH
    const ctx = c.getContext('2d')

    const stream = c.captureStream(30)
    let mime = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8'
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm'
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
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
      drawLabels(ctx, labels, tW, tH, lblScale)
      const elapsed = (now - start) / 1000
      onTick?.(Math.min(1, elapsed / duration))
      if (elapsed >= duration) { rec.stop(); return }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
