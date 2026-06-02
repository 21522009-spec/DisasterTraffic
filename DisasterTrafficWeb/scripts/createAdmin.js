import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const email = 'admin@disastertraffic.com';
    let user = await User.findOne({ email });
    if (user) {
        user.plan = 'enterprise';
        user.password = 'admin'; // update password to 'admin'
        await user.save();
        console.log(`Updated existing user ${email} to enterprise with password 'admin'`);
    } else {
        user = new User({
            name: 'System Admin',
            email: email,
            password: 'admin',
            plan: 'enterprise'
        });
        await user.save();
        console.log(`Created admin user:`);
        console.log(`Email: ${email}`);
        console.log(`Password: admin`);
        console.log(`Plan: enterprise`);
    }
    
    await mongoose.disconnect();
}

run().catch(console.error);
