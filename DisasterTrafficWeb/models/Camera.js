import mongoose from 'mongoose';

/**
 * Camera = nguồn video CỐ ĐỊNH đã đăng ký (CCTV giao thông, YouTube live, webcam...).
 *
 * Khi AI detect 1 sự kiện trên stream của camera này, sự kiện đó sẽ có
 * lat/lng = camera.location → giải bài toán geolocation gần như 100% accuracy.
 */

const CAMERA_KINDS = ['cctv', 'youtube', 'rtsp', 'http', 'mock'];
const CAMERA_STATUSES = ['active', 'paused', 'broken', 'pending'];

const cameraSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: 200,
        },
        // Loại stream — quyết định AI service dùng plugin nào để đọc
        kind: {
            type: String,
            enum: CAMERA_KINDS,
            default: 'mock',
            index: true,
        },
        streamUrl: {
            type: String,
            required: [true, 'streamUrl is required'],
            trim: true,
            maxlength: 1000,
        },
        // Lat/Lng cố định của camera. KHI AI detect, sự kiện lấy luôn 2 giá trị này.
        lng: {
            type: Number,
            required: true,
            min: -180,
            max: 180,
        },
        lat: {
            type: Number,
            required: true,
            min: -90,
            max: 90,
        },
        // GeoJSON Point — auto-fill từ lng/lat (giống Alert)
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: undefined },
        },
        address: {
            type: String,
            trim: true,
            maxlength: 500,
            default: '',
        },
        // Các loại sự kiện camera này được phép sinh ra. Nếu để rỗng = tất cả.
        // Ví dụ: camera ngã 4 chỉ enable ['traffic'], camera vùng trũng enable ['flood'].
        allowedEventTypes: {
            type: [String],
            default: [],
        },
        status: {
            type: String,
            enum: CAMERA_STATUSES,
            default: 'active',
            index: true,
        },
        // Cooldown (ms) giữa 2 alert cùng loại từ 1 camera, chống spam
        cooldownMs: {
            type: Number,
            default: 60_000, // 1 phút
            min: 0,
        },
        // Ghi nhận lần sinh alert gần nhất (để AI service tự check cooldown)
        lastAlertAt: {
            type: Date,
            default: null,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: '',
        },
    },
    { timestamps: true }
);

// Mongoose v7+ chuyển sang async/sync hooks không cần next() callback.
cameraSchema.pre('save', function syncLocation() {
    if (this.lng != null && this.lat != null) {
        this.location = { type: 'Point', coordinates: [this.lng, this.lat] };
    }
});

cameraSchema.pre('findOneAndUpdate', function syncLocationUpdate() {
    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    if ($set.lng != null && $set.lat != null) {
        $set.location = { type: 'Point', coordinates: [$set.lng, $set.lat] };
        if (update.$set) update.$set = $set;
    }
});

cameraSchema.index({ location: '2dsphere' });

const Camera =
    mongoose.models.Camera || mongoose.model('Camera', cameraSchema);

export { CAMERA_KINDS, CAMERA_STATUSES };
export default Camera;
