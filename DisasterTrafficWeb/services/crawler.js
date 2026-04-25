import cron from 'node-cron';
import axios from 'axios';
import { processDisasterNews } from '../controllers/disasterController.js';

/**
 * Mock data generator for testing purposes before integrating real APIs.
 */
function getMockData() {
    const districts = ['Quận 1', 'Quận 3', 'Bình Thạnh', 'Thủ Đức', 'Gò Vấp', 'Quận 7'];
    const types = ['fire', 'flood'];

    const randomDistrict = districts[Math.floor(Math.random() * districts.length)];
    const randomType = types[Math.floor(Math.random() * types.length)];

    let title = '';
    if (randomType === 'fire') {
        title = `Cảnh báo cháy lớn tại khu vực ${randomDistrict}, TP.HCM đang được dập lửa`;
    } else {
        title = `Mưa lớn gây ngập lụt nghiêm trọng trên các tuyến đường ở ${randomDistrict}, TP.HCM`;
    }

    return [
        {
            title: title,
            type: randomType,
            source: 'MockAPI'
        }
    ];
}

/**
 * Fetches real data from APIs (currently commented out as requested).
 */
async function fetchRealData() {
    let articles = [];

    // ==========================================
    // REAL API CALLS (COMMENTED OUT FOR NOW)
    // ==========================================

    /*
    try {
        const NEWS_API_KEY = process.env.NEWS_API_KEY;
        const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

        // 1. Fetch from NewsAPI
        if (NEWS_API_KEY) {
            const newsQuery = encodeURIComponent('("cháy" OR "hỏa hoạn" OR "ngập lụt" OR "kẹt xe") AND "TP.HCM"');
            const newsRes = await axios.get(`https://newsapi.org/v2/everything?q=${newsQuery}&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`);

            if (newsRes.data && newsRes.data.articles) {
                newsRes.data.articles.forEach(article => {
                    const title = article.title.toLowerCase();
                    let type = 'unknown';
                    if (title.includes('cháy') || title.includes('hỏa hoạn')) type = 'fire';
                    else if (title.includes('ngập') || title.includes('lụt')) type = 'flood';

                    if (type !== 'unknown') {
                        articles.push({ title: article.title, type, source: 'NewsAPI' });
                    }
                });
            }
        }

        // 2. Fetch from YouTube API
        if (YOUTUBE_API_KEY) {
            const ytQuery = encodeURIComponent('cháy hỏa hoạn ngập lụt kẹt xe TP.HCM');
            const ytRes = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${ytQuery}&type=video&order=date&maxResults=5&key=${YOUTUBE_API_KEY}`);

            if (ytRes.data && ytRes.data.items) {
                ytRes.data.items.forEach(item => {
                    const title = item.snippet.title.toLowerCase();
                    let type = 'unknown';
                    if (title.includes('cháy') || title.includes('hỏa hoạn')) type = 'fire';
                    else if (title.includes('ngập') || title.includes('lụt')) type = 'flood';

                    if (type !== 'unknown') {
                        articles.push({ title: item.snippet.title, type, source: 'YouTube' });
                    }
                });
            }
        }
    } catch (error) {
        console.error("[Crawler] Error fetching real data:", error.message);
    }
    */

    return articles;
}

/**
 * The main task that fetches news and processes them.
 * @param {Object} io - Socket.io instance.
 */
async function crawlDisasterNews(io) {
    console.log('[Crawler] Running disaster news crawler...');

    // Use mock data for testing UI as requested.
    // Replace with `await fetchRealData()` when ready for production.
    const articles = getMockData();

    for (const article of articles) {
        await processDisasterNews(article, io);
    }
}

/**
 * Initializes the cron job.
 * @param {Object} io - Socket.io instance.
 */
export function initCrawler(io) {
    // Run every 30 minutes: '0,30 * * * *'
    // To test frequently during development, you could use '*/1 * * * *' (every minute)
    cron.schedule('0,30 * * * *', () => {
        crawlDisasterNews(io);
    });

    console.log('[Crawler] Cron job initialized (runs every 30 mins).');

    // Optionally trigger an immediate run on startup for testing
    // setTimeout(() => crawlDisasterNews(io), 5000);
}
