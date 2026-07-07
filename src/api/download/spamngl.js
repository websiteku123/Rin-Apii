const crypto = require('crypto');
const fetch = require('node-fetch');

// Fungsi utama penanganan pengiriman spam pesan ke API NGL Link (Fixed Version)
async function sendSpamMessage(username, message, spamCount) {
    let counter = 0;
    while (counter < spamCount) {
        try {
            // Generate deviceId baru yang menyerupai format app/web modern
            const deviceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(21).toString("hex");
            const url = "https://ngl.link/api/submit";
            
            const headers = {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
                "Accept": "*/*",
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "Referer": `https://ngl.link/${username}`,
                "Origin": "https://ngl.link"
            };

            // Pastikan parameter gameSlug dan referrer kosong jika mengirim ke NGL utama
            const body = new URLSearchParams({
                username: username,
                question: message,
                deviceId: deviceId,
                gameSlug: '',
                referrer: ''
            }).toString();
            
            const response = await fetch(url, {
                method: "POST",
                headers,
                body,
                mode: "cors"
            });

            // Baca text response untuk melihat apakah diblock atau sukses asli
            const responseText = await response.text();

            if (response.status !== 200) {
                console.log(`[NGL] Terkena Limit, Menunggu 25 detik...`);
                await new Promise(resolve => setTimeout(resolve, 25000));
            } else {
                counter++;
                console.log(`[NGL] Berhasil Terkirim: ${counter}/${spamCount} | Response: ${responseText}`);
            }
        } catch (error) {
            console.error(`[NGL] Error internal saat hit API:`, error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

module.exports = {
    method: 'get', 
    path: '/tools/ngl',
    isApikey: true,
    handler: async (req, res) => {
        try {
            const username = req.query?.username || req.body?.username || req.query?.q || req.body?.q;
            const message = req.query?.message || req.body?.message;
            const count = req.query?.count || req.body?.count;
            const apikey = req.query?.apikey || req.body?.apikey;

            if (!apikey) {
                return res.status(401).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'API Key diperlukan untuk mengakses endpoint ini.'
                });
            }

            if (!username || !message || !count) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Parameter diperlukan: ?username=...&message=...&count=...'
                });
            }

            const spamCount = parseInt(count, 10);
            if (isNaN(spamCount) || spamCount <= 0) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Jumlah hit (count) harus berupa angka positif.'
                });
            }

            // Eksekusi pengiriman di background
            sendSpamMessage(username, message, spamCount).catch(err => {
                console.error('[NGL Background Error]:', err);
            });

            res.json({
                status: true,
                creator: "Rin imup",
                data: {
                    target: username,
                    message: message,
                    total_request: spamCount,
                    status_process: "Pesan sedang diproses masuk ke antrean server.",
                    message_status: 'Proses pemrosesan NGL selesai dilakukan'
                }
            });
        } catch (err) {
            res.status(500).json({
                status: false,
                creator: "Rin imup",
                message: err.message || 'Terjadi kesalahan saat memproses permintaan'
            });
        }
    },
    metadata: {
        category: "Tools",
        description: "Mengirim pesan anonim ke akun NGL Link target secara otomatis melalui endpoint API",
        parameters: [
            {
                name: "username",
                in: "query",
                required: true,
                description: "Username target akun NGL Link (contoh: awkarin)"
            },
            {
                name: "message",
                in: "query",
                required: true,
                description: "Isi teks pesan anonim"
            },
            {
                name: "count",
                in: "query",
                required: true,
                description: "Jumlah total pesan (angka)"
            },
            {
                name: "apikey",
                in: "query",
                required: true,
                description: "Masukkan API Key VIP Anda"
            }
        ]
    }
};
