import { Router } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { success, fail } from '../utils/response';

const router = Router();
router.use(authMiddleware);

router.post('/data', (req: AuthRequest, res) => {
  const { question_ids, options, sort } = req.body;
  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return fail(res, 'question_ids is required');
  }

  const userId = req.userId!;
  const placeholders = question_ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT q.*, c.name as category_name
       FROM questions q LEFT JOIN categories c ON q.category_id = c.id
       WHERE q.id IN (${placeholders}) AND q.user_id = ? AND q.status != 'deleted'`
    )
    .all(...question_ids, userId) as any[];

  if (rows.length === 0) {
    return fail(res, 'No questions found');
  }

  const sortField = sort?.field || 'created_at';
  const sortOrder = sort?.order || 'desc';
  const validFields = ['created_at', 'review_count', 'last_review_at'];
  if (validFields.includes(sortField)) {
    rows.sort((a, b) => {
      const av = a[sortField] || 0;
      const bv = b[sortField] || 0;
      return sortOrder === 'asc' ? av - bv : bv - av;
    });
  }

  for (const q of rows) {
    q.images = db.prepare('SELECT * FROM question_images WHERE question_id = ? ORDER BY sort_order').all(q.id);
    q.tags = db
      .prepare('SELECT t.name FROM question_tags qt JOIN tags t ON qt.tag_id = t.id WHERE qt.question_id = ?')
      .all(q.id)
      .map((t: any) => t.name);
    q.reviewCount = q.review_count;
    q.lastReviewAt = q.last_review_at ? new Date(q.last_review_at).toLocaleString('zh-CN') : '-';
  }

  success(res, { questions: rows, options, sort });
});

export default router;
