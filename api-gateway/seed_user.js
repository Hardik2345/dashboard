const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const GlobalUser = require('./src/models/GlobalUser.model');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_service_db';

async function seedUser() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const email = 'admin@example.com';
        const existing = await GlobalUser.findOne({ email });

        if (existing) {
            console.log('User already exists:', email);
            console.log('ID:', existing._id);
        } else {
            const passwordHash = await bcrypt.hash('password123', 10);
            const brandId = 'brand-' + randomUUID();

            const user = await GlobalUser.create({
                email,
                password_hash: passwordHash,
                status: 'active',
                primary_brand_id: brandId,
                brand_memberships: [{
                    brand_id: brandId,
                    role: 'owner',
                    status: 'active',
                    permissions: ['all']
                }]
            });

            console.log('User Created Successfully!');
            console.log('-------------------------');
            console.log('Email:', email);
            console.log('Password: password123');
            console.log('User ID:', user._id);
            console.log('Brand ID:', brandId);
            console.log('-------------------------');
        }

    } catch (err) {
        console.error('Seeding Failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

seedUser();
