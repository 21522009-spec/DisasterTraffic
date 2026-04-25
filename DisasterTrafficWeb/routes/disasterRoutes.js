import express from 'express';
import { getDisasters } from '../controllers/disasterController.js';

const router = express.Router();

router.get('/', getDisasters);

export default router;
