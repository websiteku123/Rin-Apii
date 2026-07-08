const express = require('express');
const chalk = require('chalk');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.enable("trust proxy");
app.set("json spaces", 2);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

const CREATOR = process.env.API_CREATOR || "Rin imup";
const VALID_API_KEY = process.env.API_KEY || "Rinn";

// ==========================================
// SKIP TELEGRAM LOG (MEMPERCEPAT)
// ==========================================
// Telegram di-disable untuk menghindari timeout

// ==========================================
// MIDDLEWARE INJECT CREATOR (OPTIMASI)
// ==========================================
app.use((req, res, next) => {
    const originalJson = res.json;
    const originalSend = res.send;

    res.json = function(data) {
        if (Buffer.isBuffer(data)) {
            return originalSend.call(this, data);
        }
        if (data && typeof data === 'object' && !res.get('Content-Type')?.startsWith('image/')) {
            const responseData = {
                status: data.status !== undefined ? data.status : true,
                creator: CREATOR,
                ...data
            };
            return originalJson.call(this, responseData);
        }
        return originalJson.call(this, data);
    };

    res.send = function(data) {
        const contentType = res.get('Content-Type');
        if (Buffer.isBuffer(data) || (contentType && contentType.startsWith('image/'))) {
            return originalSend.call(this, data);
        }
        return originalSend.call(this, data);
    };
    next();
});

const routeMetadata = [];
const apiFolder = path.join(__dirname, './src/api');

// ==========================================
// API KEY MIDDLEWARE (SEDERHANA)
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

    if (matchedRoute && matchedRoute.checkSecretKey) {
        const apiKey = req.headers['x-api-key'] || req.query.apikey || req.body?.apikey;

        if (!apiKey || apiKey !== VALID_API_KEY) {
            return res.status(401).json({
                status: false,
                message: 'Unauthorized: Invalid API Key.'
            });
        }
    }
    next();
});

function registerRoute(routeDef, category) {
    const { method, path: routePath, handler, metadata = {} } = routeDef;
    if (!method || !routePath || typeof handler !== 'function') {
        console.warn(chalk.yellow(`⚠️ Route invalid di ${category}`));
        return;
    }

    const methodLower = method.toLowerCase();
    if (app[methodLower]) {
        app[methodLower](routePath, handler);
        console.log(chalk.green(`✓ Loaded: ${method.toUpperCase()} ${routePath}`));
    } else {
        console.warn(chalk.yellow(`⚠️ Method "${method}" tidak dikenal`));
        return;
    }

    const needsKey = routeDef.isApikey || metadata.isApikey || false;

    routeMetadata.push({
        method: method.toUpperCase(),
        path: routePath,
        category: metadata.category || category || 'Umum',
        description: metadata.description || '',
        parameters: metadata.parameters || [],
        isApikey: false,
        checkSecretKey: needsKey
    });
}

// ==========================================
// LOAD ROUTES
// ==========================================
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
                } else {
                    console.warn(chalk.yellow(`⚠️ Format tidak dikenali di ${file}`));
                }
            } catch (err) {
                console.error(chalk.red(`❌ Gagal load ${file}: ${err.message}`));
            }
        });
    });
}

console.log(chalk.green(`✓ Total Routes Loaded: ${routeMetadata.length}`));

// ==========================================
// STATIC FILES
// ==========================================
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

// ==========================================
// ERROR HANDLER
// ==========================================
app.use((req, res) => {
    if (req.accepts('json')) {
        res.status(404).json({ status: false, message: 'Endpoint tidak ditemukan' });
    } else {
        res.status(404).sendFile(path.join(__dirname, 'api-page', '404.html'));
    }
});

app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    if (res.headersSent) return next(err);
    res.status(500).json({
        status: false,
        creator: CREATOR,
        message: err.message || 'Internal Server Error'
    });
});

app.listen(PORT, () => {
    console.log(chalk.green(`✓ Server running on port ${PORT}`));
});

module.exports = app;
