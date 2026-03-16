const CODE39_PATTERNS = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn'
};

function normalizeCode39Value(value) {
  return String(value || '').trim().toUpperCase();
}

export function generateBarcodeValue() {
  const seed = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return seed.slice(-12);
}

export function canRenderCode39(value) {
  const normalized = normalizeCode39Value(value);
  return normalized.length > 0 && normalized.split('').every((char) => CODE39_PATTERNS[char]);
}

export function renderCode39Svg(value, { height = 72, narrow = 2, wide = 5, margin = 12 } = {}) {
  const normalized = normalizeCode39Value(value);
  if (!canRenderCode39(normalized)) return null;

  const encoded = `*${normalized}*`;
  let cursor = margin;
  const bars = [];

  for (let charIndex = 0; charIndex < encoded.length; charIndex += 1) {
    const pattern = CODE39_PATTERNS[encoded[charIndex]];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === 'w' ? wide : narrow;
      const isBar = index % 2 === 0;
      if (isBar) {
        bars.push(`<rect x="${cursor}" y="${margin}" width="${width}" height="${height}" fill="#111827" />`);
      }
      cursor += width;
    }
    cursor += narrow;
  }

  const svgHeight = height + (margin * 2);
  const svgWidth = cursor + margin;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="${normalized}">
      <rect width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />
      ${bars.join('')}
    </svg>
  `.trim();
}

export function playScanTone(type = 'success') {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = type === 'success' ? 880 : 220;
  gain.gain.value = 0.02;

  oscillator.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;
  oscillator.start(now);
  oscillator.stop(now + (type === 'success' ? 0.09 : 0.16));
  oscillator.onended = () => context.close().catch(() => {});
}
