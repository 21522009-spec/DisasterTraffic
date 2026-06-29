import mongoose from 'mongoose';

import { ALERT_TYPES } from './Alert.js';

const SCAN_SOURCE_TYPES = [
    'file',
    'youtube-vod',
    'direct-url',
    'rtsp-live',
    'hls-live',
    'youtube-live',
];

const SCAN_JOB_STATUSES = [
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
];

const scanConfigSchema = new mongoose.Schema(
    {
        scanEverySec: {
            type: Number,
            default: 2,
            min: 0.1,
        },
        mergeGapSec: {
            type: Number,
            default: 8,
            min: 0,
        },
        clipBeforeSec: {
            type: Number,
            default: 12,
            min: 0,
        },
        clipAfterSec: {
            type: Number,
            default: 12,
            min: 0,
        },
        artifactFps: {
            type: Number,
            default: 6,
            min: 1,
            max: 30,
        },
        verifyWithLlm: {
            type: Boolean,
            default: true,
        },
    },
    { _id: false }
);

const scanProgressSchema = new mongoose.Schema(
    {
        pct: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        framesRead: {
            type: Number,
            default: 0,
            min: 0,
        },
        framesSampled: {
            type: Number,
            default: 0,
            min: 0,
        },
        candidatesDetected: {
            type: Number,
            default: 0,
            min: 0,
        },
        eventsCreated: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { _id: false }
);

const scanTimelineSchema = new mongoose.Schema(
    {
        durationSec: {
            type: Number,
            default: null,
            min: 0,
        },
        processedSec: {
            type: Number,
            default: 0,
            min: 0,
        },
        lastFrameSec: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { _id: false }
);

const scanResultSchema = new mongoose.Schema(
    {
        summary: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: '',
        },
        eventsCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        alertsCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        warnings: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

const scanErrorSchema = new mongoose.Schema(
    {
        message: {
            type: String,
            trim: true,
            maxlength: 500,
            default: '',
        },
        details: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: '',
        },
    },
    { _id: false }
);

const sourceMetadataSchema = new mongoose.Schema(
    {
        youtubeVideoId: {
            type: String,
            trim: true,
            maxlength: 100,
            default: '',
        },
        fileName: {
            type: String,
            trim: true,
            maxlength: 255,
            default: '',
        },
        contentType: {
            type: String,
            trim: true,
            maxlength: 100,
            default: '',
        },
        durationSec: {
            type: Number,
            default: null,
            min: 0,
        },
    },
    { _id: false }
);

const scanJobSchema = new mongoose.Schema(
    {
        cameraId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Camera',
            required: true,
            index: true,
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: SCAN_JOB_STATUSES,
            default: 'queued',
            index: true,
        },
        sourceType: {
            type: String,
            enum: SCAN_SOURCE_TYPES,
            required: true,
            index: true,
        },
        sourceUrl: {
            type: String,
            required: [true, 'sourceUrl is required'],
            trim: true,
            maxlength: 2000,
        },
        sourceLabel: {
            type: String,
            trim: true,
            maxlength: 200,
            default: '',
        },
        sourceMetadata: {
            type: sourceMetadataSchema,
            default: () => ({}),
        },
        allowedEventTypes: {
            type: [String],
            default: [],
            validate: {
                validator(values) {
                    return values.every((value) => ALERT_TYPES.includes(value));
                },
                message: 'allowedEventTypes contains an invalid alert type',
            },
        },
        publishAlerts: {
            type: Boolean,
            default: true,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: '',
        },
        config: {
            type: scanConfigSchema,
            default: () => ({}),
        },
        progress: {
            type: scanProgressSchema,
            default: () => ({}),
        },
        timeline: {
            type: scanTimelineSchema,
            default: () => ({}),
        },
        result: {
            type: scanResultSchema,
            default: () => ({}),
        },
        error: {
            type: scanErrorSchema,
            default: () => ({}),
        },
        workerId: {
            type: String,
            trim: true,
            maxlength: 100,
            default: '',
        },
        requestedAt: {
            type: Date,
            default: Date.now,
        },
        startedAt: {
            type: Date,
            default: null,
        },
        completedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

scanJobSchema.index({ status: 1, createdAt: 1 });
scanJobSchema.index({ cameraId: 1, createdAt: -1 });

const ScanJob =
    mongoose.models.ScanJob || mongoose.model('ScanJob', scanJobSchema);

export { SCAN_SOURCE_TYPES, SCAN_JOB_STATUSES };
export default ScanJob;
