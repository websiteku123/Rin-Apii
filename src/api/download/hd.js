const axios = require('axios');
const crypto = require('crypto');
const FormDataHd2 = require('form-data');

// Fungsi helper BeautyPlus
function hd2GuessMime(buffer) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return { suffix: 'jpg', mime: 'image/jpeg' };
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return { suffix: 'png', mime: 'image/png' };
    if (buffer[0] === 0x52 && buffer[1] === 0x49) return { suffix: 'webp', mime: 'image/webp' };
    return { suffix: 'jpg', mime: 'image/jpeg' };
}

function hd2AmzDate(d = new Date()) {
    return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function hd2Hmac(key, data, enc) {
    return crypto.createHmac('sha256', key).update(data).digest(enc);
}

function hd2SignPolicy(secret, policy, date, region) {
    const kDate = hd2Hmac(`AWS4${secret}`, date);
    const kRegion = hd2Hmac(kDate, region);
    const kService = hd2Hmac(kRegion, 's3');
    const kSigning = hd2Hmac(kService, 'aws4_request');
    return hd2Hmac(kSigning, policy, 'hex');
}

module.exports = {
    method: 'get',
    path: '/tools/hd',
    handler: async (req, res) => {
        try {
            const { url } = req.query;
            let hd2Buf = null;

            // 1. Ambil source gambar (Mendukung via URL API atau fallback ke object message 'm' jika terintegrasi bot)
            if (url) {
                const downloadRes = await axios.get(url, { responseType: 'arraybuffer' });
                hd2Buf = Buffer.from(downloadRes.data);
            } else if (typeof m !== 'undefined') {
                hd2Buf = m.quoted?.isMedia ? await m.quoted.download() : null;
                if (!hd2Buf && m.message?.imageMessage) {
                    const { downloadContentFromMessage: dlHd2 } = require('@whiskeysockets/baileys');
                    const stream = await dlHd2(m.message.imageMessage, 'image');
                    let tmp = Buffer.from([]);
                    for await (const chunk of stream) tmp = Buffer.concat([tmp, chunk]);
                    hd2Buf = tmp;
                }
                if (!hd2Buf && m.quoted) hd2Buf = await m.quoted.download();
            }

            if (!hd2Buf) {
                return res.status(400).json({
                    status: false,
                    creator: "Rin imup",
                    message: 'Gagal mengambil gambar. Sediakan parameter ?url=... atau kirim gambar via media chat.'
                });
            }

            const hd2Uid = `bplus-${crypto.randomBytes(16).toString('hex')}`;
            const hd2UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';
            const hd2Origin = 'https://www.beautyplus.com';
            const hd2Referer = 'https://www.beautyplus.com/id/image-enhancer';

            const hd2Headers = (uid) => ({
                'accept': 'application/json, text/plain, */*',
                'x-tenant': 'bplus',
                'x-locale': 'id',
                'x-anonymous-uid': uid,
                'origin': hd2Origin,
                'referer': hd2Referer,
                'user-agent': hd2UA
            });

            const hd2Api = axios.create({ timeout: 60000, validateStatus: () => true, headers: { 'user-agent': hd2UA } });
            const { suffix: hd2Suffix, mime: hd2Mime } = hd2GuessMime(hd2Buf);

            // Step 1: Get upload policy
            const policyRes = await hd2Api.get(
                `https://strategy.pixocial.com/upload/policy?app=BeautyPlusWeb&suffix=${hd2Suffix}&type=tmp-photo`,
                { headers: { 'accept': '*/*', 'origin': hd2Origin, 'referer': `${hd2Origin}/`, 'user-agent': hd2UA } }
            );
            if (policyRes.status !== 200 || !Array.isArray(policyRes.data)) throw new Error('Gagal mendapatkan policy upload S3');
            const oss = policyRes.data[0].oss;

            // Step 2: Upload ke S3
            const ossNow = new Date();
            const xAmzDate = hd2AmzDate(ossNow);
            const ossDate = xAmzDate.slice(0, 8);
            const ossCreds = oss.credentials;
            const ossCredential = `${ossCreds.access_key}/${ossDate}/${oss.region}/s3/aws4_request`;

            const ossPolicyObj = {
                expiration: new Date(ossNow.getTime() + 600000).toISOString(),
                conditions: [
                    { bucket: oss.bucket },
                    ['starts-with', '$key', 'tmp-photo/'],
                    ['starts-with', '$Content-Type', 'image/'],
                    { success_action_status: '200' },
                    { 'X-Amz-Credential': ossCredential },
                    { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256' },
                    { 'X-Amz-Security-Token': ossCreds.session_token },
                    { 'X-Amz-Date': xAmzDate }
                ]
            };

            const ossPolicy = Buffer.from(JSON.stringify(ossPolicyObj)).toString('base64');
            const ossSig = hd2SignPolicy(ossCreds.secret_key, ossPolicy, ossDate, oss.region);

            const ossForm = new FormDataHd2();
            ossForm.append('key', oss.key);
            ossForm.append('Content-Type', hd2Mime);
            ossForm.append('success_action_status', '200');
            ossForm.append('X-Amz-Credential', ossCredential);
            ossForm.append('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
            ossForm.append('X-Amz-Security-Token', ossCreds.session_token);
            ossForm.append('X-Amz-Date', xAmzDate);
            ossForm.append('Policy', ossPolicy);
            ossForm.append('X-Amz-Signature', ossSig);
            ossForm.append('file', hd2Buf, { filename: `image.${hd2Suffix}`, contentType: hd2Mime });

            const uploadRes = await hd2Api.post(
                `https://${oss.bucket}.oss-ap-southeast-1.aliyuncs.com/`,
                ossForm,
                { headers: { ...ossForm.getHeaders(), 'origin': hd2Origin, 'referer': `${hd2Origin}/`, 'user-agent': hd2UA, 'accept': '*/*' }, maxBodyLength: Infinity, maxContentLength: Infinity }
            );
            if (uploadRes.status !== 200) throw new Error('Gagal mengunggah gambar ke server storage');
            const hd2SourceUrl = oss.data;

            // Step 3: Cek quota
            const quotaRes = await hd2Api.get(
                `https://www.beautyplus.com/core-api/v1/img-enhancer/quota/info?scene=HD`,
                { headers: hd2Headers(hd2Uid) }
            );
            if (quotaRes.status !== 200) throw new Error('Gagal memeriksa sisa kuota API');
            if (quotaRes.data?.needUpgrade) throw new Error('Kuota server habis, memerlukan upgrade premium');

            // Step 4: Buat task
            const taskRes = await hd2Api.post(
                'https://www.beautyplus.com/core-api/v2/img-enhancer/task',
                { sourceUrl: hd2SourceUrl, scene: 'HD', ratio: 2, realRatio: 4, functionRatio: null },
                { headers: { ...hd2Headers(hd2Uid), 'content-type': 'application/json' } }
            );
            if (taskRes.status !== 201 || typeof taskRes.data !== 'string') throw new Error('Gagal membuat antrean pemrosesan gambar');
            const hd2TaskId = taskRes.data;

            // Step 5: SSE poll result
            const hd2ResultUrl = await new Promise((resolve, reject) => {
                let raw = '';
                let finish = false;

                hd2Api.get(
                    `https://www.beautyplus.com/core-api/v2/img-enhancer/query-sse/${hd2TaskId}`,
                    { responseType: 'stream', timeout: 120000, headers: { ...hd2Headers(hd2Uid), 'accept': 'text/event-stream', 'authorization': '' } }
                ).then(sseRes => {
                    if (sseRes.status !== 200) return reject(new Error('Koneksi Stream (SSE) gagal'));

                    const timer = setTimeout(() => {
                        if (!finish) { finish = true; sseRes.data.destroy(); reject(new Error('Waktu pemrosesan gambar habis (Timeout)')); }
                    }, 120000);

                    sseRes.data.on('data', chunk => {
                        raw += chunk.toString();
                        for (const match of raw.matchAll(/^data:\s*(.+)$/gm)) {
                            try {
                                const d = JSON.parse(match[1]);
                                if (d.status === 'success' && d.effectUrl) {
                                    finish = true; clearTimeout(timer); sseRes.data.destroy(); resolve(d.effectUrl); return;
                                }
                                if (d.status === 'failed' || d.status === 'error') {
                                    finish = true; clearTimeout(timer); sseRes.data.destroy(); reject(new Error('Proses AI gagal meningkatkan resolusi gambar')); return;
                                }
                            } catch (_) {}
                        }
                    });
                    sseRes.data.on('end', () => { if (!finish) { finish = true; clearTimeout(timer); reject(new Error('Hasil pemrosesan kosong')); } });
                    sseRes.data.on('error', err => { if (!finish) { finish = true; clearTimeout(timer); reject(err); } });
                }).catch(reject);
            });

            if (!hd2ResultUrl) throw new Error('Url hasil akhir tidak ditemukan');

            // Format keluaran response JSON yang sukses
            res.json({
                status: true,
                creator: "Rin imup",
                data: {
                    url: hd2ResultUrl,
                    type: hd2Mime,
                    filename: `hd_enhancer_${Date.now()}.${hd2Suffix}`
                }
            });

        } catch (err) {
            res.status(500).json({
                status: false,
                creator: "Rin imup",
                message: err.message || 'Terjadi kesalahan internal pada server'
            });
        }
    },
    metadata: {
        category: 'Tools',
        description: 'Meningkatkan resolusi dan kualitas gambar (HD Image Enhancer via BeautyPlus)',
        parameters: [
            {
                name: 'url',
                in: 'query',
                required: false,
                description: 'URL gambar yang ingin ditingkatkan kualitasnya'
            }
        ]
    }
};
