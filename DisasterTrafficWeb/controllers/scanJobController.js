import mongoose from 'mongoose';

import Alert from '../models/Alert.js';
import Camera from '../models/Camera.js';
import CameraEvent, { CAMERA_EVENT_STATUSES } from '../models/CameraEvent.js';
import ScanJob, { SCAN_JOB_STATUSES } from '../models/ScanJob.js';
import { findDuplicate, mergeAlert } from '../services/alertDedup.js';
import { sendAlertPush } from '../services/pushService.js';

function parseLimit(raw, fallback = 50, max = 200) {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(1, parsed));
}

function clampNumber(value, fallback, min = 0, max = Number.POSITIVE_INFINITY) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function decorateScanJob(job) {
    const data = job && typeof job.toObject === 'function' ? job.toObject() : job;
    if (data && data.cameraId && typeof data.cameraId === 'object' && !Array.isArray(data.cameraId)) {
        data.camera = data.cameraId;
    }
    if (
        data &&
        data.requestedBy &&
        typeof data.requestedBy === 'object' &&
        !Array.isArray(data.requestedBy)
    ) {
        data.requestedByUser = data.requestedBy;
    }
    return data;
}

function normalizeWarnings(warnings) {
    if (!Array.isArray(warnings)) return [];
    return warnings
        .map((warning) => String(warning || '').trim())
        .filter(Boolean)
        .slice(0, 20);
}

function inferEventStatus(payload) {
    if (payload.status && CAMERA_EVENT_STATUSES.includes(payload.status)) {
        return payload.status;
    }
    if (payload.createAlert && payload.verified) return 'alerted';
    if (payload.verified) return 'verified';
    return 'candidate';
}

function buildAlertPayload({ camera, job, event, sourceUrl, verifiedBy }) {
    return {
        type: event.type,
        address: event.address || camera.address || camera.name || 'Unknown camera',
        lng: camera.lng,
        lat: camera.lat,
        source: 'ai',
        severity: event.severity ?? 3,
        description:
            event.description ||
            event.title ||
            `Phát hiện ${event.type} từ camera ${camera.name || camera._id}`,
        confidence: event.confidence ?? 0.7,
        verified: !!event.verified,
        verifiedBy: verifiedBy || event.verifiedBy || '',
        sourceUrl: sourceUrl || event.sourceUrl || job.sourceUrl || '',
        cameraId: camera._id,
        scanJobId: job._id,
        cameraEventId: event._id,
        snapshotUrl: event.snapshotUrl || '',
        clipBeforeUrl: event.clipBeforeUrl || '',
        clipDuringUrl: event.clipDuringUrl || '',
        clipAfterUrl: event.clipAfterUrl || '',
        eventStartSec: event.eventStartSec,
        eventEndSec: event.eventEndSec,
    };
}

async function createOrMergeAlert(io, payload) {
    const existing = await findDuplicate(payload);
    if (existing) {
        const merged = await mergeAlert(existing, payload);

        merged.verified = payload.verified ?? merged.verified;
        if (payload.verifiedBy) merged.verifiedBy = payload.verifiedBy;
        if (payload.cameraId) merged.cameraId = payload.cameraId;
        if (payload.scanJobId) merged.scanJobId = payload.scanJobId;
        if (payload.cameraEventId) merged.cameraEventId = payload.cameraEventId;
        if (payload.snapshotUrl) merged.snapshotUrl = payload.snapshotUrl;
        if (payload.clipBeforeUrl) merged.clipBeforeUrl = payload.clipBeforeUrl;
        if (payload.clipDuringUrl) merged.clipDuringUrl = payload.clipDuringUrl;
        if (payload.clipAfterUrl) merged.clipAfterUrl = payload.clipAfterUrl;
        if (payload.eventStartSec != null) merged.eventStartSec = payload.eventStartSec;
        if (payload.eventEndSec != null) merged.eventEndSec = payload.eventEndSec;
        if (payload.sourceUrl && !merged.sourceUrl) merged.sourceUrl = payload.sourceUrl;
        await merged.save();

        io.emit('new-alert', merged);
        return { alert: merged, deduped: true };
    }

    const created = new Alert(payload);
    await created.save();
    io.emit('new-alert', created);
    sendAlertPush(created.toObject()).catch((error) =>
        console.error('[scanJobController] push error:', error)
    );
    return { alert: created, deduped: false };
}

