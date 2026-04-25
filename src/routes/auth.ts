import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { config } from '../config';
import { sendSmsCode } from '../utils/ali';
import { success, fail } from '../utils/response';

const router = Router();

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/send-code
router.post('/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return fail(res, 'Invalid phone number');
  }

  const code = generateCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  const stmt = db.prepare('INSERT INTO auth_codes (phone, code, expires_at) VALUES (?, ?, ?)');
  stmt.run(phone, code, expiresAt);

  try {
    await sendSmsCode(phone, code);
    success(res, { expiresIn: 300 });
  } catch (err: any) {
    console.error('Send SMS error:', err);
    fail(res, 'Failed to send SMS: ' + err.message, 500);
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    return fail(res, 'Phone and code are required');
  }

  const row = db
    .prepare(
      `SELECT * FROM auth_codes WHERE phone = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1`
    )
    .get(phone, code, Date.now()) as any;

  if (!row) {
    return fail(res, 'Invalid or expired code', 400);
  }

  db.prepare('UPDATE auth_codes SET used = 1 WHERE id = ?').run(row.id);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as any;
  if (!user) {
    const result = db.prepare('INSERT INTO users (phone) VALUES (?)').run(phone);
    user = { id: result.lastInsertRowid, phone };
  }

  const token = jwt.sign({ userId: user.id, phone: user.phone }, config.jwtSecret, {
    expiresIn: '30d',
  });

  success(res, { token, user: { id: user.id, phone: user.phone } });
});

export default router;
