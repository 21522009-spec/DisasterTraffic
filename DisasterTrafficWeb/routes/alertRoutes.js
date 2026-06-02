import express from 'express';
import Alert from '../models/Alert.js';
import User from '../models/User.js';
import { requireApiKey, requireJWT } from '../middleware/auth.js';
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
import { generateAreaSummary } from '../services/summaryService.js';

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

    /**
     * GET /api/alerts/summary
     * Tạo tóm tắt tình hình khẩn cấp khu vực bằng GenAI
     */
    router.get('/summary', readLimiter, async (req, res) => {
        try {
            const lat = parseFloat(req.query.lat);
            const lng = parseFloat(req.query.lng);
            const radius = parseInt(req.query.radius, 10) || 5000;

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({ error: 'Thiếu hoặc sai tham số tọa độ lat, lng' });
            }

            const summaryData = await generateAreaSummary(lat, lng, radius);
            res.json(summaryData);
        } catch (err) {
            console.error('[alerts/summary] GET error:', err);
            res.status(500).json({ error: 'Lỗi tạo tóm tắt' });
        }
    });

    /**
     * POST /api/alerts/:id/vote
     * Biểu quyết sự cố từ cộng đồng dựa trên khoảng cách (Proximity voting)
     */
    router.post('/:id/vote', requireJWT, async (req, res) => {
        try {
            const { voteType, lat, lng } = req.body || {};
            const alertId = req.params.id;
            const userId = req.user._id;

            if (!['up', 'down'].includes(voteType)) {
                return res.status(400).json({ error: 'voteType phải là up hoặc down' });
            }
            if (typeof lat !== 'number' || typeof lng !== 'number') {
                return res.status(400).json({ error: 'Tọa độ lat, lng của người bầu là bắt buộc' });
            }

            const alert = await Alert.findById(alertId);
            if (!alert) {
                return res.status(404).json({ error: 'Không tìm thấy cảnh báo này' });
            }

            // Calculate voter distance to the alert in meters
            const R = 6371000; // Earth radius in meters
            const phi1 = (lat * Math.PI) / 180;
            const phi2 = (alert.lat * Math.PI) / 180;
            const deltaPhi = ((alert.lat - lat) * Math.PI) / 180;
            const deltaLambda = ((alert.lng - lng) * Math.PI) / 180;

            const a =
                Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            // Reject if voter is too far (> 1.5km to accommodate GPS inaccuracies)
            if (distance > 1500) {
                return res.status(403).json({ 
                    error: `Bạn ở quá xa để xác thực sự cố này (${Math.round(distance)}m). Bạn phải ở trong bán kính 1.5km.` 
                });
            }

            // Check if user has already voted
            const userVoteIndex = alert.votes.findIndex(v => v.userId.toString() === userId.toString());
            
            if (userVoteIndex > -1) {
                // User already voted, update the vote
                alert.votes[userVoteIndex].voteType = voteType;
                alert.votes[userVoteIndex].voterLocation = { type: 'Point', coordinates: [lng, lat] };
                alert.votes[userVoteIndex].timestamp = new Date();
            } else {
                // Add new vote
                alert.votes.push({
                    userId,
                    voteType,
                    voterLocation: { type: 'Point', coordinates: [lng, lat] }
                });
            }

            // Recalculate verification and score
            const upvotes = alert.votes.filter(v => v.voteType === 'up').length;
            const downvotes = alert.votes.filter(v => v.voteType === 'down').length;
            const netVotes = upvotes - downvotes;

            if (netVotes >= 3) {
                alert.verified = true;
                alert.confidence = Math.min(1.0, 0.5 + 0.1 * netVotes);
            } else if (netVotes <= -3) {
                alert.verified = false;
                alert.confidence = Math.max(0.1, 0.5 + 0.1 * netVotes);
            }

            await alert.save();

            // Reward/Penalty reputation for alert creator
            if (alert.source === 'community' && alert.votes.length > 0) {
                // Find creator (assume community alert requires a user - wait, creator might not be linked, 
                // but let's check if we can track creator. Currently community alert schema doesn't have a creator field.
                // In future expansion we can reward/penalize user reputation if linked. Since there is no user ref,
                // we can just reward the voter instead to encourage civic participation!)
                await User.findByIdAndUpdate(userId, { $inc: { reputationScore: 2 } });
            }

            // Emit update to clients
            io.emit('new-alert', alert);

            res.json({
                message: 'Đã ghi nhận biểu quyết thành công',
                data: {
                    verified: alert.verified,
                    confidence: alert.confidence,
                    upvotes,
                    downvotes
                }
            });
        } catch (error) {
            console.error('[alerts/vote] POST error:', error);
            res.status(500).json({ error: 'Lỗi xử lý biểu quyết' });
        }
    });

    return router;
}
