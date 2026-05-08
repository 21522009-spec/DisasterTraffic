import Alert from '../models/Alert.js';
import { parseBbox } from '../middleware/validate.js';

/**
 * GET /api/disasters?bbox=...&type=...&source=...&limit=50
 * Trả danh sách cảnh báo (mới nhất trước).
 *
 * Hỗ trợ filter:
 *   - bbox=minLon,minLat,maxLon,maxLat   (geo box)
 *   - type=fire|flood|traffic|...
 *   - source=ai|community|crawler|...
 *   - limit (1..500, default 50)
 */
export const getDisasters = async (req, res) => {
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

        const disasters = await Alert.find(filter)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .lean();

        res.json(disasters);
    } catch (error) {
        console.error('[disasterController] Lỗi lấy dữ liệu:', error);
        res.status(500).json({ error: 'Lỗi lấy dữ liệu từ Database' });
    }
};
