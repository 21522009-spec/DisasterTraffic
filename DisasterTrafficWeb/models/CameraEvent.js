import mongoose from 'mongoose';

import { ALERT_TYPES } from './Alert.js';
import { SCAN_SOURCE_TYPES } from './ScanJob.js';

const CAMERA_EVENT_STATUSES = ['candidate', 'verified', 'rejected', 'alerted'];

const eventMetadataSchema = new mongoose.Schema(
    {
        detector: {
            type: String,
            trim: true,
            maxlength: 100,
            default: '',
        },
        verifier: {
            type: String,
            trim: true,
            maxlength: 100,
            default: '',
        },
        framesSampled: {
            type: Number,
            default: 0,
            min: 0,
        },
        rawConfidence: {
            type: Number,
            default: 0,
            min: 0,
            max: 1,
        },
        durationSec: {
            type: Number,
            default: 0,
            min: 0,
        },
        labels: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

const cameraEventSchema = new mongoose.Schema(
    {
        cameraId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Camera',
            required: true,
            index: true,
        },
        scanJobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ScanJob',
            required: true,
            index: true,
        },
        alertId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Alert',
            default: null,
            index: true,
        },
        type: {
            type: String,
            required: [true, 'type is required'],
            enum: ALERT_TYPES,
            index: true,
        },
        status: {
            type: String,
            enum: CAMERA_EVENT_STATUSES,
            default: 'candidate',
            index: true,
        },
        title: {
            type: String,
            trim: true,
            maxlength: 200,
            default: '',
        },
        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: '',
        },
        address: {
            type: String,
            trim: true,
            maxlength: 500,
            default: '',
        },
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
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: undefined },
        },
        sourceType: {
            type: String,
            enum: SCAN_SOURCE_TYPES,
            default: undefined,
        },
        sourceUrl: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: '',
        },
        snapshotUrl: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: '',
        },
        clipBeforeUrl: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: '',
        },
        clipDuringUrl: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: '',
        },
        clipAfterUrl: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: '',
        },
        eventStartSec: {
            type: Number,
            required: true,
            min: 0,
        },
        eventEndSec: {
            type: Number,
            required: true,
            min: 0,
        },
        snapshotSec: {
            type: Number,
            default: null,
            min: 0,
        },
        severity: {
            type: Number,
            min: 1,
            max: 5,
            default: 3,
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1,
            default: 0,
        },
        verified: {
            type: Boolean,
            default: false,
        },
        verifiedBy: {
            type: String,
            trim: true,
            maxlength: 100,
            default: '',
        },
        metadata: {
            type: eventMetadataSchema,
            default: () => ({}),
        },
    },
    { timestamps: true }
);

cameraEventSchema.pre('save', function syncLocation() {
    if (this.lng != null && this.lat != null) {
        this.location = { type: 'Point', coordinates: [this.lng, this.lat] };
    }
});

cameraEventSchema.pre('findOneAndUpdate', function syncLocationUpdate() {
    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    if ($set.lng != null && $set.lat != null) {
        $set.location = { type: 'Point', coordinates: [$set.lng, $set.lat] };
        if (update.$set) update.$set = $set;
    }
});

cameraEventSchema.index({ location: '2dsphere' });
cameraEventSchema.index({ scanJobId: 1, eventStartSec: 1 });
cameraEventSchema.index({ cameraId: 1, createdAt: -1 });

const CameraEvent =
    mongoose.models.CameraEvent || mongoose.model('CameraEvent', cameraEventSchema);

export { CAMERA_EVENT_STATUSES };
export default CameraEvent;
