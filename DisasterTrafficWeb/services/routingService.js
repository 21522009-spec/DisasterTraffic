import Alert from '../models/Alert.js';

function haversineDistance(coords1, coords2) {
    const [lon1, lat1] = coords1;
    const [lon2, lat2] = coords2;
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function distanceToSegment(p, a, b) {
    const dAB = haversineDistance(a, b);
    if (dAB === 0) return haversineDistance(p, a);

    const dAP = haversineDistance(a, p);
    const dBP = haversineDistance(b, p);

    const cosTheta = (dAP * dAP + dAB * dAB - dBP * dBP) / (2 * dAP * dAB);
    if (cosTheta < 0) return dAP;
    if (cosTheta > 1) return dBP;

    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    return dAP * sinTheta;
}

export async function assessRouteRisk(polyline, thresholdMeters = 500) {
    if (!Array.isArray(polyline) || polyline.length < 2) {
        throw new Error('Polyline must be an array of at least 2 points: [[lng, lat], ...]');
    }

    // 1. Calculate Bounding Box of the route
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const [lng, lat] of polyline) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    }

    // Expand bounding box by approx 1km (0.01 degree) to cover nearby alerts
    const BUFFER = 0.01;
    const box = [
        [minLng - BUFFER, minLat - BUFFER],
        [maxLng + BUFFER, maxLat + BUFFER]
    ];

    // 2. Fetch active alerts inside bounding box
    // Mongoose query using GeoJSON box
    const alerts = await Alert.find({
        location: {
            $geoWithin: {
                $box: box
            }
        }
    }).lean();

    const hazards = [];
    let safetyScore = 100;

    // 3. Check distance of each alert to route segments
    for (const alert of alerts) {
        const alertPoint = [alert.lng, alert.lat];
        let minDistance = Infinity;

        for (let i = 0; i < polyline.length - 1; i++) {
            const start = polyline[i];
            const end = polyline[i + 1];
            const dist = distanceToSegment(alertPoint, start, end);
            if (dist < minDistance) {
                minDistance = dist;
            }
        }

        if (minDistance <= thresholdMeters) {
            hazards.push({
                alertId: alert._id,
                type: alert.type,
                address: alert.address,
                severity: alert.severity,
                distance: Math.round(minDistance),
                coordinates: alertPoint
            });

            // Deduct safety score based on severity and proximity
            const deduction = Math.max(5, (alert.severity * 5) * (1 - minDistance / thresholdMeters));
            safetyScore -= deduction;
        }
    }

    safetyScore = Math.max(0, Math.round(safetyScore));

    return {
        safetyScore,
        status: safetyScore > 80 ? 'SAFE' : safetyScore > 50 ? 'CAUTION' : 'DANGEROUS',
        totalHazards: hazards.length,
        hazards
    };
}
