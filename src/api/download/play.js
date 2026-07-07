const { createDecipheriv } = require('crypto');
const yts = require('yt-search');
const fetch = require('node-fetch');

const METADATA_DECRYPTION_KEY = Buffer.from(
  'C5D58EF67A7584E4A29F6C35BBC4EB12',
  'hex'
);

const HEADERS = {
  'Content-Type': 'application/json',
  Origin: 'https://yt.savetube.me',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
};

async function getYouTubeData(input) {
  let targetUrl = input;

  // 1. Deteksi apakah input merupakan URL YouTube atau Kata Kunci Pencarian
  if (!/youtube\.com|youtu\.be/i.test(input)) {
    const search = await yts(input);
    if (!search?.videos?.length) throw new Error(`Hasil tidak ditemukan untuk "${input}"`);
    targetUrl = search.videos[0].url;
  }

  // 2. Ambil detail info video dari yt-search
  const detail = await yts(targetUrl);
  const vid = detail?.videos?.[0];
  if (!vid) throw new Error('Gagal mengambil detail video YouTube');

  // 3. Proses pengambilan link audio via Savetube VIP Backend
  const idMatch = targetUrl.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/
  );
  if (!idMatch) throw new Error('ID YouTube tidak valid');
  const videoId = idMatch[1];

  const cdnRes = await fetch('https://media.savetube.vip/api/random-cdn', { headers: HEADERS }).then(v => v.json()).catch(() => null);
  if (!cdnRes?.cdn) throw new Error('CDN Savetube tidak tersedia');
  const cdn = cdnRes.cdn;

  const info = await fetch(`https://${cdn}/v2/info`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=' + videoId })
  }).then(v => v.json()).catch(() => null);

  if (!info?.data) throw new Error('Metadata Savetube kosong');

  let metadata;
  try {
    const encrypted = Buffer.from(info.data, 'base64');
    const decipher = createDecipheriv('aes-128-cbc', METADATA_DECRYPTION_KEY, encrypted.subarray(0, 16));
    const decrypted = Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]);
    metadata = JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    throw new Error('Gagal mendekripsi metadata YouTube');
  }

  if (!metadata?.key) throw new Error('Kunci download tidak ditemukan');

  const dl = await fetch(`https://${cdn}/download`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      id: videoId,
      downloadType: 'audio',
      quality: '128kbps',
      key: metadata.key
    })
  }).then(v => v.json()).catch(() => null);

  if (!dl?.data?.downloadUrl) throw new Error(dl?.message || 'Gagal memproses link unduhan audio');

  // 4. Return data hasil gabungan yt-search & savetube sesuai kebutuhan skema
  return {
    title: vid.title || metadata.title || '-',
    duration: vid.timestamp || metadata.durationLabel || '0:00',
    views: vid.views || 0,
    ago: vid.ago || '-',
    thumbnail: vid.thumbnail || metadata.thumbnail || '',
    audioUrl: dl.data.downloadUrl,
    author: vid.author?.name || '-'
  };
}

module.exports = {
  method: 'get',
  path: '/download/play',
  handler: async (req, res) => {
    try {
      const { url, q } = req.query;
      const input = url || q;

      if (!input) {
        return res.status(400).json({
          status: false,
          creator: "Rin imup",
          message: 'Parameter diperlukan: ?url=... atau ?q=... (untuk pencarian)'
        });
      }

      // Memanggil fungsi penarik data utama
      const ytData = await getYouTubeData(input);

      // Struktur data respons murni disamakan persis dengan format TikTok mu wok!
      const responseData = {
        status: true,
        creator: "Rin imup",
        data: {
          type: 'audio',
          title: ytData.title,
          author: {
            nickname: ytData.author,
            unique_id: ytData.author.toLowerCase().replace(/\s+/g, '')
          },
          views: ytData.views,
          duration: ytData.duration,
          media: [ytData.audioUrl],
          music: ytData.audioUrl,
          cover: ytData.thumbnail,
          description: `Dipublikasikan: ${ytData.ago}`
        }
      };

      res.json(responseData);
    } catch (err) {
      res.status(500).json({
        status: false,
        creator: "Rin imup",
        message: err.message || 'Terjadi kesalahan saat memproses permintaan'
      });
    }
  },
  metadata: {
    category: 'Download',
    description: 'Download audio mp3 dari YouTube via pencarian kata kunci',
    parameters: [
      {
        name: 'q',
        in: 'query',
        required: false,
        description: 'Kata kunci pencarian judul lagu'
      }
    ],
  }
};
