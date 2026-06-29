import express from 'express';

import {
    claimNextScanJob,
    createScanJob,
    createScanJobEvent,
    getScanJob,
    listScanJobEvents,
    listScanJobs,
    updateScanJobProgress,
} from '../controllers/scanJobController.js';
import { requireApiKey, requireJWT, requirePlan } from '../middleware/auth.js';
import {
    validateScanJobEventPayload,
    validateScanJobPayload,
} from '../middleware/validate.js';
import { aiAlertLimiter, readLimiter } from '../middleware/rateLimit.js';

export default function scanJobRoutes(io) {
    const router = express.Router();

    router.get('/', readLimiter, requireJWT, requirePlan('enterprise'), listScanJobs);
    router.get('/:id', readLimiter, requireJWT, requirePlan('enterprise'), getScanJob);
    router.get(
        '/:id/events',
        readLimiter,
        requireJWT,
        requirePlan('enterprise'),
        listScanJobEvents
    );

    router.post(
        '/',
        aiAlertLimiter,
        requireJWT,
        requirePlan('enterprise'),
        validateScanJobPayload,
        async (req, res) => {
            await createScanJob(req, res, (job) => {
                io.emit('scanjob:created', job);
            });
        }
    );

    router.post('/claim', aiAlertLimiter, requireApiKey, async (req, res) => {
        await claimNextScanJob(req, res, (job) => {
            io.emit('scanjob:updated', job);
        });
    });

    router.post('/:id/progress', aiAlertLimiter, requireApiKey, async (req, res) => {
        await updateScanJobProgress(req, res, (job) => {
            io.emit('scanjob:updated', job);
        });
    });

    router.post(
        '/:id/events',
        aiAlertLimiter,
        requireApiKey,
        validateScanJobEventPayload,
        async (req, res) => {
            await createScanJobEvent(req, res, io, (payload) => {
                io.emit('scanjob:event', payload);
                io.emit('scanjob:updated', { _id: req.params.id });
            });
        }
    );

    return router;
}
