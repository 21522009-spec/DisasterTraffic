import rateLimit from 'express-rate-limit';

/**
 * Rate limit cho các endpoint POST có khả năng bị spam.
 * - communityReportLimiter: dùng cho cộng đồng báo cáo (POST /api/alerts/community)
 * - aiAlertLimiter: nới rộng hơn vì AI service được phép gửi nhiều
 * - readLimiter: limit nhẹ cho GET endpoints để chống abuse
 */

export const communityReportLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 10, // tối đa 10 report / phút / IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều report — vui lòng đợi và thử lại sau 1 phút.' },
});

export const aiAlertLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120, // 2 alert/giây trung bình
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI alert rate limit exceeded.' },
});

export const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * authLimiter — chống brute-force/spam cho login + register: 10 req/15 phút/IP.
 * Lockout theo email là layer thứ 2, nằm ở services/loginAttempts.js.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Quá nhiều request đăng nhập/đăng ký từ IP này. Thử lại sau 15 phút.',
    },
});
