import express from 'express';
import axios from 'axios';

/**
 * Proxy TomTom Traffic tiles để KHÔNG lộ API key ra phía client.
 *
 * Frontend gọi:    /tiles/traffic/flow/{style}/{z}/{x}/{y}.png
 * Backend gọi:     https://api.tomtom.com/traffic/map/4/tile/flow/{style}/{z}/{x}/{y}.png?key=...
 *
 * Endpoint cũng cache nhẹ ở header (max-age 60s) để giảm tải TomTom.
 */
const router = express.Router();

const VALID_STYLES = new Set(['absolute', 'relative', 'relative-delay', 'reduced-sensitivity']);

router.get('/flow/:style/:z/:x/:y.png', async (req, res) => {
    const TOMTOM_KEY = (process.env.TOMTOM_KEY || '').trim();
    if (!TOMTOM_KEY) {
        // Trả 1x1 transparent png để map không hiện lỗi vỡ tile
        return res.status(204).end();
    }

    const { style, z, x, y } = req.params;
    if (!VALID_STYLES.has(style)) {
        return res.status(400).json({ error: 'Invalid style' });
    }
    const zNum = parseInt(z, 10);
    const xNum = parseInt(x, 10);
    const yNum = parseInt(y, 10);
    if (
        !Number.isFinite(zNum) ||
        !Number.isFinite(xNum) ||
        !Number.isFinite(yNum) ||
        zNum < 0 ||
        zNum > 22
    ) {
        return res.status(400).json({ error: 'Invalid tile coords' });
    }

    const url = `https://api.tomtom.com/traffic/map/4/tile/flow/${style}/${zNum}/${xNum}/${yNum}.png?key=${TOMTOM_KEY}`;

    try {
        const tomtomRes = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            validateStatus: (s) => s < 500,
        });

        if (tomtomRes.status !== 200) {
            return res.status(tomtomRes.status).end();
        }

        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=60'); // 1 phút
        return res.send(Buffer.from(tomtomRes.data));
    } catch (err) {
        console.error('[tomtomProxy] error:', err.message);
        return res.status(502).json({ error: 'Bad gateway (TomTom)' });
    }
});

export default router;
