/**
 * Seed danh sách sự cố/thiên tai mẫu (cháy, ngập lụt, kẹt xe) vào MongoDB.
 * Chạy: node scripts/seedAlerts.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Alert from '../models/Alert.js';

const SEED_ALERTS = [
    {
        type: 'flood',
        source: 'manual',
        address: 'Đường Nguyễn Hữu Cảnh, Bình Thạnh, TP.HCM',
        description: 'Triều cường dâng cao gây ngập lụt diện rộng, mực nước sâu khoảng 40-50cm, phương tiện di chuyển khó khăn.',
        severity: 4,
        confidence: 0.95,
        verified: true,
        lng: 106.7156,
        lat: 10.7896,
    },
    {
        type: 'traffic',
        source: 'manual',
        address: 'Vòng xoay Hàng Xanh, Bình Thạnh, TP.HCM',
        description: 'Kẹt xe kéo dài từ đường Điện Biên Phủ đến Xô Viết Nghệ Tĩnh do có xe buýt gặp sự cố chết máy tại vòng xoay.',
        severity: 3,
        confidence: 0.9,
        verified: true,
        lng: 106.7115,
        lat: 10.7991,
    },
    {
        type: 'fire',
        source: 'manual',
        address: 'Hẻm 456 Trần Hưng Đạo, Quận 5, TP.HCM',
        description: 'Đám cháy phát ra từ tầng 2 của ngôi nhà trong hẻm sâu. Lực lượng PCCC đang tiếp cận và xử lý đám cháy.',
        severity: 5,
        confidence: 0.98,
        verified: true,
        lng: 106.6621,
        lat: 10.7535,
    },
    {
        type: 'flood',
        source: 'manual',
        address: 'Khu vực Thảo Điền, Quận 2, TP.HCM',
        description: 'Mưa lớn cục bộ kết hợp triều cường gây ngập úng nghiêm trọng tại nhiều tuyến đường nhánh nội khu.',
        severity: 3,
        confidence: 0.85,
        verified: false,
        lng: 106.7368,
        lat: 10.8038,
    },
    {
        type: 'traffic',
        source: 'manual',
        address: 'Ngã sáu Dân Chủ, Quận 3, TP.HCM',
        description: 'Mật độ phương tiện tham gia giao thông tăng đột biến, giao thông hỗn loạn tại các nhánh rẽ hướng vào trung tâm.',
        severity: 3,
        confidence: 0.88,
        verified: false,
        lng: 106.6797,
        lat: 10.7788,
    }
];

async function main() {
    const MONGO_URI = (process.env.MONGO_URI || '').trim();
    if (!MONGO_URI) {
        console.error('MONGO_URI chưa được set trong .env');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');

    // Xóa bớt các cảnh báo manual/crawler cũ nếu muốn, hoặc giữ nguyên
    console.log('Đang xóa các cảnh báo mẫu cũ...');
    await Alert.deleteMany({ source: 'manual' });

    let inserted = 0;
    for (const data of SEED_ALERTS) {
        await Alert.create(data);
        inserted++;
    }

    console.log(`Đã seed thành công: +${inserted} sự cố mẫu (cháy, lụt, kẹt xe) vào database.`);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Seed lỗi:', err);
    process.exit(1);
});
