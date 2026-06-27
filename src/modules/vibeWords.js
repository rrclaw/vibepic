// 把 COCO-SSD 的 80 个物体类别映射成「氛围感」词。
// 每个类别给一组候选词，识别后随机/按主题挑一个，避免死板的 "person / cup"。

export const CLASS_VIBES = {
  person: ['us', 'you', 'me', 'together', 'duet', 'hey', 'soul'],
  bicycle: ['ride', 'breeze', 'free', 'roam'],
  car: ['drive', 'away', 'road', 'go'],
  motorcycle: ['ride', 'rush', 'free'],
  airplane: ['away', 'sky', 'soon', 'escape'],
  bus: ['city', 'commute', 'move'],
  train: ['away', 'journey', 'rails'],
  boat: ['drift', 'float', 'sea', 'calm'],
  bird: ['free', 'fly', 'song', 'light'],
  cat: ['soft', 'purr', 'lazy', 'warm'],
  dog: ['loyal', 'walk', 'joy', 'warm'],
  horse: ['wild', 'run', 'free'],
  sheep: ['soft', 'cloud', 'calm'],
  cow: ['meadow', 'slow', 'green'],
  elephant: ['gentle', 'big', 'calm'],
  bear: ['hug', 'wild', 'soft'],
  umbrella: ['rainy', 'shelter', 'hide', 'cozy', 'drip'],
  handbag: ['carry', 'daily', 'chic'],
  backpack: ['roam', 'pack', 'go'],
  tie: ['sharp', 'work', 'crisp'],
  suitcase: ['away', 'trip', 'pack'],
  frisbee: ['play', 'toss', 'sun'],
  skis: ['snow', 'rush', 'cold'],
  snowboard: ['snow', 'glide', 'cold'],
  'sports ball': ['play', 'bounce', 'game'],
  kite: ['wind', 'high', 'free'],
  'baseball bat': ['swing', 'play'],
  skateboard: ['roll', 'street', 'free'],
  surfboard: ['wave', 'ride', 'sea'],
  'tennis racket': ['swing', 'play'],
  bottle: ['sip', 'clear', 'cool'],
  'wine glass': ['cheers', 'vibe', 'glow', 'night'],
  cup: ['sip', 'warm', 'café', 'cozy', 'steam'],
  fork: ['taste', 'meal'],
  knife: ['sharp', 'meal'],
  spoon: ['sweet', 'sip'],
  bowl: ['warm', 'meal', 'home', 'fill'],
  banana: ['sweet', 'yellow', 'snack'],
  apple: ['crisp', 'fresh', 'red'],
  sandwich: ['bite', 'lunch', 'tasty'],
  orange: ['fresh', 'zest', 'sun', 'juicy'],
  broccoli: ['green', 'fresh', 'crisp'],
  carrot: ['fresh', 'crisp', 'orange'],
  'hot dog': ['bite', 'street', 'tasty'],
  pizza: ['slice', 'tasty', 'share'],
  donut: ['sweet', 'treat', 'soft'],
  cake: ['sweet', 'treat', 'celebrate'],
  chair: ['rest', 'sit', 'pause', 'the'],
  couch: ['cozy', 'rest', 'home'],
  'potted plant': ['fresh', 'green', 'grow', 'bloom', 'leaf'],
  bed: ['rest', 'dream', 'soft'],
  'dining table': ['gather', 'meal', 'home'],
  toilet: ['quiet', 'home'],
  tv: ['glow', 'night', 'chill'],
  laptop: ['work', 'type', 'glow'],
  mouse: ['click', 'work'],
  remote: ['chill', 'switch'],
  keyboard: ['type', 'work', 'click'],
  'cell phone': ['scroll', 'capture', 'glow'],
  microwave: ['warm', 'quick'],
  oven: ['warm', 'bake', 'home'],
  toaster: ['warm', 'morning'],
  sink: ['clean', 'fresh'],
  refrigerator: ['cool', 'fresh', 'home'],
  book: ['read', 'quiet', 'story', 'page'],
  clock: ['time', 'tick', 'slow'],
  vase: ['bloom', 'fresh', 'still'],
  scissors: ['cut', 'craft'],
  'teddy bear': ['soft', 'hug', 'warm', 'cute'],
  'hair drier': ['warm', 'soft'],
  toothbrush: ['fresh', 'morning'],
  traffic_light: ['city', 'go', 'wait'],
  'fire hydrant': ['street', 'red'],
  'stop sign': ['stop', 'pause'],
  'parking meter': ['city', 'wait'],
  bench: ['rest', 'pause', 'sit'],
}

