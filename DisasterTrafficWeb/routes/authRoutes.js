import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireJWT } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
    checkLockout,
    recordFail,
    recordSuccess,
} from '../services/loginAttempts.js';

const router = express.Router();

// Email regex (RFC 5322 simplified)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(email) {
    if (typeof email !== 'string' || !email.trim()) return 'Email không được để trống';
    if (email.length > 254) return 'Email quá dài';
    if (!EMAIL_RE.test(email.trim())) return 'Email không hợp lệ';
    return null;
}

function validatePassword(pw) {
    if (typeof pw !== 'string') return 'Mật khẩu không hợp lệ';
    if (pw.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
    if (pw.length > 128) return 'Mật khẩu quá dài';
    if (!/[A-Za-z]/.test(pw)) return 'Mật khẩu phải có ít nhất 1 chữ cái';
    if (!/\d/.test(pw)) return 'Mật khẩu phải có ít nhất 1 chữ số';
    return null;
}

function signToken(user) {
    return jwt.sign(
        { _id: user._id, email: user.email, name: user.name, plan: user.plan },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function safeUser(user) {
    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        planExpiresAt: user.planExpiresAt,
    };
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        if (!name?.trim()) {
            return res.status(400).json({ error: 'Thiếu tên' });
        }
        if (name.length > 100) {
            return res.status(400).json({ error: 'Tên quá dài (≤ 100 ký tự)' });
        }
        const emailErr = validateEmail(email);
        if (emailErr) return res.status(400).json({ error: emailErr });
        const pwErr = validatePassword(password);
        if (pwErr) return res.status(400).json({ error: pwErr });

        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) return res.status(409).json({ error: 'Email này đã được đăng ký' });

        const user = new User({ name: name.trim(), email, password });
        await user.save();

        res.status(201).json({ token: signToken(user), user: safeUser(user) });
    } catch (err) {
        // KHÔNG log full err.message vì có thể chứa input nhạy cảm
        console.error('[auth] register failed:', err.name);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const emailErr = validateEmail(email);
        if (emailErr) return res.status(400).json({ error: emailErr });
        if (typeof password !== 'string' || !password) {
            return res.status(400).json({ error: 'Thiếu mật khẩu' });
        }

        // Lockout theo email — chống brute-force
        const lock = checkLockout(email);
        if (lock.locked) {
            const minutes = Math.ceil(lock.remainingMs / 60000);
            return res.status(429).json({
                error: `Tài khoản đã tạm khoá do nhiều lần đăng nhập sai. Thử lại sau ${minutes} phút.`,
            });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user || !(await user.comparePassword(password))) {
            const fails = recordFail(email);
            // Không tiết lộ email tồn tại hay không (cùng response code/text)
            return res.status(401).json({
                error: 'Email hoặc mật khẩu không đúng',
                attemptsRemaining: Math.max(
                    0,
                    (Number(process.env.LOGIN_MAX_ATTEMPTS) || 5) - fails
                ),
            });
        }

        recordSuccess(email);
        res.json({ token: signToken(user), user: safeUser(user) });
    } catch (err) {
        console.error('[auth] login failed:', err.name);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
});

// GET /api/auth/me
router.get('/me', requireJWT, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
        res.json(safeUser(user));
    } catch (err) {
        console.error('[auth] me failed:', err.name);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
});

// POST /api/auth/upgrade — chưa tích hợp thanh toán
router.patch('/password', authLimiter, requireJWT, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};

        if (typeof currentPassword !== 'string' || !currentPassword) {
            return res.status(400).json({ error: 'Thiếu mật khẩu hiện tại' });
        }
        const pwErr = validatePassword(newPassword);
        if (pwErr) return res.status(400).json({ error: pwErr });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

        const ok = await user.comparePassword(currentPassword);
        if (!ok) {
            return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
        }

        user.password = newPassword; // pre('save') hook sẽ tự hash
        await user.save();

        // Cấp lại token mới để UX mượt — không cần đăng nhập lại
        res.json({ message: 'Đã đổi mật khẩu thành công', token: signToken(user), user: safeUser(user) });
    } catch (err) {
        console.error('[auth] change password failed:', err.name);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
});

router.post('/upgrade', requireJWT, (req, res) => {
    res.status(501).json({
        error: 'Nâng cấp gói chưa được hỗ trợ. Vui lòng liên hệ quản trị viên.',
    });
});

export default router;
