import express from 'express';
import {
    listCameras,
    getCamera,
    createCamera,
    updateCamera,
    deleteCamera,
    cameraHeartbeat,
} from '../controllers/cameraController.js';
import { requireApiKey, requireJWT, requirePlan } from '../middleware/auth.js';
import { validateCameraPayload } from '../middleware/validate.js';
import { readLimiter, aiAlertLimiter } from '../middleware/rateLimit.js';

/**
 * Factory tạo router cho /api/cameras.
 * Cần truyền `io` để emit Socket.IO khi có thay đổi camera (realtime cho web/app).
 */
export default function cameraRoutes(io) {
    const router = express.Router();

    // Public reads
    router.get('/', readLimiter, listCameras);
    router.get('/:id', readLimiter, getCamera);

    // Admin writes — yêu cầu JWT Enterprise
    router.post(
        '/',
        aiAlertLimiter,
        requireJWT,
        requirePlan('enterprise'),
        validateCameraPayload,
        async (req, res) => {
            await createCamera(req, res, (camera) => {
                io.emit('camera:created', camera);
            });
        }
    );

    router.patch(
        '/:id',
        aiAlertLimiter,
        requireJWT,
        requirePlan('enterprise'),
        validateCameraPayload,
        async (req, res) => {
            await updateCamera(req, res, (camera) => {
                io.emit('camera:updated', camera);
            });
        }
    );

    router.delete('/:id', aiAlertLimiter, requireJWT, requirePlan('enterprise'), async (req, res) => {
        await deleteCamera(req, res, (id) => {
            io.emit('camera:deleted', { _id: id });
        });
    });

    // AI service heartbeat — dùng API key (internal)
    router.post('/:id/heartbeat', aiAlertLimiter, requireApiKey, cameraHeartbeat);

    return router;
}
