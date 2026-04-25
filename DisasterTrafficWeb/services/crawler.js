import cron from 'node-cron';
import axios from 'axios';
import mongoose from 'mongoose';

// Alert Model (reuse from server.js if possible, but better to redefine or import. Assuming Alert model is registered in server.js or we can define it again)
const alertSchema = new mongoose.Schema({
    type: String,
    address: String,
    lng: Number,
    lat: Number,
    createdAt: { type: Date, default: Date.now }
});

// Avoid OverwriteModelError
const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);

export const initCrawler = (io) => {
    // Chạy mỗi 30 phút
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Crawler] Đang thu thập dữ liệu thiên tai...');

        try {
            // Giả lập gọi API lấy dữ liệu
            // const response = await axios.get('API_URL_HERE');

            // Mock Data gồm 3 sự kiện
            const mockDisasters = [
                { type: 'fire', address: 'Quận 1, TP.HCM', lng: 106.7009, lat: 10.7769 },
                { type: 'flood', address: 'Đường Nguyễn Hữu Cảnh, Bình Thạnh', lng: 106.7118, lat: 10.7925 },
                { type: 'traffic', address: 'Đường Cộng Hòa, Tân Bình', lng: 106.6493, lat: 10.8016 }
            ];

            for (const disaster of mockDisasters) {
                // Lưu vào Database
                const newAlert = new Alert(disaster);
                await newAlert.save();

                // Emit sự kiện new_disaster_alert
                io.emit('new_disaster_alert', newAlert);
            }

            console.log(`[Crawler] Đã thêm ${mockDisasters.length} sự kiện và emit qua Socket.io`);
        } catch (error) {
            console.error('[Crawler] Lỗi khi thu thập dữ liệu:', error);
        }
    });
};
