const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { writeFileSync, existsSync, mkdirSync } = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Konfigurasi URL Aset Global API (Menggunakan font .ttf murni asli dari Google Fonts GitHub)
const BG_URL = 'https://raw.githubusercontent.com/ryyntwx/allimagerin/refs/heads/main/F1.png';
const POPPINS_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-SemiBold.ttf';
const INTER_MEDIUM_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/static/Inter-Medium.ttf';
const INTER_BOLD_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/static/Inter-Bold.ttf';

// Tempat penyimpanan aset di direktori temporary OS
const TMP_DIR = process.env.TMPDIR || '/tmp';
const BG_LOCAL_PATH = path.join(TMP_DIR, 'template_bca_f1.png');
const POPPINS_PATH = path.join(TMP_DIR, 'Poppins-SemiBold.ttf');
const INTER_MEDIUM_PATH = path.join(TMP_DIR, 'Inter-Medium.ttf');
const INTER_BOLD_PATH = path.join(TMP_DIR, 'Inter-Bold.ttf');

// Pastikan folder penyimpanan tersedia
if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
}

// Fungsi download dengan proteksi User-Agent
async function downloadToBuffer(url, destPath) {
    if (existsSync(destPath)) return;
    
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status} saat mengunduh URL: ${url}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buf);
}

// Variabel penanda apakah semua registrasi font global sudah selesai
let isAssetsLoaded = false;

async function initAssets() {
    if (isAssetsLoaded) return;
    try {
        // Unduh semua file asset utama ke folder temp OS jika belum ada
        await downloadToBuffer(POPPINS_URL, POPPINS_PATH);
        await downloadToBuffer(INTER_MEDIUM_URL, INTER_MEDIUM_PATH);
        await downloadToBuffer(INTER_BOLD_URL, INTER_BOLD_PATH);
        await downloadToBuffer(BG_URL, BG_LOCAL_PATH);

        // Registrasi Font ke global canvas engine cukup 1 kali saja
        GlobalFonts.registerFromPath(POPPINS_PATH, 'PoppinsBcaApi');
        GlobalFonts.registerFromPath(INTER_MEDIUM_PATH, 'InterMediumBcaApi');
        GlobalFonts.registerFromPath(INTER_BOLD_PATH, 'InterBoldBcaApi');
        
        isAssetsLoaded = true;
    } catch (e) {
        console.error("Gagal menginisialisasi font/asset bca:", e);
    }
}

// Jalankan inisialisasi awal saat script dimuat pertama kali oleh sistem backend
initAssets();

module.exports = {
    method: 'get',
    path: '/api/fbca',
    handler: async (req, res) => {
        try {
            // Memastikan ulang aset font dan background terunduh sempurna
            await initAssets();

            const nameParam = req.query?.name || req.query?.nama;
            const rekParam = req.query?.rek || req.query?.rekening;
            const saldoParam = req.query?.saldo || req.query?.nominal;

            if (!nameParam || !rekParam || !saldoParam) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Parameter tidak lengkap! Masukkan name, rek, dan saldo.'
                });
            }

            // Standardisasi teks input
            const txtNama = `HALO, ${nameParam.trim().toUpperCase()}`;
            const txtRek = rekParam.trim();
            const txtSaldo = saldoParam.trim();

            // Memuat file background F1
            const bgImg = await loadImage(BG_LOCAL_PATH);

            // Set dimensi canvas secara otomatis berdasarkan ukuran asli gambar template
            const canvasWidth = bgImg.width;
            const canvasHeight = bgImg.height;

            const canvas = createCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext('2d');

            // Gambar dasar template utama
            ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);

            // Konfigurasi baseline teks
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // =========================================================
            // PROSES RENDERING TEKS (PRESET SIMULATOR 100% AKURAT)
            // =========================================================

            // 1. Kategori Nama (Warna Putih - Poppins SemiBold)
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `600 34px PoppinsBcaApi`;
            ctx.fillText(txtNama, 180, 43);

            // 2. Kategori Rekening (Warna Putih - Inter Medium)
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `500 35px InterMediumBcaApi`;
            ctx.fillText(txtRek, 230, 134);

            // 3. Kategori Saldo (Warna Abu Tua #4F4F4F - Inter Bold)
            ctx.fillStyle = '#4F4F4F';
            ctx.font = `700 46px InterBoldBcaApi`;
            ctx.fillText(txtSaldo, 184, 225);

            // Mengonversi canvas menjadi buffer gambar mentah format PNG
            const imageBuffer = await canvas.encode('png');

            // Kirim respons dalam wujud format gambar stream langsung ke client
            res.setHeader('Content-Type', 'image/png');
            return res.send(imageBuffer);

        } catch (err) {
            console.error(err);
            return res.status(500).json({
                status: false,
                creator: "Rin imup",
                message: err.message || 'Terjadi kesalahan sistem internal pada canvas engine.'
            });
        }
    },
    metadata: {
        category: 'Maker',
        description: 'Membuat generator Fake saldo bca dengan costum nama,no rek dan saldo.',
        parameters: [
            { name: 'name', in: 'query', required: true, description: 'Nama pemilik rekening' },
            { name: 'rek', in: 'query', required: true, description: 'Nomor rekening bank' },
            { name: 'saldo', in: 'query', required: true, description: 'Nominal saldo rekening' }
        ]
    }
};
