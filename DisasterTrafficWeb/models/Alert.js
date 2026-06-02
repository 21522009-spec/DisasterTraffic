import mongoose from 'mongoose';

const ALERT_TYPES = ['fire', 'flood', 'traffic', 'earthquake', 'landslide', 'storm', 'other'];
const ALERT_SOURCES = ['ai', 'community', 'crawler', 'usgs', 'eonet', 'manual'];

const alertSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            required: [true, 'Type is required'],
            enum: {
                values: ALERT_TYPES,
                message: '{VALUE} is not a valid alert type',
            },
            index: true,
        },
        source: {
            type: String,
            enum: {
                values: ALERT_SOURCES,
                message: '{VALUE} is not a valid source',
            },
            default: 'manual',
            index: true,
        },
        address: {
            type: String,
            required: [true, 'Address is required'],
            trim: true,
            maxlength: [500, 'Address cannot be more than 500 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [1000, 'Description cannot be more than 1000 characters'],
            default: '',
        },
        severity: {
            type: Number,
            min: 1,
            max: 5,
            default: 3,
        },
        // Confidence score from AI pipeline (0..1). Higher = more reliable.
        confidence: {
            type: Number,
            min: 0,
            max: 1,
            default: 1,
        },
        verified: {
            type: Boolean,
            default: false,
        },
        // Keep flat lng/lat for backward-compat with existing frontend code.
        lng: {
            type: Number,
            required: [true, 'Longitude is required'],
            min: [-180, 'Longitude must be between -180 and 180'],
            max: [180, 'Longitude must be between -180 and 180'],
        },
        lat: {
            type: Number,
            required: [true, 'Latitude is required'],
            min: [-90, 'Latitude must be between -90 and 90'],
            max: [90, 'Latitude must be between -90 and 90'],
        },
        // GeoJSON Point — auto-populated from lng/lat in pre-save hook.
        // Enables fast geo queries (e.g. $geoWithin, $near) via 2dsphere index.
        location: {
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
        // Optional reference URL (source video, news article, ...)
        sourceUrl: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: '',
        },
        // Proximity votes for verification
        votes: [
            {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                voteType: { type: String, enum: ['up', 'down'] },
                voterLocation: {
                    type: { type: String, enum: ['Point'], default: 'Point' },
                    coordinates: { type: [Number] } // [lng, lat]
                },
                timestamp: { type: Date, default: Date.now }
            }
        ],
        // GenAI summary for situation reports
        summary: {
            type: String,
            default: ''
        },
        summaryExpiresAt: {
            type: Date,
            default: null
        },
        expiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        strict: true,
        timestamps: true, // adds createdAt + updatedAt
    }
);

// Auto-fill GeoJSON location from lng/lat before saving.
// Mongoose v7+ chuyển sang sync hooks không cần next() callback.
alertSchema.pre('save', function syncLocation() {
    if (this.lng != null && this.lat != null) {
        this.location = { type: 'Point', coordinates: [this.lng, this.lat] };
    }
});

// Same sync for findOneAndUpdate (used by crawler dedupe).
alertSchema.pre('findOneAndUpdate', function syncLocationOnUpdate() {
    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    if ($set.lng != null && $set.lat != null) {
        $set.location = { type: 'Point', coordinates: [$set.lng, $set.lat] };
        if (update.$set) update.$set = $set;
    }
});

// Indexes
alertSchema.index({ location: '2dsphere' });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);

export { ALERT_TYPES, ALERT_SOURCES };
export default Alert;