/**
 * GET /api/scan-jobs
 * Admin reads queue/history for submitted VOD scans.
 */
export const listScanJobs = async (req, res) => {
    try {
        const limit = parseLimit(req.query.limit, 50, 200);
        const filter = {};

        if (req.query.status) filter.status = String(req.query.status);
        if (req.query.sourceType) filter.sourceType = String(req.query.sourceType);
        if (req.query.cameraId) {
            if (!mongoose.isValidObjectId(req.query.cameraId)) {
                return res.status(400).json({ error: 'cameraId không hợp lệ' });
            }
            filter.cameraId = req.query.cameraId;
        }

        const jobs = await ScanJob.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('cameraId', 'name kind streamUrl lat lng address status')
            .populate('requestedBy', 'name email plan')
            .lean();

        res.json(jobs.map(decorateScanJob));
    } catch (error) {
        console.error('[scanJobController] list error:', error);
        res.status(500).json({ error: 'Lỗi lấy danh sách scan job' });
    }
};

/**
 * GET /api/scan-jobs/:id
 * Admin inspect one submitted job.
 */
export const getScanJob = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Scan job id không hợp lệ' });
        }

        const job = await ScanJob.findById(req.params.id)
            .populate('cameraId', 'name kind streamUrl lat lng address status')
            .populate('requestedBy', 'name email plan')
            .lean();

        if (!job) return res.status(404).json({ error: 'Scan job not found' });
        res.json(decorateScanJob(job));
    } catch (error) {
        console.error('[scanJobController] get error:', error);
        res.status(500).json({ error: 'Lỗi lấy scan job' });
    }
};

/**
 * GET /api/scan-jobs/:id/events
 * Admin review extracted events/artifacts from one job.
 */
export const listScanJobEvents = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Scan job id không hợp lệ' });
        }

        const limit = parseLimit(req.query.limit, 100, 300);
        const events = await CameraEvent.find({ scanJobId: req.params.id })
            .sort({ eventStartSec: 1, createdAt: 1 })
            .limit(limit)
            .populate('alertId', 'type createdAt confidence verified source')
            .lean();

        res.json(events);
    } catch (error) {
        console.error('[scanJobController] list events error:', error);
        res.status(500).json({ error: 'Lỗi lấy event của scan job' });
    }
};

/**
 * POST /api/scan-jobs
 * Admin queue a VOD scan against a camera.
 */
export const createScanJob = async (req, res, onSuccess) => {
    try {
        const {
            cameraId,
            sourceType,
            sourceUrl,
            sourceLabel,
            allowedEventTypes,
            publishAlerts,
            notes,
            config = {},
        } = req.body;

        const camera = await Camera.findById(cameraId).lean();
        if (!camera) {
            return res.status(404).json({ error: 'Camera not found' });
        }

        const job = new ScanJob({
            cameraId,
            requestedBy: req.user?._id || null,
            sourceType,
            sourceUrl,
            sourceLabel: sourceLabel || '',
            allowedEventTypes:
                Array.isArray(allowedEventTypes) && allowedEventTypes.length
                    ? allowedEventTypes
                    : camera.allowedEventTypes || [],
            publishAlerts: publishAlerts ?? true,
            notes: notes || '',
            config: {
                scanEverySec: clampNumber(config.scanEverySec, 2, 0.1, 300),
                mergeGapSec: clampNumber(config.mergeGapSec, 8, 0, 300),
                clipBeforeSec: clampNumber(config.clipBeforeSec, 12, 0, 300),
                clipAfterSec: clampNumber(config.clipAfterSec, 12, 0, 300),
                artifactFps: clampNumber(config.artifactFps, 6, 1, 30),
                verifyWithLlm: config.verifyWithLlm ?? true,
            },
        });

        await job.save();
        const populated = await ScanJob.findById(job._id)
            .populate('cameraId', 'name kind streamUrl lat lng address status')
            .populate('requestedBy', 'name email plan');

        const payload = decorateScanJob(populated);
        if (typeof onSuccess === 'function') onSuccess(payload);
        res.status(201).json({ message: 'Đã tạo scan job', data: payload });
    } catch (error) {
        console.error('[scanJobController] create error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.message,
            });
        }
        res.status(500).json({ error: 'Lỗi tạo scan job' });
    }
};

