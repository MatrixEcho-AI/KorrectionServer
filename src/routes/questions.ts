import { Router } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { success, fail } from '../utils/response';
import { callOcr, callChat } from '../utils/ali';
import { config } from '../config';

const router = Router();
router.use(authMiddleware);

// GET /api/questions
router.get('/', (req: AuthRequest, res) => {
  const userId = req.userId!;
  const status = req.query.status as string | undefined;
  const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
  const tagId = req.query.tag_id ? Number(req.query.tag_id) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  let where = 'WHERE q.user_id = ? AND q.status != \'deleted\'';
  const params: any[] = [userId];

  if (status) {
    where += ' AND q.status = ?';
    params.push(status);
  }
  if (categoryId) {
    where += ' AND q.category_id = ?';
    params.push(categoryId);
  }
  if (tagId) {
    where += ' AND EXISTS (SELECT 1 FROM question_tags qt WHERE qt.question_id = q.id AND qt.tag_id = ?)';
    params.push(tagId);
  }

  const totalRow = db.prepare(`SELECT COUNT(*) as c FROM questions q ${where}`).get(...params) as any;
  const total = totalRow.c;

  const rows = db
    .prepare(
      `SELECT q.*,
        c.name as category_name,
        (SELECT json_group_array(json_object('id', qi.id, 'image_url', qi.image_url, 'image_type', qi.image_type, 'ocr_text', qi.ocr_text, 'sort_order', qi.sort_order))
         FROM question_images qi WHERE qi.question_id = q.id) as images,
        (SELECT json_group_array(json_object('id', t.id, 'name', t.name))
         FROM question_tags qt JOIN tags t ON qt.tag_id = t.id WHERE qt.question_id = q.id) as tags
      FROM questions q
      LEFT JOIN categories c ON q.category_id = c.id
      ${where}
      ORDER BY q.created_at DESC
      LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as any[];

  rows.forEach((r) => {
    try { r.images = JSON.parse(r.images || '[]'); } catch { r.images = []; }
    try { r.tags = JSON.parse(r.tags || '[]'); } catch { r.tags = []; }
  });

  success(res, { list: rows, total, page, pageSize });
});

// POST /api/questions
router.post('/', (req: AuthRequest, res) => {
  const { category_id } = req.body;
  if (!category_id) {
    return fail(res, 'category_id is required');
  }
  const result = db
    .prepare('INSERT INTO questions (user_id, category_id, status) VALUES (?, ?, ?)')
    .run(req.userId!, category_id, 'photo');
  success(res, { id: result.lastInsertRowid });
});

// GET /api/questions/:id
router.get('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      `SELECT q.*, c.name as category_name
       FROM questions q LEFT JOIN categories c ON q.category_id = c.id
       WHERE q.id = ? AND q.user_id = ?`
    )
    .get(id, req.userId!) as any;
  if (!row) return fail(res, 'Question not found', 404);

  const images = db.prepare('SELECT * FROM question_images WHERE question_id = ? ORDER BY sort_order, id').all(id);
  const tags = db
    .prepare('SELECT t.* FROM question_tags qt JOIN tags t ON qt.tag_id = t.id WHERE qt.question_id = ?')
    .all(id);
  const reviews = db.prepare('SELECT * FROM review_logs WHERE question_id = ? ORDER BY created_at DESC').all(id);
  const redo = db.prepare('SELECT * FROM redo_sessions WHERE question_id = ? ORDER BY created_at DESC LIMIT 1').get(id);

  success(res, { ...row, images, tags, reviews, redo });
});

// PUT /api/questions/:id
router.put('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { status, category_id, reason_text } = req.body;

  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  const fields: string[] = [];
  const values: any[] = [];

  if (status) {
    fields.push('status = ?');
    values.push(status);
  }
  if (category_id !== undefined) {
    fields.push('category_id = ?');
    values.push(category_id);
  }
  if (reason_text !== undefined) {
    fields.push('reason_text = ?');
    values.push(reason_text);
  }

  if (fields.length === 0) {
    return fail(res, 'No fields to update');
  }

  db.prepare(`UPDATE questions SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  success(res, null);
});

// POST /api/questions/:id/images
router.post('/:id/images', (req: AuthRequest, res) => {
  const questionId = Number(req.params.id);
  const { image_url, image_type, sort_order = 0 } = req.body;
  if (!image_url || !image_type) {
    return fail(res, 'image_url and image_type are required');
  }
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  const result = db
    .prepare('INSERT INTO question_images (question_id, image_url, image_type, sort_order) VALUES (?, ?, ?, ?)')
    .run(questionId, image_url, image_type, sort_order);
  success(res, { id: result.lastInsertRowid });
});

// POST /api/questions/:id/recommend
router.post('/:id/recommend', async (req: AuthRequest, res) => {
  const questionId = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  const images = db
    .prepare("SELECT ocr_text FROM question_images WHERE question_id = ? AND image_type = 'original_question' ORDER BY sort_order")
    .all(questionId) as any[];
  const ocrText = images.map((i) => i.ocr_text).filter(Boolean).join('\n');

  const cats = db.prepare('SELECT id, name, level FROM categories WHERE user_id = ?').all(req.userId!) as any[];
  const catList = cats.map((c) => `${c.id}:${c.name}(L${c.level})`).join(', ');

  const tags = db.prepare('SELECT t.id, t.name FROM tags t JOIN categories c ON t.subject_id = c.id WHERE c.id = ? OR c.parent_id = ?').all(q.category_id, q.category_id) as any[];
  const tagList = tags.map((t) => `${t.id}:${t.name}`).join(', ');

  const systemPrompt =
    '你是学习助手。根据错题OCR文本，从用户已有的章节和标签中，推荐最匹配的章节ID和标签ID。输出严格JSON：{"category_id": 数字, "tag_ids": [数字1, 数字2, 数字3]}。若无法确定，category_id传0，tag_ids传空数组。';
  const userPrompt = `OCR文本：${ocrText.slice(0, 800)}\n可选章节：${catList.slice(0, 1000)}\n可选标签：${tagList.slice(0, 1000)}`;

  try {
    const aiText = await callChat(systemPrompt, userPrompt);
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
    success(res, { category_id: parsed.category_id || 0, tag_ids: parsed.tag_ids || [] });
  } catch (err: any) {
    console.error('Recommend error:', err);
    success(res, { category_id: 0, tag_ids: [] });
  }
});

// POST /api/questions/:id/ocr
router.post('/:id/ocr', async (req: AuthRequest, res) => {
  const questionId = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  const images = db
    .prepare('SELECT * FROM question_images WHERE question_id = ? ORDER BY sort_order, id')
    .all(questionId) as any[];

  for (const img of images) {
    if (!img.ocr_text) {
      try {
        const text = await callOcr(img.image_url);
        db.prepare('UPDATE question_images SET ocr_text = ? WHERE id = ?').run(text, img.id);
      } catch (err) {
        console.error('OCR error for image', img.id, err);
      }
    }
  }

  success(res, null);
});

// POST /api/questions/:id/summary
router.post('/:id/summary', (req: AuthRequest, res) => {
  const questionId = Number(req.params.id);
  const { reason_text, category_id, tag_ids } = req.body;

  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  if (!reason_text || !tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
    return fail(res, 'reason_text and at least one tag are required');
  }

  db.prepare('UPDATE questions SET status = ?, reason_text = ?, category_id = ? WHERE id = ?')
    .run('summary', reason_text, category_id || q.category_id, questionId);

  db.prepare('DELETE FROM question_tags WHERE question_id = ?').run(questionId);
  const insertTag = db.prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)');
  for (const tagId of tag_ids) {
    insertTag.run(questionId, tagId);
  }

  success(res, null);
});

