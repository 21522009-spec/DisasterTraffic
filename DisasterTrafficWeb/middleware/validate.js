import { ALERT_TYPES, ALERT_SOURCES } from '../models/Alert.js';
import { CAMERA_KINDS, CAMERA_STATUSES } from '../models/Camera.js';
import { SCAN_SOURCE_TYPES } from '../models/ScanJob.js';

function isFiniteNumber(x) {
    return typeof x === 'number' && Number.isFinite(x);
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate payload cho POST /api/alerts (AI / manual).
 * Cho phép các field mở rộng: source, severity, description, confidence, sourceUrl.
 * Reject extraneous fields (fail-fast).
 */
export function validateAlertPayload(req, res, next) {
    const payload = req.body || {};

    const allowed = new Set([
        'type',
        'address',
        'lng',
        'lat',
        'source',
        'severity',
        'description',
        'confidence',
        'sourceUrl',
        'expiresAt',
        'cameraId',
        'scanJobId',
        'cameraEventId',
        'verifiedBy',
        'snapshotUrl',
        'clipBeforeUrl',
        'clipDuringUrl',
        'clipAfterUrl',
        'eventStartSec',
        'eventEndSec',
    ]);

    for (const key of Object.keys(payload)) {
        if (!allowed.has(key)) {
            return res
                .status(400)
                .json({ error: `Bad Request: extraneous field "${key}" not allowed` });
        }
    }

    const { type, address, lng, lat, source, severity, confidence } = payload;

    if (!type || !ALERT_TYPES.includes(type)) {
        return res.status(400).json({ error: `Bad Request: invalid type "${type}"` });
    }
    if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'Bad Request: address is required (string)' });
    }
    if (!isFiniteNumber(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Bad Request: invalid longitude' });
    }
    if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Bad Request: invalid latitude' });
    }
    if (source != null && !ALERT_SOURCES.includes(source)) {
        return res.status(400).json({ error: `Bad Request: invalid source "${source}"` });
    }
    if (severity != null && (!isFiniteNumber(severity) || severity < 1 || severity > 5)) {
        return res.status(400).json({ error: 'Bad Request: severity must be 1..5' });
    }
    if (
        confidence != null &&
        (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1)
    ) {
        return res.status(400).json({ error: 'Bad Request: confidence must be 0..1' });
    }
    if (payload.eventStartSec != null && (!isFiniteNumber(payload.eventStartSec) || payload.eventStartSec < 0)) {
        return res.status(400).json({ error: 'Bad Request: eventStartSec must be >= 0' });
    }
    if (payload.eventEndSec != null && (!isFiniteNumber(payload.eventEndSec) || payload.eventEndSec < 0)) {
        return res.status(400).json({ error: 'Bad Request: eventEndSec must be >= 0' });
    }

    return next();
}

/**
 * Validate payload cho POST /api/alerts/community (cộng đồng).
 * Source bị cố định là 'community'. Nếu chưa có address, sẽ tự fill bằng toạ độ.
 */
export function validateCommunityReport(req, res, next) {
    const payload = req.body || {};

    const allowed = new Set([
        'type',
        'lng',
        'lat',
        'address',
        'description',
        'severity',
    ]);

    for (const key of Object.keys(payload)) {
        if (!allowed.has(key)) {
            return res
                .status(400)
                .json({ error: `Bad Request: extraneous field "${key}" not allowed` });
        }
    }

    const { type, lng, lat, severity } = payload;

    if (!type || !ALERT_TYPES.includes(type)) {
        return res.status(400).json({ error: `Bad Request: invalid type "${type}"` });
    }
    if (!isFiniteNumber(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Bad Request: invalid longitude' });
    }
    if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Bad Request: invalid latitude' });
    }
    if (severity != null && (!isFiniteNumber(severity) || severity < 1 || severity > 5)) {
        return res.status(400).json({ error: 'Bad Request: severity must be 1..5' });
    }

    return next();
}

/**
 * Validate payload cho POST /api/cameras (admin / API key).
 */
