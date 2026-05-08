import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';

import disasterRoutes from './routes/disasterRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import cameraRoutes from './routes/cameraRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import tomtomProxy from './services/tomtomProxy.js';
import { initCrawler } from './services/crawler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const TOMTOM_KEY = (process.env.TOMTOM_KEY || '').trim();
const MONGO_URI = (process.env.MONGO_URI || '').trim();

// ============================================================
// 1. Validate required env vars before anything else
// ============================================================
const missingEnv = [];
if (!MONGO_URI) missingEnv.push('MONGO_URI');
if (!process.env.JWT_SECRET) missingEnv.push('JWT_SECRET');
if (!process.env.AI_WEBHOOK_SECRET) missingEnv.push('AI_WEBHOOK_SECRET');
if (missingEnv.length > 0) {
    console.error(`❌ Thiếu biến môi trường bắt buộc: ${missingEnv.join(', ')}. Server không thể khởi động.`);
    process.exit(1);
}

// Strength check — placeholder values phải bị reject
const PLACEHOLDER_SECRETS = new Set([
    'replace_me',
    'replace_me_with_a_long_random_string',
    'changeme',
    'secret',
    'password',
]);
for (const [name, val] of [
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['AI_WEBHOOK_SECRET', process.env.AI_WEBHOOK_SECRET],
]) {
    const v = String(val || '').trim();
    if (PLACEHOLDER_SECRETS.has(v.toLowerCase())) {
        console.error(`❌ ${name} vẫn là placeholder ('${v}'). Thay ngay bằng chuỗi random ≥ 32 ký tự.`);
        process.exit(1);
    }
    if (v.length < 16) {
        console.warn(`⚠️  ${name} chỉ ${v.length} ký tự — yếu. Khuyến nghị ≥ 32 ký tự ngẫu nhiên.`);
    } else if (v.length < 32) {
        console.warn(`⚠️  ${name} hơi ngắn (${v.length} ký tự). Khuyến nghị ≥ 32 ký tự.`);
    }
}

// ============================================================
// 2. MongoDB connection
// ============================================================
mongoose
    .connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log('✅ MongoDB Atlas connected'))
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    });

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected');
});

// ============================================================
// 3. Express app
// ============================================================
const app = express();

// Helmet — security headers (CSP nới lỏng vì frontend dùng inline + CDN)
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    })
);

// CORS cho HTTP routes (mobile app, frontend khác origin sẽ dùng).
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:3000'];

if (NODE_ENV === 'production' && allowedOrigins.includes('*')) {
    console.warn('⚠️  ALLOWED_ORIGINS=* trên production — mọi origin đều được phép. Nên đặt domain cụ thể.');
}

app.use(
    cors({
        origin: (origin, cb) => {
            // Cho phép request không có origin (mobile native, curl, server-to-server)
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                return cb(null, true);
            }
            return cb(new Error('Not allowed by CORS'));
        },
        credentials: false,
    })
);

app.use(compression());
app.use(express.json({ limit: '256kb' }));

// Static files cho web frontend
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// 4. HTTP + Socket.IO
// ============================================================
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins },
});

io.on('connection', (socket) => {
    socket.emit('hello', { ts: Date.now() });
});

// ============================================================
// 5. Routes
// ============================================================
// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        env: NODE_ENV,
        mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        time: new Date().toISOString(),
    });
});

// TomTom traffic tile proxy — KHÔNG lộ key ra client
app.use('/tiles/traffic', tomtomProxy);

// Auth
app.use('/api/auth', authRoutes);

// Disasters & Alerts API
app.use('/api/disasters', disasterRoutes);
app.use('/api/alerts', alertRoutes(io));
app.use('/api/cameras', cameraRoutes(io));
app.use('/api/devices', deviceRoutes);

// 404 handler cho /api/*
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Error handler cuối
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[server] Unhandled error:', err);
    if (err && err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// 6. Background tasks
// ============================================================
initCrawler(io);

// ============================================================
// 7. Start
// ============================================================
server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
    console.log(`   ENV=${NODE_ENV}`);
    if (!TOMTOM_KEY) {
        console.warn('⚠️  TOMTOM_KEY missing — traffic tile proxy và TomTom incidents sẽ không hoạt động.');
    }
});

// Graceful shutdown
function shutdown(sig) {
    console.log(`[server] ${sig} received, closing...`);
    server.close(() => {
        mongoose.connection.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
