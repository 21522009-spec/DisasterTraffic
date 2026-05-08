import Device from '../models/Device.js';

const TOKEN_PATTERN = /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/;

/**
 * POST /api/devices/register
 * Body: { token, platform?, subscribedTypes?, subscribedBbox? }
 *
 * Idempotent — gọi nhiều lần với cùng token chỉ update các field khác,
 * không tạo bản ghi mới.
 */
export const registerDevice = async (req, res) => {
    try {
        const { token, platform, subscribedTypes, subscribedBbox } = req.body || {};

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Bad Request: token required (string)' });
        }
        if (!TOKEN_PATTERN.test(token)) {
            return res.status(400).json({
                error: 'Bad Request: token format không hợp lệ (phải là ExponentPushToken[...])',
            });
        }

        const update = { token, active: true };
        if (platform) update.platform = String(platform);
        if (Array.isArray(subscribedTypes)) update.subscribedTypes = subscribedTypes;
        if (subscribedBbox && typeof subscribedBbox === 'object') {
            const { minLon, minLat, maxLon, maxLat } = subscribedBbox;
            const valid =
                typeof minLon === 'number' && typeof minLat === 'number' &&
                typeof maxLon === 'number' && typeof maxLat === 'number' &&
                minLon < maxLon && minLat < maxLat &&
                minLon >= -180 && maxLon <= 180 && minLat >= -90 && maxLat <= 90;
            if (!valid) {
                return res.status(400).json({ error: 'Bad Request: subscribedBbox không hợp lệ' });
            }
            update.subscribedBbox = subscribedBbox;
        }

        const device = await Device.findOneAndUpdate(
            { token },
            { $set: update },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );

        res.status(201).json({ message: 'Đã đăng ký thiết bị', data: device });
    } catch (error) {
        console.error('[deviceController] register error:', error);
        res.status(500).json({ error: 'Lỗi đăng ký thiết bị' });
    }
};

/** POST /api/devices/unregister  Body: { token } */
export const unregisterDevice = async (req, res) => {
    try {
        const { token } = req.body || {};
        if (!token) {
            return res.status(400).json({ error: 'Bad Request: token required' });
        }
        await Device.findOneAndUpdate({ token }, { $set: { active: false } });
        res.json({ message: 'Đã huỷ đăng ký' });
    } catch (error) {
        console.error('[deviceController] unregister error:', error);
        res.status(500).json({ error: 'Lỗi huỷ đăng ký' });
    }
};

/** GET /api/devices/count — tiện cho admin xem có bao nhiêu device đang active */
export const countDevices = async (req, res) => {
    try {
        const total = await Device.countDocuments({});
        const active = await Device.countDocuments({ active: true });
        res.json({ total, active });
    } catch (error) {
        console.error('[deviceController] count error:', error);
        res.status(500).json({ error: 'Lỗi đếm thiết bị' });
    }
};
