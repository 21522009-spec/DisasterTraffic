import mongoose from 'mongoose';

/**
 * Device — lưu Expo Push Token để gửi notification.
 *
 * Mỗi thiết bị mobile đăng nhập vào app sẽ:
 *   1. Xin permission notification
 *   2. Get Expo Push Token (unique per device install)
 *   3. POST /api/devices/register để backend lưu
 *
 * Khi có alert mới, backend sẽ POST tới Expo Push Service với danh sách token này.
 */

const PLATFORMS = ['ios', 'android', 'web'];

const deviceSchema = new mongoose.Schema(
    {
        // Expo push token, dạng "ExponentPushToken[xxxxxxxxxxxx]"
        token: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        platform: {
            type: String,
            enum: PLATFORMS,
            default: 'ios',
        },
        // Cho phép user filter alert theo loại (nếu muốn). Để trống = nhận tất cả.
        subscribedTypes: {
            type: [String],
            default: [],
        },
        // (Tuỳ chọn) Subscribe theo bbox — chỉ nhận push nếu alert nằm trong vùng.
        // Cùng format với feature subscribe trên web.
        subscribedBbox: {
            type: {
                minLon: Number,
                minLat: Number,
                maxLon: Number,
                maxLat: Number,
            },
            default: null,
        },
        active: {
            type: Boolean,
            default: true,
        },
        // Location for geofenced push broadcasts
        lastLocation: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point',
            },
            coordinates: {
                type: [Number], // [lng, lat]
                default: undefined,
            },
        },
        // Metadata để debug
        meta: {
            type: Object,
            default: {},
        },
    },
    { timestamps: true }
);

deviceSchema.index({ lastLocation: '2dsphere' });

const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);

export { PLATFORMS };
export default Device;
