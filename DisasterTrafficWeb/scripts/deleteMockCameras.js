import mongoose from 'mongoose';
import 'dotenv/config';

const uri = process.env.MONGO_URI;
if (!uri) { console.error('MONGO_URI not set'); process.exit(1); }

await mongoose.connect(uri);
const r = await mongoose.connection.collection('cameras').deleteMany({ kind: 'mock' });
console.log('Deleted:', r.deletedCount, 'mock cameras');
await mongoose.disconnect();
