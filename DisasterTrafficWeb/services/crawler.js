import cron from 'node-cron';
import axios from 'axios';
import Alert from '../models/Alert.js';

/**
 * Crawler ingest dữ liệu thiên tai/giao thông từ các nguồn ngoài.
 *
 * Nguồn 1 — NASA EONET v3: cháy rừng, lũ lụt, bão (phạm vi Việt Nam)
 * Nguồn 2 — TomTom Traffic Incidents v5: tai nạn, kẹt xe, ngập (TP.HCM)
 *
 * Dedupe: (source, type, address, ngày) — nếu đã có bản ghi trong ngày thì cập nhật, không tạo mới.
 */

// Bounding box Việt Nam [minLng, minLat, maxLng, maxLat] — dùng cho EONET
const VN_BBOX = [102.0, 8.5, 109.5, 23.5];

// Bounding box TP.HCM — dùng cho TomTom (nhỏ hơn để giảm noise)
const HCM_BBOX = [106.4, 10.4, 107.2, 11.2];

const EONET_TYPE_MAP = {
    wildfires: 'fire',
    floods: 'flood',
    severeStorms: 'storm',
    landslides: 'landslide',
};

const TOMTOM_CATEGORY_MAP = {
    1: 'traffic',  // Accident
    6: 'traffic',  // Jam
    7: 'traffic',  // Lane Closed
    8: 'traffic',  // Road Closed
    9: 'traffic',  // Road Works
    11: 'flood',   // Flooding
};

async function fetchFromEONET() {
    const [minLng, minLat, maxLng, maxLat] = VN_BBOX;
    const res = await axios.get('https://eonet.gsfc.nasa.gov/api/v3/events', {
        timeout: 15000,
        params: {
            status: 'open',
            days: 7,
            bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
        },
    });

    const events = res.data?.events ?? [];
    const results = [];

    for (const event of events) {
        const categoryId = event.categories?.[0]?.id;
        const type = EONET_TYPE_MAP[categoryId];
        if (!type) continue;

        const geo = event.geometry?.[0];
        if (!geo || geo.type !== 'Point') continue;
        const [lng, lat] = geo.coordinates;

        results.push({
            type,
            address: event.title,
            lng,
            lat,
            source: 'eonet',
            description: event.description?.trim() || event.title,
            severity: type === 'fire' ? 4 : 3,
            confidence: 0.8,
        });
    }

    return results;
}

async function fetchFromTomTom(apiKey) {
    if (!apiKey) return [];

    const [minLng, minLat, maxLng, maxLat] = HCM_BBOX;
    const categoryFilter = Object.keys(TOMTOM_CATEGORY_MAP).join(',');
    const fields = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,events{description},from,to,delay}}}';

    const res = await axios.get('https://api.tomtom.com/traffic/services/5/incidentDetails', {
        timeout: 15000,
        params: {
            key: apiKey,
            bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
            fields,
            language: 'en-US',
            t: 1111,
            categoryFilter,
        },
    });

    const incidents = res.data?.incidents ?? [];
    const results = [];

    for (const incident of incidents) {
        const props = incident.properties ?? {};
        const type = TOMTOM_CATEGORY_MAP[props.iconCategory];
        if (!type) continue;

        const geo = incident.geometry;
        if (!geo) continue;

        let lng, lat;
        if (geo.type === 'Point') {
            [lng, lat] = geo.coordinates;
        } else if (geo.type === 'LineString' && geo.coordinates?.length > 0) {
            // Lấy điểm giữa của đoạn đường
            const mid = Math.floor(geo.coordinates.length / 2);
            [lng, lat] = geo.coordinates[mid];
        } else {
            continue;
        }

        const description = props.events?.[0]?.description ?? '';
        const address = [props.from, props.to].filter(Boolean).join(' → ') || description || 'TP.HCM';

        results.push({
            type,
            address,
            lng,
            lat,
            source: 'tomtom',
            description,
            severity: 2,
            confidence: 0.9,
        });
    }

    return results;
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

async function upsertAlerts(io, alerts) {
    let inserted = 0;
    let updated = 0;

    for (const a of alerts) {
        const dayStart = startOfToday();
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const filter = {
            source: a.source,
            type: a.type,
            address: a.address,
            createdAt: { $gte: dayStart, $lt: dayEnd },
        };

        const update = {
            $set: {
                lng: a.lng,
                lat: a.lat,
                description: a.description || '',
                severity: a.severity ?? 3,
                confidence: a.confidence ?? 0.7,
                source: a.source,
            },
            $setOnInsert: { type: a.type, address: a.address, verified: false },
        };

        const opts = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };

        try {
            const before = await Alert.findOne(filter).lean();
            const doc = await Alert.findOneAndUpdate(filter, update, opts);

            if (!before) {
                inserted++;
                io.emit('new-alert', doc);
            } else {
                updated++;
            }
        } catch (err) {
            console.error('[crawler] upsert error:', err.message);
        }
    }

    return { inserted, updated };
}

async function runCrawler(io) {
    console.log('[crawler] Đang thu thập dữ liệu thiên tai...');
    const TOMTOM_KEY = (process.env.TOMTOM_KEY || '').trim();

    const [eonetResult, tomtomResult] = await Promise.allSettled([
        fetchFromEONET(),
        fetchFromTomTom(TOMTOM_KEY),
    ]);

    if (eonetResult.status === 'rejected') {
        console.error('[crawler] EONET lỗi:', eonetResult.reason?.message);
    }
    if (tomtomResult.status === 'rejected') {
        console.error('[crawler] TomTom lỗi:', tomtomResult.reason?.message);
    }

    const events = [
        ...(eonetResult.status === 'fulfilled' ? eonetResult.value : []),
        ...(tomtomResult.status === 'fulfilled' ? tomtomResult.value : []),
    ];

    if (events.length === 0) {
        console.log('[crawler] Không có sự kiện mới trong khu vực.');
        return;
    }

    try {
        const { inserted, updated } = await upsertAlerts(io, events);
        console.log(`[crawler] Hoàn tất: +${inserted} mới, ${updated} cập nhật (tổng ${events.length})`);
    } catch (error) {
        console.error('[crawler] Lỗi khi lưu dữ liệu:', error);
    }
}

export const initCrawler = (io) => {
    // Chạy ngay lập tức khi start server
    runCrawler(io).catch((err) => console.error('[crawler] Lỗi chạy khởi động:', err));

    // Lên lịch chạy mỗi 30 phút
    cron.schedule('*/30 * * * *', () => {
        runCrawler(io).catch((err) => console.error('[crawler] Lỗi chạy theo lịch:', err));
    });
};

export { upsertAlerts };
