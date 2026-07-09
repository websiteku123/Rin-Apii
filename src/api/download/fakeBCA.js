const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { writeFileSync, existsSync } = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Konfigurasi URL Aset Global API
const BG_URL = 'https://raw.githubusercontent.com/ryyntwx/allimagerin/refs/heads/main/F1.png';
const POPPINS_URL = 'https://fonts.gstatic.com/s/poppins/v23/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2';
const INTER_MEDIUM_URL = 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2';
const INTER_BOLD_URL = 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7SUc.woff2';

// Tempat penyimpanan aset di direktori temporary OS
const TMP_DIR = process.env.TMPDIR || '/tmp';
const BG_LOCAL_PATH = path.join(TMP_DIR, 'template_bca_f1.png');
const POPPINS_PATH = path.join(TMP_DIR, 'Poppins-SemiBold.ttf');
const INTER_MEDIUM_PATH = path.join(TMP_DIR, 'Inter-Medium.ttf');
const INTER_BOLD_PATH = path.join(TMP_DIR, 'Inter-Bold.ttf');

async function downloadToBuffer(url, destPath) {
    if (existsSync(destPath)) return;
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buf);
}

async function ensureAssets() {
    // Unduh semua Font jika belum ada di direktori tmp
    await downloadToBuffer(POPPINS_URL, POPPINS_PATH);
    await downloadToBuffer(INTER_MEDIUM_URL, INTER_MEDIUM_PATH);
    await downloadToBuffer(INTER_BOLD_URL, INTER_BOLD_PATH);

    // Registrasi Font ke dalam global scope canvas engine dengan penamaan unik
    GlobalFonts.registerFromPath(POPPINS_PATH, 'PoppinsBcaApi');
    GlobalFonts.registerFromPath(INTER_MEDIUM_PATH, 'InterMediumBcaApi');
    GlobalFonts.registerFromPath(INTER_BOLD_PATH, 'InterBoldBcaApi');

    // Cek ketersediaan background utama
    await downloadToBuffer(BG_URL, BG_LOCAL_PATH);
}

module.exports = {
    method: 'get',
    path: '/api/fbca',
    handler: async (req, res) => {
        try {
            // Pengambilan parameter query fleksibel sesuai arsitektur Brat API
            const nameParam = req.query?.name || req.query?.nama;
            const rekParam = req.query?.rek || req.query?.rekening;
            const saldoParam = req.query?.saldo || req.query?.nominal;

            if (!nameParam || !rekParam || !saldoParam) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Parameter kurang lengkap! Diperlukan: name/nama, rek/rekening, dan saldo/nominal.'
                });
            }

            // Standardisasi format teks input
            const txtNama = `HALO, ${nameParam.trim().toUpperCase()}`;
            const txtRek = rekParam.trim();
            const txtSaldo = saldoParam.trim();

            // Memastikan font & gambar background siap digunakan
            await ensureAssets();

            // Memuat gambar background F1 secara dinamis terlebih dahulu
            const bgImg = await loadImage(BG_LOCAL_PATH);

            // TAKTIK FIX GEPENG: Ambil dimensi real lebar & tinggi asli dari gambar cetakan
            const canvasWidth = bgImg.width;
            const canvasHeight = bgImg.height;

            // Inisialisasi Canvas mengikuti ukuran asli gambar template agar tidak kegencet
            const canvas = createCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext('2d');

            // Gambar background penuh tanpa merusak aspek rasio asli
            ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);

            // Konfigurasi perataan teks
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // =========================================================
            // PROSES RENDERING DATA (PRESET SIMULATOR 100% PERSIS)
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

            // Encode hasil olah canvas langsung ke stream buffer gambar PNG mentah
            const imageBuffer = await canvas.encode('png');

            // Berikan response stream content gambar langsung ke browser / bot pemanggil
            res.setHeader('Content-Type', 'image/png');
            return res.send(imageBuffer);

        } catch (err) {
            console.error(err);
            return res.status(500).json({
                status: false,
                creator: "Rin imup",
                message: err.message || 'Terjadi kesalahan sistem internal pada pembuatan canvas FBCA.'
            });
        }
    },
    metadata: {
        category: 'Maker',
        description: 'Membuat generator gambar dashboard mutasi saldo BCA otomatis tanpa gepeng.',
        parameters: [
            { name: 'name, contoh: RIN IMUP', in: 'query', required: true, description: 'Nama pemilik rekening' },
            { name: 'no rek, contoh: 111 - 222 - 444', in: 'query', required: true, description: 'Nomor rekening bank' },
            { name: 'saldo, contoh: 1,000,000', in: 'query', required: true, description: 'Nominal saldo rekening' }
        ]
    }
};
