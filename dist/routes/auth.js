"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const config_1 = require("../config");
const ali_1 = require("../utils/ali");
const response_1 = require("../utils/response");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// POST /api/auth/send-code
router.post('/send-code', async (req, res) => {
    const { phone } = req.body;
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return (0, response_1.fail)(res, 'Invalid phone number');
    }
    const code = generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const stmt = db_1.db.prepare('INSERT INTO auth_codes (phone, code, expires_at) VALUES (?, ?, ?)');
    stmt.run(phone, code, expiresAt);
    try {
        await (0, ali_1.sendSmsCode)(phone, code);
        (0, response_1.success)(res, { expiresIn: 300 });
    }
    catch (err) {
        console.error('Send SMS error:', err);
        (0, response_1.fail)(res, 'Failed to send SMS: ' + err.message, 500);
    }
});
// POST /api/auth/login
router.post('/login', (req, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) {
        return (0, response_1.fail)(res, 'Phone and code are required');
    }
    const row = db_1.db
        .prepare(`SELECT * FROM auth_codes WHERE phone = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1`)
        .get(phone, code, Date.now());
    if (!row) {
        return (0, response_1.fail)(res, 'Invalid or expired code', 400);
    }
    db_1.db.prepare('UPDATE auth_codes SET used = 1 WHERE id = ?').run(row.id);
    let user = db_1.db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
        const result = db_1.db.prepare('INSERT INTO users (phone) VALUES (?)').run(phone);
        user = { id: result.lastInsertRowid, phone };
    }
    const token = jsonwebtoken_1.default.sign({ userId: user.id, phone: user.phone }, config_1.config.jwtSecret, {
        expiresIn: '30d',
    });
    (0, response_1.success)(res, { token, user: { id: user.id, phone: user.phone } });
});
// GET /api/auth/me
router.get('/me', auth_1.authMiddleware, (req, res) => {
    const user = db_1.db.prepare('SELECT id, phone FROM users WHERE id = ?').get(req.userId);
    if (!user) {
        return (0, response_1.fail)(res, 'User not found', 401);
    }
    (0, response_1.success)(res, user);
});
exports.default = router;
//# sourceMappingURL=auth.js.map