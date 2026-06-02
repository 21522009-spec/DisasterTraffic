import axios from 'axios';

async function test() {
    try {
        const res = await axios.post('http://localhost:3000/api/alerts/community', {
            type: 'traffic',
            lat: 10.762622,
            lng: 106.660172,
            address: 'Test Address',
            description: 'Test Description',
            severity: 3
        });
        console.log('Success:', res.data);
    } catch (err) {
        console.error('Error Status:', err.response?.status);
        console.error('Error Data:', err.response?.data);
    }
}

test();
