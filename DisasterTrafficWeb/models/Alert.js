import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
    type: {
        type: String,
        required: [true, 'Type is required'],
        enum: {
            values: ['fire', 'flood', 'traffic', 'earthquake'], 
            message: '{VALUE} is not a valid alert type'
        }
    },
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
        maxlength: [500, 'Address cannot be more than 500 characters']
    },
    lng: {
        type: Number,
        required: [true, 'Longitude is required'],
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180']
    },
    lat: {
        type: Number,
        required: [true, 'Latitude is required'],
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    strict: true
});

const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);

export default Alert;