/**
 * POST /api/scan-jobs/claim
 * AI service atomically claims the oldest queued scan job.
 */
export const claimNextScanJob = async (req, res, onSuccess) => {
    try {
        const workerId = String(req.body?.workerId || 'ai-vod-worker').slice(0, 100);

        for (let attempts = 0; attempts < 3; attempts += 1) {
            const job = await ScanJob.findOneAndUpdate(
                { status: 'queued' },
                {
                    $set: {
                        status: 'running',
                        workerId,
                        startedAt: new Date(),
                        completedAt: null,
                        'error.message': '',
                        'error.details': '',
                    },
                },
                {
                    sort: { createdAt: 1 },
                    returnDocument: 'after',
                    runValidators: true,
                }
            )
                .populate('cameraId')
                .populate('requestedBy', 'name email plan');

            if (!job) {
                return res.json({ data: null });
            }

            if (job.cameraId) {
                const payload = decorateScanJob(job);
                if (typeof onSuccess === 'function') onSuccess(payload);
                return res.json({ data: payload });
            }

            await ScanJob.findByIdAndUpdate(job._id, {
                $set: {
                    status: 'failed',
                    completedAt: new Date(),
                    'error.message': 'Camera not found',
                    'error.details': 'Referenced camera no longer exists.',
                },
            });
        }

        return res.json({ data: null });
    } catch (error) {
        console.error('[scanJobController] claim error:', error);
        res.status(500).json({ error: 'Lỗi claim scan job' });
    }
};

/**
 * POST /api/scan-jobs/:id/progress
 * AI worker reports progress / terminal status back to backend.
 */
export const updateScanJobProgress = async (req, res, onSuccess) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Scan job id không hợp lệ' });
        }

        const { status, progress = {}, timeline = {}, result = {}, error = {} } = req.body || {};
        const $set = {};

        if (status != null) {
            if (!SCAN_JOB_STATUSES.includes(status)) {
                return res.status(400).json({ error: `invalid status "${status}"` });
            }
            $set.status = status;
            if (status === 'running') {
                $set.completedAt = null;
            }
            if (['succeeded', 'failed', 'cancelled'].includes(status)) {
                $set.completedAt = new Date();
            }
        }

        if (progress.pct != null) $set['progress.pct'] = clampNumber(progress.pct, 0, 0, 100);
        if (progress.framesRead != null) $set['progress.framesRead'] = clampNumber(progress.framesRead, 0, 0);
        if (progress.framesSampled != null) $set['progress.framesSampled'] = clampNumber(progress.framesSampled, 0, 0);
        if (progress.candidatesDetected != null) $set['progress.candidatesDetected'] = clampNumber(progress.candidatesDetected, 0, 0);
        if (progress.eventsCreated != null) $set['progress.eventsCreated'] = clampNumber(progress.eventsCreated, 0, 0);

        if (timeline.durationSec != null) $set['timeline.durationSec'] = clampNumber(timeline.durationSec, 0, 0);
        if (timeline.processedSec != null) $set['timeline.processedSec'] = clampNumber(timeline.processedSec, 0, 0);
        if (timeline.lastFrameSec != null) $set['timeline.lastFrameSec'] = clampNumber(timeline.lastFrameSec, 0, 0);

        if (result.summary != null) $set['result.summary'] = String(result.summary).slice(0, 1000);
        if (result.eventsCount != null) $set['result.eventsCount'] = clampNumber(result.eventsCount, 0, 0);
        if (result.alertsCount != null) $set['result.alertsCount'] = clampNumber(result.alertsCount, 0, 0);
        if (result.warnings != null) $set['result.warnings'] = normalizeWarnings(result.warnings);

        if (error.message != null) $set['error.message'] = String(error.message).slice(0, 500);
        if (error.details != null) $set['error.details'] = String(error.details).slice(0, 2000);

        const job = await ScanJob.findByIdAndUpdate(
            req.params.id,
            { $set },
            { returnDocument: 'after', runValidators: true }
        )
            .populate('cameraId', 'name kind streamUrl lat lng address status')
            .populate('requestedBy', 'name email plan');

        if (!job) return res.status(404).json({ error: 'Scan job not found' });

        const payload = decorateScanJob(job);
        if (typeof onSuccess === 'function') onSuccess(payload);
        res.json({ ok: true, data: payload });
    } catch (error) {
        console.error('[scanJobController] progress error:', error);
        res.status(500).json({ error: 'Lỗi cập nhật tiến độ scan job' });
    }
};