// POST /api/questions/:id/review
router.post('/:id/review', (req: AuthRequest, res) => {
  const questionId = Number(req.params.id);
  const { action } = req.body;
  if (!action || !['understood', 'not_understood'].includes(action)) {
    return fail(res, 'action must be understood or not_understood');
  }

  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  db.prepare('INSERT INTO review_logs (question_id, action) VALUES (?, ?)').run(questionId, action);
  db.prepare('UPDATE questions SET status = ?, review_count = review_count + 1, last_review_at = ? WHERE id = ?')
    .run('review', Date.now(), questionId);

  success(res, null);
});

// POST /api/questions/:id/redo
router.post('/:id/redo', async (req: AuthRequest, res) => {
  const questionId = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  // 24h 缓存检查
  const recent = db
    .prepare('SELECT * FROM redo_sessions WHERE question_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
    .get(questionId, Date.now() - 24 * 60 * 60 * 1000) as any;
  if (recent) {
    return success(res, { sessionId: recent.id, question: JSON.parse(recent.ai_generated_json) });
  }

  const images = db
    .prepare("SELECT ocr_text FROM question_images WHERE question_id = ? AND image_type = 'original_question' ORDER BY sort_order")
    .all(questionId) as any[];
  const ocrText = images.map((i) => i.ocr_text).filter(Boolean).join('\n');

  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(q.category_id) as any;
  let path = cat?.name || '';
  if (cat && cat.parent_id !== 0) {
    let curr = cat;
    const names = [curr.name];
    while (curr.parent_id !== 0) {
      curr = db.prepare('SELECT * FROM categories WHERE id = ?').get(curr.parent_id) as any;
      if (curr) names.unshift(curr.name);
    }
    path = names.join(' / ');
  }

  const systemPrompt =
    '你是一位资深学科老师。根据以下错题文本、错题原因、所属科目与章节，生成1道相似考点的单选题。输出严格JSON：{"question":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"B","explanation":"解析文字"}';
  const userPrompt = `科目与章节：${path}\n错题文本：${ocrText || '无 OCR 文本'}\n错题原因：${q.reason_text || '未填写'}`;

  try {
    const aiText = await callChat(systemPrompt, userPrompt);
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);

    const result = db
      .prepare('INSERT INTO redo_sessions (question_id, ai_generated_json) VALUES (?, ?)')
      .run(questionId, JSON.stringify(parsed));

    db.prepare('UPDATE questions SET status = ? WHERE id = ?').run('redo', questionId);
    success(res, { sessionId: result.lastInsertRowid, question: parsed });
  } catch (err: any) {
    console.error('Redo generation error:', err);
    fail(res, 'Failed to generate redo question: ' + err.message, 500);
  }
});

