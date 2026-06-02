import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Camera from '../models/Camera.js';

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Cập nhật camera Ngã 4 Hàng Xanh để dùng webcam
    const result = await Camera.findOneAndUpdate(
        { name: 'Ngã 4 Hàng Xanh' },
        { 
            kind: 'cctv',
            streamUrl: 'webcam:0'
        },
        { new: true }
    );
    
    if (result) {
        console.log('Cập nhật thành công camera "Ngã 4 Hàng Xanh":');
        console.log(`- Kind: ${result.kind}`);
        console.log(`- StreamUrl: ${result.streamUrl}`);
    } else {
        console.log('Không tìm thấy camera "Ngã 4 Hàng Xanh"');
    }
    
    await mongoose.disconnect();
}

run().catch(console.error);
