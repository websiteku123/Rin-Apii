const express = require('express');
const chalk = require('chalk');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;

app.enable("trust proxy");
app.set("json spaces", 2);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

// ==========================================
// LOAD CONFIGURATION FROM config.json
// ==========================================
let config = {};
const configPath = path.join(__dirname, 'config.json');

try {
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
        console.warn(chalk.yellow('⚠️  Warning: config.json tidak ditemukan. Menggunakan fallback env / string kosong.'));
    }
} catch (error) {
    console.error(chalk.red('❌ Gagal membaca atau parse config.json:', error.message));
}

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID || "";
const VALID_API_KEY = config.API_KEY || "Rinn"; 

async function sendTelegramLog(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('Telegram token/chat ID not set');
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('Telegram log sent');
    } catch (err) {
        console.error('Telegram log error:', err.response ? err.response.data : err.message);
    }
}

// ==========================================
// 1. LOGGER DI PALING ATAS
// ==========================================
app.use((req, res, next) => {
    const start = Date.now();
    const originalSend = res.send;
    const requestUrl = req.originalUrl; 

    res.send = function(data) {
        const duration = Date.now() - start;
        const status = res.statusCode;

        const logMsg = `
<b>📥 Request</b>
<b>Method:</b> ${req.method}
<b>URL:</b> ${requestUrl}
<b>IP:</b> ${req.ip || req.connection.remoteAddress || '-'}
<b>User-Agent:</b> ${req.get('user-agent') || '-'}
<b>Status:</b> ${status}
<b>Duration:</b> ${duration}ms
        `;

        sendTelegramLog(logMsg.trim());
        return originalSend.call(this, data);
    };

    next();
});

// ==========================================
// 2. MIDDLEWARE INJECT CREATOR RESPONSE
// ==========================================
const CREATOR = process.env.API_CREATOR || "Welcome to  Api Rinn";
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (data) {
        if (data && typeof data === 'object') {
            const responseData = {
                status: data.status,
                creator: CREATOR,
                ...data
            };
            return originalJson.call(this, responseData);
        }
        return originalJson.call(this, data);
    };
    next();
});

const routeMetadata = [];
const apiFolder = path.join(__dirname, './src/api');

// ==========================================
// 3. MIDDLEWARE CEK API KEY (MENGGUNAKAN PROPERTI INTERNAL)
// ==========================================
app.use((req, res, next) => {
    if (req.path.startsWith('/src/') || req.path === '/openapi.json' || req.path === '/' || req.path.startsWith('/api-page')) {
        return next();
    }

    const matchedRoute = routeMetadata.find(route => {
        const methodMatch = route.method === 'ALL' || route.method.toLowerCase() === req.method.toLowerCase();
        if (!methodMatch) return false;

        const routePath = route.path.split('?')[0];
        const regexStr = routePath.replace(/:\w+/g, '([^/]+)');
        const regex = new RegExp('^' + regexStr + '$');
        return regex.test(req.path);
    });

    // Pengecekan membaca status pengaman internal dari config.json
    if (matchedRoute && matchedRoute.checkSecretKey) {
        const apiKey = req.headers['x-api-key'] || req.query.apikey || req.body?.apikey;
        
        if (!apiKey || apiKey !== VALID_API_KEY) {
            return res.status(401).json({
                status: false,
                message: 'Unauthorized: Invalid or missing API Key. Silahkan isi kolom input apikey dengan benar.'
            });
        }
    }
    next();
});

function registerRoute(routeDef, category) {
    const { method, path: routePath, handler, metadata = {} } = routeDef;
    if (!method || !routePath || typeof handler !== 'function') {
        console.warn(chalk.yellow(`⚠️  Route invalid di ${category}, skip.`));
        return;
    }

    const methodLower = method.toLowerCase();
    if (app[methodLower]) {
        app[methodLower](routePath, handler);
        console.log(chalk.bgHex('#FFFF99').hex('#333').bold(` Loaded: ${method.toUpperCase()} ${routePath}`));
    } else {
        console.warn(chalk.yellow(`⚠️  Method "${method}" tidak dikenal di ${category}`));
        return;
    }

    // Menentukan apakah rute ini membutuhkan pengaman kunci rahasia
    const needsKey = routeDef.isApikey || metadata.isApikey || false;

    routeMetadata.push({
        method: method.toUpperCase(),
        path: routePath,
        category: metadata.category || category || 'Umum',
        description: metadata.description || '',
        parameters: metadata.parameters || [],
        // Diubah ke false agar komponen input bawaan di atas menghilang secara visual dari halaman UI
        isApikey: false, 
        // Penanda rahasia agar backend Express kamu tetap mengunci rute ini di latar belakang
        checkSecretKey: needsKey 
    });
}

// Load otomatis file API
if (fs.existsSync(apiFolder)) {
    fs.readdirSync(apiFolder).forEach((subfolder) => {
        const subfolderPath = path.join(apiFolder, subfolder);
        if (!fs.statSync(subfolderPath).isDirectory()) return;

        fs.readdirSync(subfolderPath).forEach((file) => {
            if (path.extname(file) !== '.js') return;

            const filePath = path.join(subfolderPath, file);
            try {
                const exported = require(filePath);

                if (Array.isArray(exported)) {
                    exported.forEach((routeDef) => {
                        if (!routeDef.metadata) routeDef.metadata = {};
                        if (!routeDef.metadata.category) routeDef.metadata.category = subfolder;
                        registerRoute(routeDef, subfolder);
                    });
                } else if (typeof exported === 'object' && exported.handler) {
                    if (!exported.metadata) exported.metadata = {};
                    if (!exported.metadata.category) exported.metadata.category = subfolder;
                    registerRoute(exported, subfolder);
                } else if (typeof exported === 'function') {
                    exported(app);
                    console.log(chalk.yellow(`⚠️  Legacy style detected: ${file} (metadata tidak tersimpan)`));
                } else {
                    console.warn(chalk.yellow(`⚠️  Format tidak dikenali di ${file}, skip.`));
                }
            } catch (err) {
                console.error(chalk.red(`❌ Gagal load ${file}: ${err.message}`));
            }
        });
    });
}

console.log(chalk.bgHex('#90EE90').hex('#333').bold(' Load Complete! ✓ '));
console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Total Routes Loaded: ${routeMetadata.length} `));

// Static files routing & default pages
app.use('/', express.static(path.join(__dirname, 'api-page')));
app.use('/src', express.static(path.join(__dirname, 'src')));

app.get('/openapi.json', (req, res) => {
    res.json({
        creator: CREATOR,
        total: routeMetadata.length,
        routes: routeMetadata
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'api-page', 'index.html'));
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'api-page', '404.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).sendFile(path.join(__dirname, 'api-page', '500.html'));
});

app.listen(PORT, () => {
    console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Server is running on port ${PORT} `));
});

module.exports = app;
