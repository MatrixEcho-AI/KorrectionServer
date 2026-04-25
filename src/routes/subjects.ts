import { Router } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { success, fail } from '../utils/response';

const router = Router();
router.use(authMiddleware);

// GET /api/subjects
router.get('/', (req: AuthRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY sort_order, id')
    .all(req.userId!) as any[];
  success(res, rows);
});

// POST /api/subjects
router.post('/', (req: AuthRequest, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return fail(res, 'Name is required');
  }

  const existing = db
    .prepare('SELECT id FROM subjects WHERE user_id = ? AND name = ?')
    .get(req.userId!, name.trim()) as any;
  if (existing) {
    return fail(res, 'Subject already exists');
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM subjects WHERE user_id = ?')
    .get(req.userId!) as any;

  const result = db
    .prepare('INSERT INTO subjects (user_id, name, sort_order) VALUES (?, ?, ?)')
    .run(req.userId!, name.trim(), (maxOrder?.m || 0) + 1);

  success(res, { id: result.lastInsertRowid });
});

// PUT /api/subjects/:id
router.put('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return fail(res, 'Name is required');
  }

  const sub = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!sub) {
    return fail(res, 'Subject not found', 404);
  }

  const existing = db
    .prepare('SELECT id FROM subjects WHERE user_id = ? AND name = ? AND id != ?')
    .get(req.userId!, name.trim(), id) as any;
  if (existing) {
    return fail(res, 'Subject already exists');
  }

  db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(name.trim(), id);
  success(res, null);
});

// DELETE /api/subjects/:id
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const sub = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!sub) {
    return fail(res, 'Subject not found', 404);
  }

  const cats = db.prepare('SELECT COUNT(*) as c FROM categories WHERE subject_id = ?').get(id) as any;
  if (cats.c > 0) {
    return fail(res, 'Cannot delete subject with categories');
  }

  const questions = db.prepare('SELECT COUNT(*) as c FROM questions WHERE subject_id = ?').get(id) as any;
  if (questions.c > 0) {
    return fail(res, 'Cannot delete subject with questions');
  }

  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  success(res, null);
});

export default router;
