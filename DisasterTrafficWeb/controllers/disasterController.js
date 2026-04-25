import mongoose from 'mongoose';

// Alert Model (Avoid OverwriteModelError)
const alertSchema = new mongoose.Schema({
    type: String,
    address: String,
    lng: Number,
    lat: Number,
    createdAt: { type: Date, default: Date.now }
});

const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);

export const getDisasters = async (req, res) => {
    try {
        const disasters = await Alert.find().sort({ createdAt: -1 }).limit(50);
        res.json(disasters);
    } catch (error) {
        console.error("Lỗi lấy dữ liệu disasters:", error);
        res.status(500).json({ error: 'Lỗi lấy dữ liệu từ Database' });
    }
};
