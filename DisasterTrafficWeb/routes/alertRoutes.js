import express from 'express';
import Alert from '../models/Alert.js';
import { requireApiKey } from '../middleware/auth.js';
import {
    validateAlertPayload,
    validateCommunityReport,
    parseBbox,
} from '../middleware/validate.js';
import {
    aiAlertLimiter,
    communityReportLimiter,
    readLimiter,
} from '../middleware/rateLimit.js';
import { sendAlertPush } from '../services/pushService.js';
import { findDuplicate, mergeAlert } from '../services/alertDedup.js';

/**
 * Factory tạo router cho /api/alerts.
 * Cần truyền `io` để emit Socket.IO khi có alert mới.
 */
export default function alertRoutes(io) {
    const router = express.Router();

    /**
     * GET /api/alerts
     * Lịch sử cảnh báo (tối đa 500). Hỗ trợ filter bbox/type/source.
     */
    router.get('/', readLimiter, async (req, res) => {
        try {
            const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

            const filter = {};
            if (req.query.type) filter.type = String(req.query.type);
            if (req.query.source) filter.source = String(req.query.source);

            const bbox = parseBbox(req.query.bbox);
            if (bbox) {
                filter.location = {
                    $geoWithin: {
                        $box: [
                            [bbox.minLon, bbox.minLat],
                            [bbox.maxLon, bbox.maxLat],
                        ],
                    },
                };
            }

            const alerts = await Alert.find(filter)
                .sort({ createdAt: -1 })
                .skip(offset)
                .limit(limit)
                .lean();

            res.json(alerts);
        } catch (error) {
            console.error('[alerts] GET error:', error);
            res.status(500).json({ error: 'Lỗi lấy dữ liệu từ Database' });
        }
    });

    /**
     * POST /api/alerts
     * AI service / admin push alert mới. Yêu cầu header x-api-key.
     */
    router.post(
        '/',
        aiAlertLimiter,
        requireApiKey,
        validateAlertPayload,
        async (req, res) => {
            try {
                const {
                    type,
                    address,
                    lng,
                    lat,
                    source = 'ai',
                    severity,
                    description,
                    confidence,
                    sourceUrl,
                    expiresAt,
                } = req.body;

                // Có alert cùng vụ (same type, <= 5km, cùng ngày) thì merge thay vì tạo mới.
                const existing = await findDuplicate({ type, lng, lat, source });
                if (existing) {
                    const merged = await mergeAlert(existing, req.body);
                    io.emit('new-alert', merged); // client tự dedup theo _id
                    return res.status(200).json({
                        message: 'Đã merge vào cảnh báo có sẵn',
                        data: merged,
                        deduped: true,
                    });
                }

                const newAlert = new Alert({
                    type,
                    address,
                    lng,
                    lat,
                    source,
                    severity,
                    description,
                    confidence,
                    sourceUrl,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                });
                await newAlert.save();

                io.emit('new-alert', newAlert);

                // Fire-and-forget push notification — không chờ để khỏi delay response
                sendAlertPush(newAlert.toObject()).catch((e) =>
                    console.error('[alert] push error:', e)
                );

                res.status(201).json({
                    message: 'Đã lưu cảnh báo thành công',
                    data: newAlert,
                });
            } catch (error) {
                console.error('[alerts] POST error:', error);
                if (error.name === 'ValidationError') {
                    return res.status(400).json({
                        error: 'Bad Request: Validation Error',
                        details: error.message,
                    });
                }
                res.status(500).json({ error: 'Lỗi lưu dữ liệu' });
            }
        }
    );

    /**
     * POST /api/alerts/community
     * Người dùng cộng đồng báo cáo. Không cần API key, có rate limit nghiêm ngặt.
     * Source bị cố định = 'community', verified = false để admin/AI duyệt sau.
     */
    router.post(
        '/community',
        communityReportLimiter,
        validateCommunityReport,
        async (req, res) => {
            try {
                const { type, lng, lat, address, description, severity } = req.body;

                const finalAddress =
                    (address && String(address).trim()) ||
                    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

                const newAlert = new Alert({
                    type,
                    address: finalAddress,
                    lng,
                    lat,
                    source: 'community',
                    description: description || '',
                    severity: severity ?? 3,
                    confidence: 0.5, // mặc định community thấp
                    verified: false,
                });
                await newAlert.save();

                io.emit('new-alert', newAlert);

                // Fire-and-forget push notification — không chờ để khỏi delay response
                sendAlertPush(newAlert.toObject()).catch((e) =>
                    console.error('[alert] push error:', e)
                );

                res.status(201).json({
                    message: 'Đã ghi nhận báo cáo của bạn',
                    data: newAlert,
                });
            } catch (error) {
                console.error('[alerts/community] POST error:', error);
                if (error.name === 'ValidationError') {
                    return res.status(400).json({
                        error: 'Bad Request: Validation Error',
                        details: error.message,
                    });
                }
                res.status(500).json({ error: 'Lỗi lưu báo cáo' });
            }
        }
    );

    return router;
}
