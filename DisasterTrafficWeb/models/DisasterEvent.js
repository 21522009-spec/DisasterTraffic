import mongoose from 'mongoose';

// Define the schema for Disaster events
const disasterEventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  type: {
    type: String, // 'fire' or 'flood'
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  latitude: {
    type: Number,
    required: true,
  },
  longitude: {
    type: Number,
    required: true,
  },
  source: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create and export the model
export const DisasterEvent = mongoose.model('DisasterEvent', disasterEventSchema);
