import { ALERT_TYPES, ALERT_SOURCES } from '../models/Alert.js';
import { CAMERA_KINDS, CAMERA_STATUSES } from '../models/Camera.js';

function isFiniteNumber(x) {
    return typeof x === 'number' && Number.isFinite(x);
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
