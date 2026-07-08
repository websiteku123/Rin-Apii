const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const FONT_URL = 'https://raw.githubusercontent.com/ryyntwx/pakeff2/refs/heads/main/TeutonNormal.otf';
const TEMPLATE_BASE_URL = 'https://raw.githubusercontent.com/ryyntwx/pakeff2/refs/heads/main/';

let fontLoaded = false;

async function downloadFile(url, targetPath) {
    try {
        const response = await fetch(url, { timeout: 15000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(targetPath, buffer);
        return true;
    } catch (err) {
        console.error(`[DOWNLOAD ERROR] ${url}:`, err.message);
        return false;
    }
}

module.exports = {
    method: 'get',
    path: '/maker/fakeff',
    handler: async (req, res) => {
        try {
            const username = req.query?.name || req.query?.username || req.query?.q;
            const lobbyParam = req.query?.template || req.query?.lobby || req.query?.t;

            if (!username) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Parameter username diperlukan! Contoh: ?username=Ditzzx&lobby=5'
                });
            }

            let lobbyNumber;
            if (lobbyParam && lobbyParam.toLowerCase() === 'random') {
                lobbyNumber = Math.floor(Math.random() * 17) + 1;
            } else if (lobbyParam) {
                const parsed = parseInt(lobbyParam, 10);
                if (isNaN(parsed) || parsed < 1 || parsed > 17) {
                    return res.status(400).json({
                        status: false,
                        creator: "Rin imup",
                        message: 'Lobby harus angka 1-17 atau "random"'
                    });
                }
                lobbyNumber = parsed;
            } else {
                lobbyNumber = Math.floor(Math.random() * 17) + 1;
            }

            const lobbyDir = path.join('/tmp', 'lobby');
            const fontPath = path.join('/tmp', 'TeutonNormal.otf');

            if (!fs.existsSync(lobbyDir)) {
                fs.mkdirSync(lobbyDir, { recursive: true });
            }

            if (!fs.existsSync(fontPath)) {
                console.log('[FONT] Downloading TeutonNormal.otf...');
                const success = await downloadFile(FONT_URL, fontPath);
                if (!success) {
                    return res.status(500).json({
                        status: false,
                        creator: "Rin imup",
                        message: "Gagal download font. Coba lagi."
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
                        message: "Gagal load font: " + err.message
                    });
                }
            }

            let templatePath = path.join(lobbyDir, `${lobbyNumber}.jpg`);
            
            if (!fs.existsSync(templatePath)) {
                console.log(`[TEMPLATE] Downloading ${lobbyNumber}.jpg...`);
                const success = await downloadFile(`${TEMPLATE_BASE_URL}${lobbyNumber}.jpg`, templatePath);
                
                if (!success) {
                    const files = fs.readdirSync(lobbyDir).filter(f => f.endsWith('.jpg'));
                    if (files.length > 0) {
                        const fallback = files[Math.floor(Math.random() * files.length)];
                        templatePath = path.join(lobbyDir, fallback);
                        lobbyNumber = parseInt(fallback.split('.')[0], 10) || 1;
                        console.log(`[FALLBACK] Using template: ${fallback}`);
                    } else {
                        return res.status(503).json({
                            status: false,
                            creator: "Rin imup",
                            message: "Template sedang diunduh. Coba lagi dalam 5 detik."
                        });
                    }
                }
            }

            const templateImage = await loadImage(templatePath);
            const canvas = createCanvas(templateImage.width, templateImage.height);
            const ctx = canvas.getContext('2d');

            // Gambar background template asli
            ctx.drawImage(templateImage, 0, 0);

            // Kalkulasi ukuran Font berdasarkan panjang karakter teks
            const fontSize = username.length < 8 ? canvas.width * 0.046 : 
                           username.length <= 15 ? canvas.width * 0.047 : 
                           canvas.width * 0.036;
            
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.font = `${fontSize}px TeutonNormal`;
            
            const textWidth = ctx.measureText(username).width;
            
            // Posisi X dan Y mengikuti formula eksak dari setelan FFmpeg/Bot
            const posX = (canvas.width - textWidth) / 2 + 38;
            const posY = canvas.height * 0.788;

            // ==========================================
            // AMBIL ALIH CANVAS LOGIC (WARNA & GRADIENT)
            // ==========================================
            
            // 1. RENDER SHADOW (Efek bayangan hitam tipis transparan di belakang teks)
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillText(username, posX, posY);

            // Matikan native shadow canvas agar tidak merusak render gradient teks utama
            ctx.shadowColor = 'transparent';
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // 2. CREATE METALLIC GRADIENT (Transisi Putih ke Oranye dari kiri ke kanan teks)
            // Diambil dari rumus blend FFmpeg: W*0.2 (White) ke W*0.8 (Orange) dihitung dari titik koordinat teks
            const gradient = ctx.createLinearGradient(posX, posY, posX + textWidth, posY);
            gradient.addColorStop(0.0, '#FFFFFF'); // Sisi kiri Putih Bersih
            gradient.addColorStop(0.3, '#FFFFFF'); // Transisi mulai berjalan lembut
            gradient.addColorStop(0.8, '#FFCC00'); // Sisi kanan Oranye khas FF
            gradient.addColorStop(1.0, '#FFCC00');

            // Warnai teks utama dengan hasil campuran gradient di atas
            ctx.fillStyle = gradient;
            ctx.fillText(username, posX, posY);

            // ==========================================

            const buffer = canvas.toBuffer('image/jpeg', { quality: 85 });

            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('X-Username', username);
            res.setHeader('X-Lobby', String(lobbyNumber));
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
        description: 'Membuat gambar Fake lobby Free Fire.',
        parameters: [
            {
                name: 'username',
                in: 'query',
                required: true,
                description: 'Username atau nickname'
            },
            {
                name: 'lobby',
                in: 'query',
                required: false,
                description: 'Nomor lobby 1-17 atau "random"'
            }
        ],
    }
};
