      const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { writeFileSync, existsSync, readFileSync } = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const FONT_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/ARIALN.ttf';
const EMOJI_JSON_URL = 'https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json';
const FONT_PATH = path.join('/tmp', 'ARIALN.ttf');
const EMOJI_JSON_PATH = path.join('/tmp', 'emoji-apple.json');

const THEMES = {
  hitam: { bg: '#000000', text: '#ffffff' },
  putih: { bg: '#ffffff', text: '#000000' },
  hijau: { bg: '#8ace00', text: '#000000' }
};

// Pengaman Download dengan Batas Waktu Maksimal 4 Detik
async function downloadFileWithTimeout(url, dest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // Batas aman 4 detik

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    return buf;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[DOWNLOAD WARN] Gagal download ${url}:`, err.message);
    return null;
  }
}

async function ensureFont() {
  if (!existsSync(FONT_PATH)) {
    const success = await downloadFileWithTimeout(FONT_URL, FONT_PATH);
    if (!success) return false;
  }
  try {
    GlobalFonts.registerFromPath(FONT_PATH, 'ArialNarrow');
    return true;
  } catch (e) {
    return false;
  }
}

let emojiMap = null;
const emojiImageCache = new Map();

function emojiToUnicode(emoji) {
  return [...emoji].map(c => c.codePointAt(0).toString(16).padStart(4, '0')).join('-');
}

async function loadEmojiMap() {
  if (emojiMap) return emojiMap;
  if (!existsSync(EMOJI_JSON_PATH)) {
    const success = await downloadFileWithTimeout(EMOJI_JSON_URL, EMOJI_JSON_PATH);
    if (!success) return null;
  }
  try {
    emojiMap = JSON.parse(readFileSync(EMOJI_JSON_PATH, 'utf-8'));
    return emojiMap;
  } catch (e) {
    return null;
  }
}

async function getEmojiImage(emoji) {
  if (emojiImageCache.has(emoji)) return emojiImageCache.get(emoji);
  const map = await loadEmojiMap();
  if (!map) return null;

  const base = emojiToUnicode(emoji);
  const variants = [
    base,
    base.replace(/-fe0f/gi, ''),
    `${base.replace(/-fe0f/gi, '')}-fe0f`,
    base.toUpperCase(),
    base.replace(/-fe0f/gi, '').toUpperCase(),
    base.replace(/-fe0f/gi, '').toUpperCase() + '-FE0F'
  ];
  let b64 = null;
  for (const v of variants) {
    if (map[v]) { b64 = map[v]; break; }
  }
  if (!b64) return null;
  try {
    const img = await loadImage(Buffer.from(b64, 'base64'));
    emojiImageCache.set(emoji, img);
    return img;
  } catch (e) {
    return null;
  }
}

async function drawAppleEmoji(ctx, emoji, x, y, size) {
  const img = await getEmojiImage(emoji);
  if (!img) { 
    ctx.fillText(emoji, x, y); 
    return; 
  }
  ctx.drawImage(img, x, y, size, size);
}

const EMOJI_REGEX = /(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|\p{Emoji_Presentation}\uFE0F?|\p{Emoji}\uFE0F|[\u{1F1E0}-\u{1F1FF}]{2}|\p{Extended_Pictographic}\uFE0F?)/gu;

function measureTextCustom(ctx, text, fontSize) {
  const parts = text.split(EMOJI_REGEX);
  let w = 0;
  for (const part of parts) {
    if (!part) continue;
    EMOJI_REGEX.lastIndex = 0;
    if (EMOJI_REGEX.test(part)) w += fontSize;
    else w += ctx.measureText(part).width;
    EMOJI_REGEX.lastIndex = 0;
  }
  return w;
}

async function drawTextWithEmojis(ctx, text, x, y, fontSize) {
  const parts = text.split(EMOJI_REGEX);
  let curX = x;
  for (const part of parts) {
    if (!part) continue;
    EMOJI_REGEX.lastIndex = 0;
    if (EMOJI_REGEX.test(part)) {
      await drawAppleEmoji(ctx, part, curX, y, fontSize);
      curX += fontSize;
    } else {
      ctx.fillText(part, curX, y);
      curX += ctx.measureText(part).width;
    }
    EMOJI_REGEX.lastIndex = 0;
  }
}

function wrapText(ctx, text, maxWidth, fontSize) {
  ctx.font = `${fontSize}px ArialNarrow`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (measureTextCustom(ctx, test, fontSize) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fitsAt(ctx, text, fontSize, maxWidth, maxHeight, lineGap) {
  const lines = wrapText(ctx, text, maxWidth, fontSize);
  const longestWord = Math.max(...text.split(' ').map(w => measureTextCustom(ctx, w, fontSize)));
  const totalHeight = lines.length * (fontSize + lineGap) - lineGap;
  return longestWord <= maxWidth && totalHeight <= maxHeight;
}

function findBestFontSize(ctx, text, maxWidth, maxHeight, lineGap) {
  let lo = 10;
  let hi = 200; // Dikurangi dari 700 ke 200 untuk mempercepat perulangan render di Vercel
  let best = lo;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsAt(ctx, text, mid, maxWidth, maxHeight, lineGap)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

module.exports = {
  method: 'get',
  path: '/maker/brat',
  handler: async (req, res) => {
    try {
      const inputText = req.query?.text || req.query?.q;
      const themeInput = req.query?.theme || 'white';

      if (!inputText) {
        return res.status(400).json({
          status: false,
          creator: "Rin imup",
          message: 'Parameter teks diperlukan! Contoh: ?text=Halo&theme=green'
        });
      }

      const selectedTheme = THEMES[themeInput] || THEMES.white;

      const size = 500; // Dioptimasi ke 500x500 agar load Canvas sangat cepat & hemat memori Vercel
      const padding = 40;
      const lineGap = 10;
      const maxWidth = size - padding * 2;
      const maxHeight = size - padding * 2;

      // Jalankan tanpa memblokir jika terjadi kendala jaringan internet
      await ensureFont();
      try { await loadEmojiMap(); } catch (e) {}

      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');

      const fontSize = findBestFontSize(ctx, inputText, maxWidth, maxHeight, lineGap);
      const lines = wrapText(ctx, inputText, maxWidth, fontSize);

      ctx.fillStyle = selectedTheme.bg;
      ctx.fillRect(0, 0, size, size);

      ctx.filter = 'blur(1px)';
      ctx.fillStyle = selectedTheme.text;
      ctx.font = `${fontSize}px ArialNarrow`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const totalTextHeight = lines.length * (fontSize + lineGap) - lineGap;
      let y = (size - totalTextHeight) / 2;
      for (const line of lines) {
        await drawTextWithEmojis(ctx, line, padding, y, fontSize);
        y += fontSize + lineGap;
      }

      const buffer = await canvas.encode('png');
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);

    } catch (err) {
      res.status(500).json({
        status: false,
        creator: "Rin imup",
        message: err.message || 'Terjadi kesalahan saat memproses gambar Brat Canvas.'
      });
    }
  },
  metadata: {
    category: 'Maker',
    description: 'Membuat stiker teks bergaya Brat langsung dalam format gambar PNG dengan efek tipis blur.',
    parameters: [
      { name: 'text', in: 'query', required: true, description: 'Teks tulisan stiker Brat' },
      { name: 'theme', in: 'query', required: false, description: 'Pilihan warna tema background: white, black, atau green' }
    ],
  }
};
