import jwt from 'jsonwebtoken';

export function requireApiKey(req, res, next) {
    const validKey = process.env.AI_WEBHOOK_SECRET;
    if (!validKey || validKey === 'replace_me_with_a_long_random_string') {
        console.warn('[auth] AI_WEBHOOK_SECRET chưa được cấu hình. Mọi request bị từ chối.');
        return res.status(500).json({ error: 'Server configuration error' });
    }
    const provided = req.headers['x-api-key'];
    if (provided !== validKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    return next();
}

export function requireJWT(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Yêu cầu đăng nhập' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
    }
}

export function requirePlan(...plans) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
        if (!plans.includes(req.user.plan)) {
            return res.status(403).json({
                error: `Tính năng này yêu cầu gói ${plans.join(' hoặc ')}`,
                requiredPlan: plans[0],
            });
        }
        return next();
    };
}
