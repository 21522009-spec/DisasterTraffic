import { DisasterEvent } from '../models/DisasterEvent.js';

// Dictionary mapping district names to approximate center coordinates
const districtCoordinates = {
  'Quận 1': { lat: 10.7756, lng: 106.7004 },
  'Quận 2': { lat: 10.7872, lng: 106.7456 },
  'Quận 3': { lat: 10.7843, lng: 106.6817 },
  'Quận 4': { lat: 10.7584, lng: 106.7011 },
  'Quận 5': { lat: 10.7540, lng: 106.6631 },
  'Quận 6': { lat: 10.7480, lng: 106.6353 },
  'Quận 7': { lat: 10.7340, lng: 106.7215 },
  'Quận 8': { lat: 10.7248, lng: 106.6343 },
  'Quận 9': { lat: 10.8428, lng: 106.8277 },
  'Quận 10': { lat: 10.7743, lng: 106.6669 },
  'Quận 11': { lat: 10.7628, lng: 106.6430 },
  'Quận 12': { lat: 10.8671, lng: 106.6413 },
  'Bình Thạnh': { lat: 10.8105, lng: 106.7091 },
  'Gò Vấp': { lat: 10.8290, lng: 106.6775 },
  'Phú Nhuận': { lat: 10.7991, lng: 106.6802 },
  'Tân Bình': { lat: 10.8014, lng: 106.6526 },
  'Tân Phú': { lat: 10.7905, lng: 106.6322 },
  'Bình Tân': { lat: 10.7303, lng: 106.5936 },
  'Thủ Đức': { lat: 10.8494, lng: 106.7537 }, // Thành phố Thủ Đức
  'Nhà Bè': { lat: 10.6385, lng: 106.7211 },
  'Hóc Môn': { lat: 10.8841, lng: 106.5947 },
  'Củ Chi': { lat: 11.0066, lng: 106.5132 },
  'Bình Chánh': { lat: 10.6865, lng: 106.5901 },
  'Cần Giờ': { lat: 10.5097, lng: 106.8797 },
};

/**
 * Extracts a district name from a given text (like a news title).
 * @param {string} text - The input text to search for district names.
 * @returns {string|null} - The matched district name or null if not found.
 */
function extractLocationFromText(text) {
  const normalizedText = text.toLowerCase();
  for (const district of Object.keys(districtCoordinates)) {
    if (normalizedText.includes(district.toLowerCase())) {
      return district;
    }
  }
  return null;
}

/**
 * Mocks geocoding by returning the pre-defined coordinates for a district.
 * In a real-world application, this would call an external API like Google Maps Geocoding API.
 * @param {string} address - The address (district name) to geocode.
 * @returns {Object|null} - An object containing lat and lng, or null if address is unknown.
 */
async function mockGeocoding(address) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 50));

  if (districtCoordinates[address]) {
    return districtCoordinates[address];
  }
  return null;
}

/**
 * Processes a newly fetched disaster article.
 * Extracts location, geocodes it, saves to the database, and emits via Socket.io.
 *
 * @param {Object} article - The article to process.
 * @param {string} article.title - Title of the news/video.
 * @param {string} article.type - Type of disaster ('fire', 'flood').
 * @param {string} article.source - Source of the news (e.g., 'NewsAPI', 'YouTube').
 * @param {Object} io - The socket.io instance to emit real-time updates.
 */
export async function processDisasterNews(article, io) {
  try {
    const { title, type, source } = article;

    // 1. Extract location
    const district = extractLocationFromText(title);
    if (!district) {
      console.log(`[DisasterController] No location found in title: "${title}"`);
      return; // Skip if we can't find a location
    }

    // 2. Geocode
    const coords = await mockGeocoding(district);
    if (!coords) {
      console.log(`[DisasterController] Could not geocode address: "${district}"`);
      return;
    }

    // 3. Check if already exists (basic deduplication based on title to avoid spamming DB)
    const existing = await DisasterEvent.findOne({ title });
    if (existing) {
       console.log(`[DisasterController] Article already processed: "${title}"`);
       return;
    }

    // 4. Save to Database
    const newEvent = new DisasterEvent({
      title,
      type,
      address: district,
      latitude: coords.lat,
      longitude: coords.lng,
      source
    });

    await newEvent.save();
    console.log(`[DisasterController] Saved new event: ${title} at ${district}`);

    // 5. Emit real-time event via Socket.io
    if (io) {
      io.emit('new-disaster-event', newEvent);
    }

  } catch (error) {
    console.error('[DisasterController] Error processing disaster news:', error);
  }
}

/**
 * API Handler to get all disaster events.
 */
export async function getDisasterEvents(req, res) {
  try {
    const events = await DisasterEvent.find().sort({ createdAt: -1 }).limit(100);
    res.json(events);
  } catch (error) {
    console.error("[DisasterController] Error fetching events:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
