import Alert from '../models/Alert.js';

export const getDisasters = async (req, res) => {
    try {
        const disasters = await Alert.find().sort({ createdAt: -1 }).limit(50);
        res.json(disasters);
    } catch (error) {
        console.error("Lỗi lấy dữ liệu disasters:", error);
        res.status(500).json({ error: 'Lỗi lấy dữ liệu từ Database' });
    }
};