/**
 * POST /api/scan-jobs/:id/events
 * AI worker creates one extracted event and can optionally publish an alert.
 */
export const createScanJobEvent = async (req, res, io, onSuccess) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Scan job id không hợp lệ' });
        }

        const job = await ScanJob.findById(req.params.id).populate('cameraId');
        if (!job) return res.status(404).json({ error: 'Scan job not found' });
        if (!job.cameraId) {
            return res.status(400).json({ error: 'Scan job không còn camera hợp lệ' });
        }

        const camera = job.cameraId;
        const event = new CameraEvent({
            cameraId: camera._id,
            scanJobId: job._id,
            type: req.body.type,
            status: inferEventStatus(req.body),
            title: req.body.title || '',
            description: req.body.description || '',
            address: req.body.address || camera.address || camera.name || '',
            lng: camera.lng,
            lat: camera.lat,
            sourceType: req.body.sourceType || job.sourceType,
            sourceUrl: req.body.sourceUrl || job.sourceUrl || '',
            snapshotUrl: req.body.snapshotUrl || '',
            clipBeforeUrl: req.body.clipBeforeUrl || '',
            clipDuringUrl: req.body.clipDuringUrl || '',
            clipAfterUrl: req.body.clipAfterUrl || '',
            eventStartSec: req.body.eventStartSec,
            eventEndSec: req.body.eventEndSec,
            snapshotSec: req.body.snapshotSec ?? null,
            severity: req.body.severity ?? 3,
            confidence: req.body.confidence ?? 0.7,
            verified: req.body.verified ?? false,
            verifiedBy: req.body.verifiedBy || '',
            metadata: {
                detector: req.body.metadata?.detector || '',
                verifier: req.body.metadata?.verifier || '',
                framesSampled: clampNumber(req.body.metadata?.framesSampled, 0, 0),
                rawConfidence: clampNumber(req.body.metadata?.rawConfidence, 0, 0, 1),
                durationSec: clampNumber(
                    req.body.metadata?.durationSec,
                    Math.max(0, req.body.eventEndSec - req.body.eventStartSec),
                    0
                ),
                labels: Array.isArray(req.body.metadata?.labels)
                    ? req.body.metadata.labels.map((label) => String(label)).slice(0, 20)
                    : [],
            },
        });

        await event.save();

        let alert = null;
        const shouldCreateAlert =
            req.body.createAlert === true ||
            (req.body.createAlert == null && job.publishAlerts === true && (req.body.verified ?? false));

        if (shouldCreateAlert) {
            const { alert: savedAlert } = await createOrMergeAlert(
                io,
                buildAlertPayload({
                    camera,
                    job,
                    event,
                    sourceUrl: req.body.sourceUrl,
                    verifiedBy: req.body.verifiedBy,
                })
            );
            alert = savedAlert;
            event.alertId = savedAlert._id;
            event.status = 'alerted';
            await event.save();
        }

        await ScanJob.findByIdAndUpdate(job._id, {
            $inc: {
                'progress.eventsCreated': 1,
                'result.eventsCount': 1,
                ...(alert ? { 'result.alertsCount': 1 } : {}),
            },
        });

        const payload = {
            ...(event.toObject ? event.toObject() : event),
            alert: alert ? (alert.toObject ? alert.toObject() : alert) : null,
        };

        if (typeof onSuccess === 'function') onSuccess(payload);
        res.status(201).json({
            message: 'Đã lưu camera event',
            data: payload,
        });
    } catch (error) {
        console.error('[scanJobController] create event error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.message,
            });
        }
        res.status(500).json({ error: 'Lỗi lưu camera event' });
    }
};
