import axios from 'axios';
import Device from '../models/Device.js';

/**
 * Expo Push Service — gửi notification miễn phí cho mọi token Expo Push.
 *
 * Doc: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Ưu điểm:
 *   - Không cần Firebase setup, không cần APN cert
 *   - Free, không giới hạn volume
 *   - Hỗ trợ batch tới 100 message/request
 *
 * Nhược:
 *   - iOS Expo Go không nhận được push (giới hạn của Apple) — chỉ hoạt động trong
 *     Development Build hoặc App Store build. Android Expo Go OK bình thường.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

/** Type icon cho push title */
const TYPE_EMOJI = {
    fire: '🔥',
    flood: '🌊',
    traffic: '🚗',
    earthquake: '🌍',
    landslide: '⛰️',
    storm: '🌪️',
    other: '⚠️',
};

const TYPE_LABEL_VI = {
    fire: 'Cháy',
    flood: 'Ngập lụt',
    traffic: 'Kẹt xe',
    earthquake: 'Động đất',
    landslide: 'Sạt lở',
    storm: 'Bão',
    other: 'Cảnh báo',
};

function buildPushBody(alert) {
    const emoji = TYPE_EMOJI[alert.type] || '⚠️';
    const label = TYPE_LABEL_VI[alert.type] || 'Cảnh báo';
    const title = `${emoji} ${label}`;
    const body = alert.address || alert.description || 'Có cảnh báo mới gần bạn';
    return { title, body };
}

function withinBbox(lon, lat, bbox) {
    if (!bbox) return true; // không filter
    return (
        lon >= bbox.minLon &&
        lon <= bbox.maxLon &&
        lat >= bbox.minLat &&
        lat <= bbox.maxLat
    );
}

function matchTypes(alert, subscribedTypes) {
    if (!subscribedTypes || subscribedTypes.length === 0) return true;
    return subscribedTypes.includes(alert.type);
}

/**
 * Gửi push notification cho tất cả device active phù hợp với alert.
 * Filter:
 *   - device.active = true
 *   - alert nằm trong device.subscribedBbox (nếu có)
 *   - alert.type nằm trong device.subscribedTypes (nếu có)
 */
export async function sendAlertPush(alert) {
    if (!alert) return { sent: 0, errors: 0 };

    try {
        const devices = await Device.find({ active: true }).lean();
        if (devices.length === 0) return { sent: 0, errors: 0 };

        // Filter
        const recipients = devices.filter(
            (d) =>
                withinBbox(alert.lng, alert.lat, d.subscribedBbox) &&
                matchTypes(alert, d.subscribedTypes)
        );

        if (recipients.length === 0) return { sent: 0, errors: 0 };

        const { title, body } = buildPushBody(alert);
        const data = {
            alertId: String(alert._id || ''),
            type: alert.type,
            lat: alert.lat,
            lng: alert.lng,
        };

        const messages = recipients.map((d) => ({
            to: d.token,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high',
        }));

        let sent = 0;
        let errors = 0;

        // Batch 100 messages mỗi request
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const batch = messages.slice(i, i + BATCH_SIZE);
            try {
                const r = await axios.post(EXPO_PUSH_URL, batch, {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'Accept-Encoding': 'gzip, deflate',
                    },
                    timeout: 15000,
                });

                const tickets = r.data?.data || [];
                for (let j = 0; j < tickets.length; j++) {
                    const t = tickets[j];
                    if (t.status === 'ok') {
                        sent++;
                    } else {
                        errors++;
                        // Token không hợp lệ → đánh dấu inactive
                        if (
                            t.details?.error === 'DeviceNotRegistered' ||
                            t.details?.error === 'InvalidCredentials'
                        ) {
                            const badToken = batch[j]?.to;
                            if (badToken) {
                                Device.findOneAndUpdate(
                                    { token: badToken },
                                    { $set: { active: false } }
                                ).catch((err) =>
                                    console.error('[push] deactivate token error:', err.message)
                                );
                            }
                        }
                        console.warn('[push] ticket error:', t.details?.error ?? t.status);
                    }
                }
            } catch (err) {
                errors += batch.length;
                console.error('[push] batch error:', err.message);
            }
        }

        console.log(`[push] alert ${alert.type}: sent=${sent}, errors=${errors}`);
        return { sent, errors };
    } catch (err) {
        console.error('[push] sendAlertPush error:', err);
        return { sent: 0, errors: 1 };
    }
}