export function validateCameraPayload(req, res, next) {
    const payload = req.body || {};

    const allowed = new Set([
        'name',
        'kind',
        'streamUrl',
        'lng',
        'lat',
        'address',
        'allowedEventTypes',
        'status',
        'cooldownMs',
        'notes',
    ]);

    for (const key of Object.keys(payload)) {
        if (!allowed.has(key)) {
            return res
                .status(400)
                .json({ error: `Bad Request: extraneous field "${key}" not allowed` });
        }
    }

    const { name, streamUrl, lng, lat, kind, status, allowedEventTypes, cooldownMs } = payload;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required (string)' });
    }
    if (!streamUrl || typeof streamUrl !== 'string') {
        return res.status(400).json({ error: 'streamUrl is required (string)' });
    }
    if (!isFiniteNumber(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'invalid longitude' });
    }
    if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'invalid latitude' });
    }
    if (kind != null && !CAMERA_KINDS.includes(kind)) {
        return res.status(400).json({ error: `invalid kind "${kind}"` });
    }
    if (status != null && !CAMERA_STATUSES.includes(status)) {
        return res.status(400).json({ error: `invalid status "${status}"` });
    }
    if (allowedEventTypes != null) {
        if (!Array.isArray(allowedEventTypes)) {
            return res.status(400).json({ error: 'allowedEventTypes must be array' });
        }
        for (const t of allowedEventTypes) {
            if (!ALERT_TYPES.includes(t)) {
                return res.status(400).json({ error: `invalid alert type "${t}"` });
            }
        }
    }
    if (cooldownMs != null && (!isFiniteNumber(cooldownMs) || cooldownMs < 0)) {
        return res.status(400).json({ error: 'cooldownMs must be >= 0' });
    }

    return next();
}

/**
 * Validate payload cho POST /api/scan-jobs (admin submit VOD scan).
 */
export function validateScanJobPayload(req, res, next) {
    const payload = req.body || {};

    const allowed = new Set([
        'cameraId',
        'sourceType',
        'sourceUrl',
        'sourceLabel',
        'allowedEventTypes',
        'publishAlerts',
        'notes',
        'config',
    ]);

    for (const key of Object.keys(payload)) {
        if (!allowed.has(key)) {
            return res
                .status(400)
                .json({ error: `Bad Request: extraneous field "${key}" not allowed` });
        }
    }

    const { cameraId, sourceType, sourceUrl, sourceLabel, allowedEventTypes, publishAlerts, notes, config } = payload;

    if (!cameraId || typeof cameraId !== 'string') {
        return res.status(400).json({ error: 'cameraId is required (string)' });
    }
    if (!sourceType || !SCAN_SOURCE_TYPES.includes(sourceType)) {
        return res.status(400).json({ error: `invalid sourceType "${sourceType}"` });
    }
    if (!sourceUrl || typeof sourceUrl !== 'string') {
        return res.status(400).json({ error: 'sourceUrl is required (string)' });
    }
    if (sourceLabel != null && typeof sourceLabel !== 'string') {
        return res.status(400).json({ error: 'sourceLabel must be string' });
    }
    if (allowedEventTypes != null) {
        if (!Array.isArray(allowedEventTypes)) {
            return res.status(400).json({ error: 'allowedEventTypes must be array' });
        }
        for (const t of allowedEventTypes) {
            if (!ALERT_TYPES.includes(t)) {
                return res.status(400).json({ error: `invalid alert type "${t}"` });
            }
        }
    }
    if (publishAlerts != null && typeof publishAlerts !== 'boolean') {
        return res.status(400).json({ error: 'publishAlerts must be boolean' });
    }
    if (notes != null && typeof notes !== 'string') {
        return res.status(400).json({ error: 'notes must be string' });
    }
    if (config != null) {
        if (!isPlainObject(config)) {
            return res.status(400).json({ error: 'config must be an object' });
        }
        const allowedConfigKeys = new Set([
            'scanEverySec',
            'mergeGapSec',
            'clipBeforeSec',
            'clipAfterSec',
            'artifactFps',
            'verifyWithLlm',
        ]);
        for (const key of Object.keys(config)) {
            if (!allowedConfigKeys.has(key)) {
                return res.status(400).json({ error: `invalid config field "${key}"` });
            }
        }
        for (const numericKey of ['scanEverySec', 'mergeGapSec', 'clipBeforeSec', 'clipAfterSec', 'artifactFps']) {
            if (config[numericKey] != null && !isFiniteNumber(config[numericKey])) {
                return res.status(400).json({ error: `${numericKey} must be number` });
            }
        }
        if (config.verifyWithLlm != null && typeof config.verifyWithLlm !== 'boolean') {
            return res.status(400).json({ error: 'verifyWithLlm must be boolean' });
        }
    }

    return next();
}

