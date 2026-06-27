// 主色调提取 + 「按画面内容联想形状」。
// 提取：把图缩到小尺寸，按 4-bit 量化分桶计数，取出现最多的若干色（去掉过暗/过亮的灰）。
// 联想：先用 COCO 识别到的类别映射形状，无识别则按主色调推断（蓝亮→云、暗→月、绿→叶…）。

export function extractPalette(canvas, n = 5, jitter = 0) {
  const s = 60
  const t = document.createElement('canvas'); t.width = s; t.height = s
  const ctx = t.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0, s, s)
  const d = ctx.getImageData(0, 0, s, s).data
  const buckets = new Map()
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    let e = buckets.get(key)
    if (!e) { e = { r: 0, g: 0, b: 0, c: 0 }; buckets.set(key, e) }
    e.r += r; e.g += g; e.b += b; e.c++
  }
  let list = [...buckets.values()].map((e) => ({ r: Math.round(e.r / e.c), g: Math.round(e.g / e.c), b: Math.round(e.b / e.c), c: e.c }))
  list.sort((a, b) => b.c - a.c)
  // 去掉相互太接近的颜色，保证色板有层次
  const out = []
  for (const col of list) {
    if (out.some((o) => Math.abs(o.r - col.r) + Math.abs(o.g - col.g) + Math.abs(o.b - col.b) < 40)) continue
    out.push(col)
    if (out.length >= n + 2) break
  }
  const picked = out.slice(0, Math.max(1, n)).map((c) => ({ ...c, hex: rgbHex(c) }))
  // jitter：把色板循环旋转，给「重新取色」一点变化
  if (jitter && picked.length > 1) {
    const k = jitter % picked.length
    return picked.slice(k).concat(picked.slice(0, k))
  }
  return picked
}

export function rgbHex({ r, g, b }) {
  const h = (v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

export function avgColor(canvas) {
  const t = document.createElement('canvas'); t.width = 40; t.height = 40
  const c = t.getContext('2d'); c.drawImage(canvas, 0, 0, 40, 40)
  const d = c.getImageData(0, 0, 40, 40).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
  return { r: r / n, g: g / n, b: b / n }
}

// COCO 类别 → 联想形状 key（用 SHAPES 里已有的 key）
const CLASS_SHAPE = {
  person: 'heart', cat: 'heart', dog: 'heart', 'teddy bear': 'heart', bear: 'heart',
  bird: 'butterfly', kite: 'butterfly', airplane: 'cloud',
  'potted plant': 'flower', vase: 'flower', broccoli: 'leaf', 'dining table': 'leaf',
  'wine glass': 'bubble', cup: 'coffee', bottle: 'bubble', bowl: 'bubble',
  cake: 'icecream', donut: 'icecream', 'hot dog': 'icecream', pizza: 'icecream', sandwich: 'icecream',
  apple: 'flower', orange: 'sun', banana: 'star',
  boat: 'raindrop', surfboard: 'raindrop', umbrella: 'raindrop', 'fire hydrant': 'raindrop',
  book: 'star', laptop: 'sparkle', 'cell phone': 'sparkle', tv: 'sparkle', clock: 'star',
  'sports ball': 'star', frisbee: 'star', skis: 'snow', snowboard: 'snow',
  car: 'star', bicycle: 'sparkle', motorcycle: 'sparkle', fish: 'fish',
}

// 主色调 → 形状
function shapeByColor({ r, g, b }) {
  const bright = (r + g + b) / 3
  if (bright < 60) return 'moon'
  if (b > r + 12 && b > g - 4 && bright > 130) return 'cloud'
  if (b > r + 10 && b > g + 4) return 'snow'
  if (g > r + 10 && g > b + 6) return 'leaf'
  if (r > 150 && b > 130 && g < r - 8) return 'heart'      // 粉
  if (r > 160 && g > 120 && b < 110) return 'sun'          // 暖橙
  if (bright > 200) return 'sparkle'
  return 'flower'
}

// 综合：传入识别类别(可空) + 一个代表色 → 返回 SHAPES key
export function inferShapeKey(classes, color) {
  if (classes && classes.length) {
    for (const cls of classes) {
      if (CLASS_SHAPE[cls]) return CLASS_SHAPE[cls]
    }
  }
  return shapeByColor(color || { r: 160, g: 160, b: 160 })
}