// 主题词池：按色调 / 主题补充，撒一点诗意。
export const THEME_POOLS = {
  fresh: ['fresh', 'lime', 'mint', 'green', 'crisp', 'dewy', 'clear', 'breeze', 'leaf', 'cool'],
  romance: ['us', 'love', 'soft', 'bloom', 'duet', 'glow', 'warm', 'dear', 'blush', 'hush'],
  calm: ['calm', 'quiet', 'still', 'drift', 'slow', 'soft', 'hush', 'linger', 'breathe', 'ease'],
  city: ['city', 'street', 'glow', 'neon', 'move', 'rush', 'late', 'lights', 'block', 'crowd'],
}

// 色调推断主色调氛围词
export function colorVibes(avg) {
  const { r, g, b } = avg
  const out = []
  if (g > r && g > b) out.push('fresh', 'green', 'lime', 'leaf')
  if (b > r && b > g) out.push('calm', 'sky', 'ocean', 'cool', 'blue')
  if (r > 150 && g > 120 && b < 120) out.push('golden', 'warm', 'sun', 'glow')
  if (r > 150 && b > 130 && g < r) out.push('blush', 'sweet', 'soft', 'pink')
  const bright = (r + g + b) / 3
  if (bright > 190) out.push('bright', 'airy', 'light')
  if (bright < 70) out.push('night', 'deep', 'quiet')
  return out
}

const _used = new Set()
export function resetUsed() { _used.clear() }

// 从候选里挑一个尽量不重复的词
export function pickWord(candidates, seed = 0) {
  if (!candidates || !candidates.length) return null
  const fresh = candidates.filter((w) => !_used.has(w))
  const pool = fresh.length ? fresh : candidates
  const w = pool[(seed + pool.length) % pool.length]
  _used.add(w)
  return w
}

// 综合给一个检测框选词：类别候选 + 主题/色调补充
export function wordForDetection(cls, theme, colorPool, idx) {
  let cands = (CLASS_VIBES[cls] || []).slice()
  if (theme && theme !== 'auto' && THEME_POOLS[theme]) {
    cands = cands.concat(THEME_POOLS[theme])
  } else if (colorPool && colorPool.length) {
    cands = cands.concat(colorPool)
  }
  if (!cands.length) cands = ['vibe', 'soft', 'still']
  return pickWord(cands, idx)
}

// ====== 按画面内容提取关键词（配合 MobileNet 1000 类分类器） ======

