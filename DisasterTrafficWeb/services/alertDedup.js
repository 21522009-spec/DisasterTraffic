import Alert from '../models/Alert.js';

/**
 * Gộp các alert trùng từ nhiều nguồn (RSS, camera AI, YouTube, crawler...)
 * thành 1 bản ghi duy nhất.
 * Key trùng: cùng type + cùng ngày + nằm trong bán kính N km.
 * Community report KHÔNG dedup, giữ riêng để admin duyệt.
 */

const EARTH_RADIUS_M = 6378100;

const DUPE_RADIUS_METERS = Number(process.env.DEDUP_RADIUS_METERS) || 5000;

function startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Tìm alert cùng vụ (same type, trong bán kính, cùng ngày). Trả null nếu input là community.
export async function findDuplicate({ type, lng, lat, source }) {
    if (!type || lng == null || lat == null) return null;
    if (source === 'community') return null;

    const dayStart = startOfDay();
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    return Alert.findOne({
        type,
        source: { $ne: 'community' },
        createdAt: { $gte: dayStart, $lt: dayEnd },
        location: {
            $geoWithin: {
                $centerSphere: [
                    [lng, lat],
                    DUPE_RADIUS_METERS / EARTH_RADIUS_M,
                ],
            },
        },
    }).sort({ createdAt: -1 });
}

// Merge payload mới vào alert đã có. confidence/severity lấy max.
// Nếu confidence mới hơn nhiều (>0.2) thì cập nhật cả lng/lat/address.
// Source khác nhau thì append vào description và set verified=true.
export async function mergeAlert(existing, payload) {
    const updates = {};
    const oldConf = existing.confidence || 0;
    const newConf = payload.confidence != null ? Number(payload.confidence) : 0;

    if (newConf > oldConf) {
        updates.confidence = newConf;
        // Confidence boost lớn → tin location mới chính xác hơn
        if (newConf - oldConf > 0.2 && payload.lng != null && payload.lat != null) {
            updates.lng = Number(payload.lng);
            updates.lat = Number(payload.lat);
            updates.location = {
                type: 'Point',
                coordinates: [Number(payload.lng), Number(payload.lat)],
            };
            if (payload.address) updates.address = String(payload.address).slice(0, 500);
        }
    }

    if (payload.severity != null && Number(payload.severity) > (existing.severity || 0)) {
        updates.severity = Number(payload.severity);
    }

    // Cross-source: tag description + verified
    if (payload.source && payload.source !== existing.source) {
        const existingDesc = existing.description || '';
        const newDesc = (payload.description || '').trim();
        const tag = `[${payload.source}]`;
        // Tránh dup description (đã có "[source] ..." rồi)
        if (newDesc && !existingDesc.includes(tag) && !existingDesc.includes(newDesc.slice(0, 30))) {
            const merged = existingDesc
                ? `${existingDesc}\n+ ${tag} ${newDesc}`
                : `${tag} ${newDesc}`;
            updates.description = merged.slice(0, 1000);
        }
        if (!existing.verified) {
            updates.verified = true; // ≥ 2 nguồn xác nhận → verified
        }
    }

    if (Object.keys(updates).length === 0) {
        return existing;
    }

    Object.assign(existing, updates);
    await existing.save();
    return existing;
}
