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