// POST /api/questions/:id/redo/submit
router.post('/:id/redo/submit', (req: AuthRequest, res) => {
  const questionId = Number(req.params.id);
  const { session_id, answer } = req.body;
  if (!session_id || !answer) {
    return fail(res, 'session_id and answer are required');
  }

  const session = db
    .prepare('SELECT * FROM redo_sessions WHERE id = ? AND question_id = ?')
    .get(session_id, questionId) as any;
  if (!session) return fail(res, 'Session not found', 404);

  const parsed = JSON.parse(session.ai_generated_json);
  const isCorrect = parsed.answer?.toString().trim().toUpperCase() === answer.toString().trim().toUpperCase();

  db.prepare('UPDATE redo_sessions SET user_answer = ?, is_correct = ? WHERE id = ?').run(answer, isCorrect ? 1 : 0, session_id);

  success(res, { isCorrect, correctAnswer: parsed.answer, explanation: parsed.explanation });
});

// DELETE /api/questions/:id — 软删除
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);
  db.prepare("UPDATE questions SET status = 'deleted', deleted_at = ? WHERE id = ?").run(Date.now(), id);
  success(res, null);
});

// POST /api/questions/:id/restore — 恢复
router.post('/:id/restore', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);
  const prevStatus = db.prepare('SELECT action FROM review_logs WHERE question_id = ? ORDER BY created_at DESC LIMIT 1').get(id) as any;
  const newStatus = prevStatus ? 'review' : q.reason_text ? 'summary' : 'photo';
  db.prepare("UPDATE questions SET status = ?, deleted_at = NULL WHERE id = ?").run(newStatus, id);
  success(res, null);
});

// DELETE /api/questions/:id/permanent — 永久删除（清理 OSS）
router.delete('/:id/permanent', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!q) return fail(res, 'Question not found', 404);

  const images = db.prepare('SELECT image_url FROM question_images WHERE question_id = ?').all(id) as any[];

  // 尝试清理 OSS（异步，失败不影响数据库删除）
  if (images.length > 0) {
    try {
      const OSS = await import('ali-oss');
      const client = new OSS.default({
        region: config.aliOss.region,
        accessKeyId: config.aliOss.accessKeyId,
        accessKeySecret: config.aliOss.accessKeySecret,
        bucket: config.aliOss.bucket,
        endpoint: config.aliOss.endpoint,
      });
      for (const img of images) {
        try {
          const url = new URL(img.image_url);
          const key = url.pathname.slice(1);
          await client.delete(key);
        } catch (e) {
          console.error('OSS delete error:', e);
        }
      }
    } catch (e) {
      console.error('OSS client error:', e);
    }
  }

  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  success(res, null);
});

export default router;
