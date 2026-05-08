import Camera from '../models/Camera.js';
import { parseBbox } from '../middleware/validate.js';

/**
 * GET /api/cameras
 * Public — web/app/AI service đều có thể gọi.
 * Filter: status, kind, bbox.
 */
export const listCameras = async (req, res) => {
    try {
        const limit = Math.min(
            1000,
            Math.max(1, parseInt(req.query.limit, 10) || 200)
        );

        const filter = {};
        if (req.query.status) filter.status = String(req.query.status);
        if (req.query.kind) filter.kind = String(req.query.kind);

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

        const cameras = await Camera.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        res.json(cameras);
    } catch (error) {
        console.error('[cameraController] list error:', error);
        res.status(500).json({ error: 'Lỗi lấy danh sách camera' });
    }
};

/** GET /api/cameras/:id */
export const getCamera = async (req, res) => {
    try {
        const cam = await Camera.findById(req.params.id).lean();
        if (!cam) return res.status(404).json({ error: 'Camera not found' });
        res.json(cam);
    } catch (error) {
        console.error('[cameraController] get error:', error);
        res.status(500).json({ error: 'Lỗi lấy camera' });
    }
};

/**
 * POST /api/cameras — admin only.
 * `onSuccess` callback dùng để emit Socket.IO ở route layer.
 */
export const createCamera = async (req, res, onSuccess) => {
    try {
        const cam = new Camera(req.body);
        await cam.save();
        if (typeof onSuccess === 'function') onSuccess(cam.toObject());
        res.status(201).json({ message: 'Đã tạo camera', data: cam });
    } catch (error) {
        console.error('[cameraController] create error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.message,
            });
        }
        res.status(500).json({ error: 'Lỗi tạo camera' });
    }
};

/** PATCH /api/cameras/:id — admin only */
export const updateCamera = async (req, res, onSuccess) => {
    try {
        const cam = await Camera.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { returnDocument: 'after', runValidators: true }
        );
        if (!cam) return res.status(404).json({ error: 'Camera not found' });
        if (typeof onSuccess === 'function') onSuccess(cam.toObject());
        res.json({ message: 'Đã cập nhật', data: cam });
    } catch (error) {
        console.error('[cameraController] update error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.message,
            });
        }
        res.status(500).json({ error: 'Lỗi cập nhật camera' });
    }
};

/** DELETE /api/cameras/:id — admin only */
export const deleteCamera = async (req, res, onSuccess) => {
    try {
        const cam = await Camera.findByIdAndDelete(req.params.id);
        if (!cam) return res.status(404).json({ error: 'Camera not found' });
        if (typeof onSuccess === 'function') onSuccess(String(cam._id));
        res.json({ message: 'Đã xoá camera' });
    } catch (error) {
        console.error('[cameraController] delete error:', error);
        res.status(500).json({ error: 'Lỗi xoá camera' });
    }
};

/**
 * POST /api/cameras/:id/heartbeat — AI service gọi sau khi sinh alert
 * để cập nhật lastAlertAt (cooldown logic).
 */
export const cameraHeartbeat = async (req, res) => {
    try {
        const cam = await Camera.findByIdAndUpdate(
            req.params.id,
            { $set: { lastAlertAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!cam) return res.status(404).json({ error: 'Camera not found' });
        res.json({ ok: true, lastAlertAt: cam.lastAlertAt });
    } catch (error) {
        console.error('[cameraController] heartbeat error:', error);
        res.status(500).json({ error: 'Lỗi heartbeat' });
    }
};
