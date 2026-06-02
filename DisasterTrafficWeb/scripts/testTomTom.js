import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const HCM_BBOX = [106.4, 10.4, 107.2, 11.2];
const TOMTOM_CATEGORY_MAP = {
    1: 'traffic',  // Accident
    6: 'traffic',  // Jam
    7: 'traffic',  // Lane Closed
    8: 'traffic',  // Road Closed
    9: 'traffic',  // Road Works
    11: 'flood',   // Flooding
};

async function test() {
    const apiKey = process.env.TOMTOM_KEY;
    const [minLng, minLat, maxLng, maxLat] = HCM_BBOX;
    const categoryFilter = Object.keys(TOMTOM_CATEGORY_MAP).join(',');
    const fields = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,events{description},from,to,delay}}}';

    try {
        const res = await axios.get('https://api.tomtom.com/traffic/services/5/incidentDetails', {
            params: {
                key: apiKey,
                bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
                fields,
                language: 'vi-VN',
                t: 1111,
                categoryFilter,
            },
        });
        console.log('Success:', res.data);
    } catch (err) {
        console.error('Error Status:', err.response?.status);
        console.error('Error Data:', err.response?.data);
    }
}

test();
