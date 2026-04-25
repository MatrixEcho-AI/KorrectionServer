import { Router } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { success, fail } from '../utils/response';

const router = Router();
router.use(authMiddleware);

// GET /api/tags?subject_id=xx
router.get('/', (req: AuthRequest, res) => {
  const subjectId = Number(req.query.subject_id);
  if (!subjectId) {
    return fail(res, 'subject_id is required');
  }
  const rows = db
    .prepare('SELECT * FROM tags WHERE user_id = ? AND subject_id = ? ORDER BY id DESC')
    .all(req.userId!, subjectId);
  success(res, rows);
});

// POST /api/tags
router.post('/', (req: AuthRequest, res) => {
  const { subject_id, name } = req.body;
  if (!subject_id || !name || typeof name !== 'string' || name.trim().length === 0) {
    return fail(res, 'subject_id and name are required');
  }

  const existing = db
    .prepare('SELECT id FROM tags WHERE user_id = ? AND subject_id = ? AND name = ?')
    .get(req.userId!, subject_id, name.trim()) as any;
  if (existing) {
    return fail(res, 'Tag already exists');
  }

  const result = db
    .prepare('INSERT INTO tags (user_id, subject_id, name) VALUES (?, ?, ?)')
    .run(req.userId!, subject_id, name.trim());

  success(res, { id: result.lastInsertRowid });
});

export default router;
