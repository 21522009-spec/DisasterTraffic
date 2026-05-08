/**
 * Seed danh sách camera mẫu vào MongoDB — CHỈ DÙNG CHO MÔI TRƯỜNG DEV.
 *
 * KHÔNG chạy script này trên production — dữ liệu camera sẽ có streamUrl
 * dạng mock:// không kết nối được với camera thật.
 * Trên production, thêm camera thật qua Admin Panel (/admin.html).
 *
 * Chạy:
 *   node scripts/seedCameras.js
 *
 * Tham số:
 *   --reset      Xoá hết camera cũ trước khi seed
 *   --dry        Chỉ in ra, không ghi DB
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Camera from '../models/Camera.js';

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const DRY = args.has('--dry');

const SEED = [
    {
        name: 'Ngã 4 Hàng Xanh',
        kind: 'mock',
        streamUrl: 'mock://hang-xanh.mp4',
        lng: 106.7115,
        lat: 10.7991,
        address: 'Ngã 4 Hàng Xanh, Bình Thạnh, TP.HCM',
        allowedEventTypes: ['traffic', 'flood'],
        notes: 'Hay kẹt xe giờ cao điểm. Vùng trũng dễ ngập khi mưa to.',
    },
    {
        name: 'Vòng xoay Phú Lâm',
        kind: 'mock',
        streamUrl: 'mock://phu-lam.mp4',
        lng: 106.6291,
        lat: 10.7508,
        address: 'Vòng xoay Phú Lâm, Quận 6, TP.HCM',
        allowedEventTypes: ['traffic'],
    },
    {
        name: 'Đường Nguyễn Hữu Cảnh',
        kind: 'mock',
        streamUrl: 'mock://nguyen-huu-canh.mp4',
        lng: 106.7156,
        lat: 10.7896,
        address: 'Đường Nguyễn Hữu Cảnh, Bình Thạnh, TP.HCM',
        allowedEventTypes: ['flood', 'traffic'],
        notes: 'Vùng trũng nổi tiếng — ngập sau mỗi cơn mưa.',
    },
    {
        name: 'Ngã 6 Cộng Hòa',
        kind: 'mock',
        streamUrl: 'mock://cong-hoa.mp4',
        lng: 106.6493,
        lat: 10.8016,
        address: 'Ngã 6 Cộng Hòa, Tân Bình, TP.HCM',
        allowedEventTypes: ['traffic', 'fire'],
    },
    {
        name: 'Cầu Sài Gòn',
        kind: 'mock',
        streamUrl: 'mock://cau-saigon.mp4',
        lng: 106.7212,
        lat: 10.7958,
        address: 'Cầu Sài Gòn, Quận 2, TP.HCM',
        allowedEventTypes: ['traffic'],
    },
];

async function main() {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ Script này không được chạy trên production. Thêm camera qua Admin Panel.');
        process.exit(1);
    }

    const MONGO_URI = (process.env.MONGO_URI || '').trim();
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI chưa được set trong .env');
        process.exit(1);
    }

    if (DRY) {
        console.log('--- DRY RUN ---');
        for (const c of SEED) console.log('📷', c.name, `(${c.lat}, ${c.lng})`);
        console.log(`Total: ${SEED.length} cameras (no DB write).`);
        return;
    }

    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ MongoDB connected');

    if (RESET) {
        const r = await Camera.deleteMany({});
        console.log(`🗑️  Đã xoá ${r.deletedCount} camera cũ`);
    }

    let inserted = 0;
    let skipped = 0;
    for (const data of SEED) {
        const exists = await Camera.findOne({ name: data.name });
        if (exists) {
            skipped++;
            continue;
        }
        await Camera.create(data);
        inserted++;
    }

    console.log(`✅ Seed xong: +${inserted} mới, ${skipped} đã có (skip).`);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('❌ Seed lỗi:', err);
    process.exit(1);
});
