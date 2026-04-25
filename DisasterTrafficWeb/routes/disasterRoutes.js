import express from 'express';
import { getDisasterEvents } from '../controllers/disasterController.js';

const router = express.Router();

// GET /api/disaster-events
// Lấy danh sách các sự cố thiên tai
router.get('/', getDisasterEvents);

export default router;