// ImageNet 类名 → 干净好看的短词（挑美感相关的常见类做映射，其余走兜底）
const IMAGENET_SYN = {
  'ice cream': 'icecream', 'ice lolly': 'icecream', 'chocolate sauce': 'sweet', 'trifle': 'dessert',
  'espresso': 'coffee', 'cup': 'coffee', 'coffee mug': 'coffee', 'coffeepot': 'coffee', 'eggnog': 'latte',
  'red wine': 'wine', 'wine bottle': 'wine', 'goblet': 'wine', 'beer glass': 'cheers', 'cocktail shaker': 'cheers',
  'teapot': 'tea', 'teacup': 'tea', 'pitcher': 'pour', 'water bottle': 'sip', 'pop bottle': 'soda',
  'seashore': 'sea', 'sandbar': 'shore', 'lakeside': 'lake', 'lakeshore': 'lake', 'promontory': 'cliff',
  'cliff': 'cliff', 'alp': 'hills', 'valley': 'valley', 'volcano': 'peak', 'geyser': 'mist',
  'daisy': 'daisy', 'pot': 'plant', 'flowerpot': 'plant', 'vase': 'vase', 'hip': 'berry', 'corn': 'harvest',
  'tabby': 'cat', 'persian cat': 'cat', 'egyptian cat': 'cat', 'tiger cat': 'cat',
  'golden retriever': 'dog', 'labrador retriever': 'dog', 'toy poodle': 'dog', 'pomeranian': 'puppy',
  'umbrella': 'rainy', 'fountain': 'fountain', 'maypole': 'fair', 'parachute': 'sky',
  'sunglasses': 'cool', 'sunglass': 'cool', 'cowboy hat': 'roam', 'sombrero': 'sunny', 'bonnet': 'sweet',
  'bakery': 'bakery', 'restaurant': 'dinner', 'plate': 'meal', 'tray': 'meal', 'mixing bowl': 'home',
  'sandbar ': 'beach', 'seaside': 'sea', 'bubble': 'bubble', 'balloon': 'balloon', 'jellyfish': 'drift',
  'pillow': 'cozy', 'quilt': 'cozy', 'comforter': 'cozy', 'studio couch': 'cozy', 'four-poster': 'dreamy',
  'candle': 'glow', 'lampshade': 'glow', 'table lamp': 'glow', 'spotlight': 'glow', 'torch': 'flame',
  'window screen': 'window', 'window shade': 'window', 'sliding door': 'window', 'shoji': 'window',
  'book jacket': 'book', 'bookcase': 'books', 'bookshop': 'books', 'library': 'quiet',
  'grand piano': 'melody', 'upright piano': 'melody', 'acoustic guitar': 'tune', 'violin': 'strings',
  'mountain bike': 'ride', 'tricycle': 'roam', 'gondola': 'drift', 'canoe': 'float', 'sailboat': 'sail',
  'wool': 'soft', 'velvet': 'soft', 'silk': 'silk', 'feather boa': 'soft', 'mitten': 'warm',
  'streetcar': 'city', 'trolleybus': 'city', 'traffic light': 'city', 'fire hydrant': 'street',
}
const IMAGENET_BLOCK = new Set(['web site', 'envelope', 'menu', 'comic book', 'jersey', 'maillot', 'crossword puzzle', 'television', 'monitor', 'screen', 'laptop', 'notebook', 'desktop computer', 'wallet', 'purse', 'perfume', 'hand-held computer', 'modem', 'remote control', 'mouse', 'switch', 'oscilloscope', 'printer', 'photocopier', 'cash machine'])
const TECH_TAIL = new Set(['device', 'machine', 'system', 'cover', 'case', 'board', 'panel', 'meter', 'tool', 'computer', 'phone', 'set'])

export function cleanImagenet(name) {
  let s = String(name).toLowerCase().split(',')[0].trim()
  if (IMAGENET_SYN[s]) return IMAGENET_SYN[s]
  if (IMAGENET_BLOCK.has(s)) return null
  const words = s.split(/[\s-]+/).filter(Boolean)
  let w = (words[words.length - 1] || s).replace(/[^a-z]/g, '')
  if (w.length < 3 || w.length > 10) return null
  if (TECH_TAIL.has(w)) return null
  return w
}

// 一组分类结果 → 内容词（按概率高到低，去重）
export function contentWords(classes, n = 6) {
  const out = []
  for (const c of classes || []) {
    const w = cleanImagenet(c.className || c)
    if (w && !out.includes(w)) out.push(w)
    if (out.length >= n) break
  }
  return out
}

// 画面色调 → 短颜色词
export function colorWords(avg) {
  const { r, g, b } = avg
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const bright = (r + g + b) / 3
  const out = []
  if (max - min < 22) {
    out.push(bright > 205 ? 'cream' : bright > 150 ? 'beige' : bright > 90 ? 'grey' : 'noir')
  } else if (r >= g && r >= b) {
    if (g > b) out.push(b > 120 ? 'peach' : 'amber', 'golden')
    else out.push(r > 180 && b > 150 ? 'pink' : 'blush', 'rose')
  } else if (g >= r && g >= b) {
    out.push(bright > 170 ? 'mint' : 'sage', 'green')
  } else {
    out.push(bright > 160 ? 'sky' : 'ocean', g > r ? 'teal' : 'blue')
  }
  if (bright > 208) out.push('airy')
  if (bright < 56) out.push('dim')
  return [...new Set(out)]
}

// 画面明度 → 一个氛围词
export function moodWord(avg) {
  const b = (avg.r + avg.g + avg.b) / 3
  return b > 200 ? 'airy' : b > 150 ? 'soft' : b > 90 ? 'cozy' : 'quiet'
}

// 没有检测到任何物体时，撒几个氛围词
export function ambientWords(theme, colorPool, n = 4) {
  let pool = []
  if (theme && theme !== 'auto' && THEME_POOLS[theme]) pool = THEME_POOLS[theme].slice()
  else pool = (colorPool && colorPool.length ? colorPool : THEME_POOLS.calm).slice()
  pool = pool.concat(THEME_POOLS.fresh, THEME_POOLS.romance)
  const out = []
  for (let i = 0; i < n; i++) { const w = pickWord(pool, i * 3); if (w) out.push(w) }
  return out
}
