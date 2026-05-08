import express from 'express';
import {
    registerDevice,
    unregisterDevice,
    countDevices,
} from '../controllers/deviceController.js';
import { communityReportLimiter, readLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Public — mobile app gọi sau khi xin permission notification
router.post('/register', communityReportLimiter, registerDevice);
router.post('/unregister', communityReportLimiter, unregisterDevice);

// Tiện cho admin
router.get('/count', readLimiter, countDevices);

export default router;
