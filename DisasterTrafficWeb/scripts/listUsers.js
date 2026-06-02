import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    const users = await User.find({});
    console.log('Users:');
    users.forEach(u => {
        console.log(`- Name: ${u.name}, Email: ${u.email}, Plan: ${u.plan}`);
    });
    await mongoose.disconnect();
}

run().catch(console.error);
