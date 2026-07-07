const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const FONT_URL = 'https://raw.githubusercontent.com/ryyntwx/pakeff2/refs/heads/main/TeutonNormal.otf';
const TEMPLATE_BASE_URL = 'https://raw.githubusercontent.com/ryyntwx/pakeff2/refs/heads/main/';

let fontLoaded = false;
let templateCache = {};
let isDownloading = false;

async function downloadFile(url, targetPath) {
    try {
        const response = await fetch(url, { timeout: 10000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(targetPath, buffer);
        return true;
    } catch (err) {
        console.error(`[DOWNLOAD ERROR] ${url}:`, err.message);
        return false;
    }
}

async function preloadTemplates() {
    if (isDownloading) return;
    isDownloading = true;
    const lobbyDir = path.join(process.cwd(), 'lobby');
    if (!fs.existsSync(lobbyDir)) fs.mkdirSync(lobbyDir, { recursive: true });

    for (let i = 1; i <= 17; i++) {
        const templatePath = path.join(lobbyDir, `${i}.jpg`);
        if (!fs.existsSync(templatePath)) {
            console.log(`[PRELOAD] Downloading template ${i}.jpg...`);
            await downloadFile(`${TEMPLATE_BASE_URL}${i}.jpg`, templatePath);
        }
    }
    isDownloading = false;
    console.log('[PRELOAD] All templates ready!');
}

preloadTemplates();

function escapeDrawtext(value = "") {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\\\'")
        .replace(/,/g, "\\,")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/%/g, "\\%")
        .replace(/[<>|&;$\r\n]/g, " ")
        .trim();
}

module.exports = {
    method: 'get',
    path: '/maker/fakeff',
    handler: async (req, res) => {
        const lobbyDir = path.join(process.cwd(), 'lobby');
        const fontPath = path.join(process.cwd(), 'TeutonNormal.otf');

        if (!fs.existsSync(lobbyDir)) fs.mkdirSync(lobbyDir, { recursive: true });

        try {
            const inputName = req.query?.name || req.query?.q;
            const templateParam = req.query?.template || req.query?.t;

            if (!inputName) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Parameter nama diperlukan! Contoh: ?name=Rin Store&template=5'
                });
            }

            const cleanName = escapeDrawtext(inputName);
            if (!cleanName) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Nama tidak boleh kosong atau berisi karakter ilegal.'
                });
            }

            if (!fs.existsSync(fontPath)) {
                console.log('[FONT] Mengunduh font TeutonNormal.otf...');
                const success = await downloadFile(FONT_URL, fontPath);
                if (!success) {
                    return res.status(500).json({
                        status: false,
                        creator: "Rin imup",
                        message: "Gagal mengunduh font. Pastikan koneksi internet stabil."
                    });
                }
            }

            if (!fontLoaded) {
                try {
                    GlobalFonts.registerFromPath(fontPath, 'TeutonNormal');
                    fontLoaded = true;
                } catch (err) {
                    return res.status(500).json({
                        status: false,
                        creator: "Rin imup",
                        message: "Gagal memuat font: " + err.message
                    });
                }
            }

            let randomNum;
            let isRandom = false;

            if (templateParam && templateParam.toLowerCase() === 'random') {
                randomNum = Math.floor(Math.random() * 17) + 1;
                isRandom = true;
            } else if (templateParam) {
                const parsedNum = parseInt(templateParam, 10);
                if (isNaN(parsedNum) || parsedNum < 1 || parsedNum > 17) {
                    return res.status(400).json({
                        status: false,
                        creator: "Rin imup",
                        message: 'Template hanya menerima angka 1-17 atau kata "random".'
                    });
                }
                randomNum = parsedNum;
            } else {
                randomNum = Math.floor(Math.random() * 17) + 1;
                isRandom = true;
            }

            let localTemplatePath = path.join(lobbyDir, `${randomNum}.jpg`);

            if (!fs.existsSync(localTemplatePath)) {
                console.log(`[TEMPLATE] Mengunduh ${randomNum}.jpg...`);
                const success = await downloadFile(`${TEMPLATE_BASE_URL}${randomNum}.jpg`, localTemplatePath);
                
                if (!success) {
                    const files = fs.readdirSync(lobbyDir).filter(f => f.endsWith('.jpg'));
                    if (files.length > 0) {
                        const fallbackFile = files[Math.floor(Math.random() * files.length)];
                        randomNum = parseInt(fallbackFile.split('.')[0], 10) || 1;
                        localTemplatePath = path.join(lobbyDir, fallbackFile);
                        console.log(`[FALLBACK] Pakai template: ${fallbackFile}`);
                    } else {
                        return res.status(503).json({
                            status: false,
                            creator: "Rin imup",
                            message: "Template sedang diunduh. Silahkan coba lagi dalam 5 detik!"
                        });
                    }
                }
            }

            const templateImage = await loadImage(localTemplatePath);
            
            let width = templateImage.width;
            let height = templateImage.height;
            
            if (width > 2000) {
                const ratio = 2000 / width;
                width = 2000;
                height = Math.round(templateImage.height * ratio);
            }

            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            ctx.drawImage(templateImage, 0, 0, width, height);

            const fontSize = cleanName.length < 8 ? width * 0.046 : cleanName.length <= 15 ? width * 0.047 : width * 0.036;
            
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.font = `${fontSize}px TeutonNormal`;
            
            const textWidth = ctx.measureText(cleanName).width;
            const posX = (width - textWidth) / 2 + 38;
            const posY = height * 0.788;

            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillText(cleanName, posX, posY);

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(cleanName, posX, posY);

            ctx.fillStyle = '#FFCC00';
            ctx.fillText(cleanName, posX, posY);

            const buffer = canvas.toBuffer('image/jpeg', { quality: 80 });

            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('X-Template-Used', String(randomNum));
            res.setHeader('X-Random', String(isRandom));
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(buffer);

        } catch (err) {
            console.error('[ERROR]', err);
            res.status(500).json({
                status: false,
                creator: "Rin imup",
                message: err.message || 'Terjadi kesalahan internal.'
            });
        }
    },
    metadata: {
        category: 'Maker',
        description: 'Membuat gambar lobby custom Free Fire dengan kualitas hd cocok buat bahan jj.',
        parameters: [
            {
                name: 'name',
                in: 'query',
                required: true,
                description: 'Nama atau nickname yang ingin ditempel pada lobby Free Fire'
            },
            {
                name: 'template',
                in: 'query',
                required: false,
                description: 'Nomor template 1-17 atau kata "random" untuk pilih acak atau Default: random'
            }
        ],
    }
};
