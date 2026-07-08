const fetch = require('node-fetch');
const FormData = require('form-data');

// Fungsi utama memproses manipulasi gambar via Banana-Nano AI
async function processEditImage(imageUrl, promptText) {
  // Diturunkan ke 8 detik agar merespons SEBELUM limit 10 detik Vercel Hobby Plan memotongnya
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); 

  try {
    // 1. Download gambar dari URL parameter menjadi buffer biner
    const imageRes = await fetch(imageUrl, { signal: controller.signal });
    if (!imageRes.ok) throw new Error('Gagal mengunduh gambar sumber dari URL yang diberikan');
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    // 2. Susun form data untuk dikirim ke API Banana Nano
    const form = new FormData();
    form.append('file', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
    form.append('prompt', promptText);
    form.append('output_format', 'jpg');
    form.append('generator_slug', 'ai-image-editor');

    // 3. Request post ke API backend Banana Nano
    const response = await fetch('https://banana-nano.ai/api/nano-banana-lite-image-to-image', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'accept': '*/*',
        'origin': 'https://banana-nano.ai',
        'referer': 'https://banana-nano.ai/ai-image-editor',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...form.getHeaders()
      },
      body: form
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API Banana Nano Error: Status ${response.status}`);
    }

    const jsonResult = await response.json();
    const targetResultUrl = jsonResult.r2_url || jsonResult.output_image_url || jsonResult.data?.image_url;
    
    if (!targetResultUrl) {
      throw new Error(jsonResult.message || 'API Banana-Nano sedang sibuk atau tidak mengembalikan URL gambar.');
    }

    return targetResultUrl;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Server sedang sibuk. Proses AI Banana-Nano memakan waktu terlalu lama (Timeout 8s).');
    }
    throw error;
  }
}

module.exports = {
  method: 'get',
  path: '/tools/editimg',
  config: {
    maxDuration: 60 // Hanya aktif jika dideploy menggunakan Vercel Pro/Enterprise
  },
  handler: async (req, res) => {
    try {
      const imageUrl = req.query?.url || req.query?.image;
      const promptText = req.query?.prompt || req.query?.q;

      if (!imageUrl || !promptText) {
        return res.status(400).json({
          status: false,
          creator: "Rin imup",
          message: 'Parameter kurang lengkap! Dibutuhkan ?url=... (URL Gambar) dan &prompt=... (Perintah Edit)'
        });
      }

      const finalMediaUrl = await processEditImage(imageUrl, promptText);

      res.json({
        status: true,
        creator: "Rin imup",
        data: {
          type: 'image/jpeg',
          title: 'AI Image Editor Result',
          prompt: promptText,
          media: [finalMediaUrl],
          description: 'Gambar berhasil di edit.'
        }
      });
    } catch (err) {
      res.status(504).json({
        status: false,
        creator: "Rin imup",
        message: err.message || 'Terjadi kesalahan internal / Serverless timeout saat memproses gambar.'
      });
    }
  },
  metadata: {
    category: 'Tools',
    description: 'Mengedit gambar menggunakan Prompt dan menghasilkan gambar yang sesuai.',
    parameters: [
      {
        name: 'url',
        in: 'query',
        required: true,
        description: 'link url image'
      },
      {
        name: 'prompt',
        in: 'query',
        required: true,
        description: 'Perintah edit gambar'
      }
    ],
  }
};