/**
 * Validate payload cho POST /api/scan-jobs/:id/events (AI worker publish event).
 */
export function validateScanJobEventPayload(req, res, next) {
    const payload = req.body || {};

    const allowed = new Set([
        'type',
        'status',
        'title',
        'description',
        'address',
        'severity',
        'confidence',
        'verified',
        'verifiedBy',
        'sourceType',
        'sourceUrl',
        'snapshotUrl',
        'clipBeforeUrl',
        'clipDuringUrl',
        'clipAfterUrl',
        'eventStartSec',
        'eventEndSec',
        'snapshotSec',
        'metadata',
        'createAlert',
    ]);

    for (const key of Object.keys(payload)) {
        if (!allowed.has(key)) {
            return res
                .status(400)
                .json({ error: `Bad Request: extraneous field "${key}" not allowed` });
        }
    }

    if (!payload.type || !ALERT_TYPES.includes(payload.type)) {
        return res.status(400).json({ error: `Bad Request: invalid type "${payload.type}"` });
    }
    if (!isFiniteNumber(payload.eventStartSec) || payload.eventStartSec < 0) {
        return res.status(400).json({ error: 'eventStartSec is required and must be >= 0' });
    }
    if (!isFiniteNumber(payload.eventEndSec) || payload.eventEndSec < 0) {
        return res.status(400).json({ error: 'eventEndSec is required and must be >= 0' });
    }
    if (payload.eventEndSec < payload.eventStartSec) {
        return res.status(400).json({ error: 'eventEndSec must be >= eventStartSec' });
    }
    if (payload.severity != null && (!isFiniteNumber(payload.severity) || payload.severity < 1 || payload.severity > 5)) {
        return res.status(400).json({ error: 'severity must be 1..5' });
    }
    if (payload.confidence != null && (!isFiniteNumber(payload.confidence) || payload.confidence < 0 || payload.confidence > 1)) {
        return res.status(400).json({ error: 'confidence must be 0..1' });
    }
    if (payload.snapshotSec != null && (!isFiniteNumber(payload.snapshotSec) || payload.snapshotSec < 0)) {
        return res.status(400).json({ error: 'snapshotSec must be >= 0' });
    }
    if (payload.verified != null && typeof payload.verified !== 'boolean') {
        return res.status(400).json({ error: 'verified must be boolean' });
    }
    if (payload.createAlert != null && typeof payload.createAlert !== 'boolean') {
        return res.status(400).json({ error: 'createAlert must be boolean' });
    }
    if (payload.sourceType != null && !SCAN_SOURCE_TYPES.includes(payload.sourceType)) {
        return res.status(400).json({ error: `invalid sourceType "${payload.sourceType}"` });
    }
    if (payload.metadata != null && !isPlainObject(payload.metadata)) {
        return res.status(400).json({ error: 'metadata must be object' });
    }

    return next();
}

/**
 * Parse bbox query string: ?bbox=minLon,minLat,maxLon,maxLat
 * Trả null nếu không có / không hợp lệ.
 */
export function parseBbox(q) {
    if (!q) return null;
    const parts = String(q).split(',').map((s) => parseFloat(s.trim()));
    if (parts.length !== 4 || parts.some((v) => !isFiniteNumber(v))) return null;
    const [minLon, minLat, maxLon, maxLat] = parts;
    if (minLon > maxLon || minLat > maxLat) return null;
    return {
        minLon: Math.max(-180, Math.min(180, minLon)),
        maxLon: Math.max(-180, Math.min(180, maxLon)),
        minLat: Math.max(-90, Math.min(90, minLat)),
        maxLat: Math.max(-90, Math.min(90, maxLat)),
    };
}
