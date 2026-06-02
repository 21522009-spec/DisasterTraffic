import express from 'express';
import { assessRouteRisk } from '../services/routingService.js';

const router = express.Router();

// POST /api/routing/assess
router.post('/assess', async (req, res) => {
    try {
        const { polyline, thresholdMeters } = req.body || {};
        
        if (!polyline || !Array.isArray(polyline) || polyline.length < 2) {
            return res.status(400).json({ 
                error: 'Polyline is required and must be an array of at least 2 points: [[lng, lat], ...]' 
            });
        }

        // Validate coordinates format
        for (const pt of polyline) {
            if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
                return res.status(400).json({ 
                    error: 'Each coordinate in the polyline must be an array of two numbers: [lng, lat]' 
                });
            }
        }

        const result = await assessRouteRisk(polyline, thresholdMeters);
        res.json(result);
    } catch (err) {
        console.error('[routing] Assessment failed:', err);
        res.status(500).json({ error: err.message || 'Lỗi hệ thống' });
    }
});

export default router;
