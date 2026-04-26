"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
const ali_1 = require("../utils/ali");
const redoWorker_1 = require("../utils/redoWorker");
const config_1 = require("../config");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/questions
router.get('/', (req, res) => {
    const userId = req.userId;
    const status = req.query.status;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
    const tagId = req.query.tag_id ? Number(req.query.tag_id) : undefined;
    const subjectId = req.query.subject_id ? Number(req.query.subject_id) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    let where = 'WHERE q.user_id = ?';
    const params = [userId];
    // 默认过滤已删除状态，但如果用户主动查询 deleted 则不过滤
    if (!status || !status.split(',').includes('deleted')) {
        where += " AND q.status != 'deleted'";
    }
    if (subjectId) {
        where += ' AND q.subject_id = ?';
        params.push(subjectId);
    }
    if (status) {
        const statuses = status.split(',');
        where += ` AND q.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
    }
    if (categoryId) {
        where += ' AND q.category_id = ?';
        params.push(categoryId);
    }
    if (tagId) {
        where += ' AND EXISTS (SELECT 1 FROM question_tags qt WHERE qt.question_id = q.id AND qt.tag_id = ?)';
        params.push(tagId);
    }
    const totalRow = db_1.db.prepare(`SELECT COUNT(*) as c FROM questions q ${where}`).get(...params);
    const total = totalRow.c;
    const rows = db_1.db
        .prepare(`SELECT q.*,
        c.name as category_name,
        (SELECT json_group_array(json_object('id', qi.id, 'image_url', qi.image_url, 'image_type', qi.image_type, 'ocr_text', qi.ocr_text, 'sort_order', qi.sort_order))
         FROM question_images qi WHERE qi.question_id = q.id) as images,
        (SELECT json_group_array(json_object('id', t.id, 'name', t.name))
         FROM question_tags qt JOIN tags t ON qt.tag_id = t.id WHERE qt.question_id = q.id) as tags,
        (SELECT json_group_array(json_object('id', rs.id, 'question', json(rs.ai_generated_json)))
         FROM redo_sessions rs WHERE rs.question_id = q.id AND rs.user_answer IS NULL ORDER BY rs.created_at DESC) as pending_redos
      FROM questions q
      LEFT JOIN categories c ON q.category_id = c.id
      ${where}
      ORDER BY q.created_at DESC
      LIMIT ? OFFSET ?`)
        .all(...params, pageSize, offset);
    rows.forEach((r) => {
        try {
            r.images = JSON.parse(r.images || '[]');
        }
        catch {
            r.images = [];
        }
        try {
            r.tags = JSON.parse(r.tags || '[]');
        }
        catch {
            r.tags = [];
        }
        try {
            r.pending_redos = JSON.parse(r.pending_redos || '[]');
        }
        catch {
            r.pending_redos = [];
        }
    });
    (0, response_1.success)(res, { list: rows, total, page, pageSize });
});
// POST /api/questions
router.post('/', (req, res) => {
    const { category_id, subject_id } = req.body;
    if (!category_id) {
        return (0, response_1.fail)(res, 'category_id is required');
    }
    const subjectId = subject_id ? Number(subject_id) : 0;
    const result = db_1.db
        .prepare('INSERT INTO questions (user_id, category_id, subject_id, status) VALUES (?, ?, ?, ?)')
        .run(req.userId, category_id, subjectId, 'photo');
    (0, response_1.success)(res, { id: result.lastInsertRowid });
});
// GET /api/questions/:id
router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db_1.db
        .prepare(`SELECT q.*, c.name as category_name
       FROM questions q LEFT JOIN categories c ON q.category_id = c.id
       WHERE q.id = ? AND q.user_id = ?`)
        .get(id, req.userId);
    if (!row)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const images = db_1.db.prepare('SELECT * FROM question_images WHERE question_id = ? ORDER BY sort_order, id').all(id);
    const tags = db_1.db
        .prepare('SELECT t.* FROM question_tags qt JOIN tags t ON qt.tag_id = t.id WHERE qt.question_id = ?')
        .all(id);
    const reviews = db_1.db.prepare('SELECT * FROM review_logs WHERE question_id = ? ORDER BY created_at DESC').all(id);
    const redo = db_1.db.prepare('SELECT * FROM redo_sessions WHERE question_id = ? ORDER BY created_at DESC LIMIT 1').get(id);
    (0, response_1.success)(res, { ...row, images, tags, reviews, redo });
});
// PUT /api/questions/:id
router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const { status, category_id, reason_text } = req.body;
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const fields = [];
    const values = [];
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
        return (0, response_1.fail)(res, 'No fields to update');
    }
    db_1.db.prepare(`UPDATE questions SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    (0, response_1.success)(res, null);
});
// POST /api/questions/:id/images
router.post('/:id/images', (req, res) => {
    const questionId = Number(req.params.id);
    const { image_url, image_type, sort_order = 0 } = req.body;
    console.log('[IMG] START addImage', { questionId, image_url, image_type, sort_order, userId: req.userId });
    if (!image_url || !image_type) {
        console.log('[IMG] FAIL missing params');
        return (0, response_1.fail)(res, 'image_url and image_type are required');
    }
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q) {
        console.log('[IMG] FAIL question not found', { questionId, userId: req.userId });
        return (0, response_1.fail)(res, 'Question not found', 404);
    }
    const result = db_1.db
        .prepare('INSERT INTO question_images (question_id, image_url, image_type, sort_order) VALUES (?, ?, ?, ?)')
        .run(questionId, image_url, image_type, sort_order);
    console.log('[IMG] SUCCESS', { id: result.lastInsertRowid });
    (0, response_1.success)(res, { id: result.lastInsertRowid });
});
// POST /api/questions/:id/recommend
router.post('/:id/recommend', async (req, res) => {
    const questionId = Number(req.params.id);
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const images = db_1.db
        .prepare("SELECT ocr_text FROM question_images WHERE question_id = ? AND image_type = 'original_question' ORDER BY sort_order")
        .all(questionId);
    const ocrText = images.map((i) => i.ocr_text).filter(Boolean).join('\n');
    const cats = db_1.db.prepare('SELECT id, name, level FROM categories WHERE user_id = ?').all(req.userId);
    const catList = cats.map((c) => `${c.id}:${c.name}(L${c.level})`).join(', ');
    const tags = db_1.db.prepare('SELECT id, name FROM tags WHERE subject_id = ?').all(q.subject_id);
    const tagList = tags.map((t) => `${t.id}:${t.name}`).join(', ');
    const systemPrompt = '你是学习助手。根据错题OCR文本，从用户已有的章节和标签中，推荐最匹配的章节ID和标签ID。输出严格JSON：{"category_id": 数字, "tag_ids": [数字1, 数字2, 数字3]}。若无法确定，category_id传0，tag_ids传空数组。';
    const userPrompt = `OCR文本：${ocrText.slice(0, 800)}\n可选章节：${catList.slice(0, 1000)}\n可选标签：${tagList.slice(0, 1000)}`;
    try {
        const aiText = await (0, ali_1.callChat)(systemPrompt, userPrompt);
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
        (0, response_1.success)(res, { category_id: parsed.category_id || 0, tag_ids: parsed.tag_ids || [] });
    }
    catch (err) {
        console.error('Recommend error:', err);
        (0, response_1.success)(res, { category_id: 0, tag_ids: [] });
    }
});
// POST /api/questions/:id/ocr
router.post('/:id/ocr', async (req, res) => {
    const questionId = Number(req.params.id);
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const images = db_1.db
        .prepare('SELECT * FROM question_images WHERE question_id = ? ORDER BY sort_order, id')
        .all(questionId);
    for (const img of images) {
        if (!img.ocr_text) {
            try {
                const text = await (0, ali_1.callOcr)(img.image_url);
                db_1.db.prepare('UPDATE question_images SET ocr_text = ? WHERE id = ?').run(text, img.id);
            }
            catch (err) {
                console.error('OCR error for image', img.id, err);
            }
        }
    }
    (0, response_1.success)(res, null);
});
// POST /api/questions/:id/summary
router.post('/:id/summary', (req, res) => {
    const questionId = Number(req.params.id);
    const { reason_text, category_id, tag_ids } = req.body;
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    if (!reason_text || !tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
        return (0, response_1.fail)(res, 'reason_text and at least one tag are required');
    }
    db_1.db.prepare('UPDATE questions SET status = ?, reason_text = ?, category_id = ? WHERE id = ?')
        .run('summary', reason_text, category_id || q.category_id, questionId);
    db_1.db.prepare('DELETE FROM question_tags WHERE question_id = ?').run(questionId);
    const insertTag = db_1.db.prepare('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)');
    for (const tagId of tag_ids) {
        insertTag.run(questionId, tagId);
    }
    (0, response_1.success)(res, null);
});
// POST /api/questions/:id/review
router.post('/:id/review', (req, res) => {
    const questionId = Number(req.params.id);
    const { action } = req.body;
    if (!action || !['understood', 'not_understood'].includes(action)) {
        return (0, response_1.fail)(res, 'action must be understood or not_understood');
    }
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    db_1.db.prepare('INSERT INTO review_logs (question_id, action) VALUES (?, ?)').run(questionId, action);
    db_1.db.prepare('UPDATE questions SET status = ?, review_count = review_count + 1, last_review_at = ? WHERE id = ?')
        .run('review', Date.now(), questionId);
    (0, response_1.success)(res, null);
});
// POST /api/questions/:id/redo
router.post('/:id/redo', async (req, res) => {
    const questionId = Number(req.params.id);
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    // 24h 缓存检查
    const recent = db_1.db
        .prepare('SELECT * FROM redo_sessions WHERE question_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
        .get(questionId, Date.now() - 24 * 60 * 60 * 1000);
    if (recent) {
        return (0, response_1.success)(res, { sessionId: recent.id, question: JSON.parse(recent.ai_generated_json) });
    }
    const images = db_1.db
        .prepare("SELECT ocr_text FROM question_images WHERE question_id = ? AND image_type = 'original_question' ORDER BY sort_order")
        .all(questionId);
    const ocrText = images.map((i) => i.ocr_text).filter(Boolean).join('\n');
    const cat = db_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(q.category_id);
    let path = cat?.name || '';
    if (cat && cat.parent_id !== 0) {
        let curr = cat;
        const names = [curr.name];
        while (curr.parent_id !== 0) {
            curr = db_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(curr.parent_id);
            if (curr)
                names.unshift(curr.name);
        }
        path = names.join(' / ');
    }
    const systemPrompt = '你是一位资深学科老师。根据以下错题文本、错题原因、所属科目与章节，生成1道相似考点的单选题。请使用中文生成题目和解析，除非原始题目明显是英语/外语类考试题。输出严格JSON：{"question":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"B","explanation":"解析文字"}';
    const userPrompt = `科目与章节：${path}\n错题文本：${ocrText || '无 OCR 文本'}\n错题原因：${q.reason_text || '未填写'}`;
    try {
        const aiText = await (0, ali_1.callChat)(systemPrompt, userPrompt);
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
        const result = db_1.db
            .prepare('INSERT INTO redo_sessions (question_id, ai_generated_json) VALUES (?, ?)')
            .run(questionId, JSON.stringify(parsed));
        db_1.db.prepare('UPDATE questions SET status = ? WHERE id = ?').run('redo', questionId);
        const remaining = db_1.db.prepare('SELECT COUNT(*) as c FROM redo_sessions WHERE question_id = ? AND user_answer IS NULL').get(questionId);
        if (remaining.c < 3) {
            (0, redoWorker_1.queueRedoGeneration)(questionId);
        }
        (0, response_1.success)(res, { sessionId: result.lastInsertRowid, question: parsed });
    }
    catch (err) {
        console.error('Redo generation error:', err);
        (0, response_1.fail)(res, 'Failed to generate redo question: ' + err.message, 500);
    }
});
// POST /api/questions/:id/redo/submit
router.post('/:id/redo/submit', (req, res) => {
    const questionId = Number(req.params.id);
    const { session_id, answer } = req.body;
    if (!session_id || !answer) {
        return (0, response_1.fail)(res, 'session_id and answer are required');
    }
    const session = db_1.db
        .prepare('SELECT * FROM redo_sessions WHERE id = ? AND question_id = ?')
        .get(session_id, questionId);
    if (!session)
        return (0, response_1.fail)(res, 'Session not found', 404);
    const parsed = JSON.parse(session.ai_generated_json);
    const isCorrect = parsed.answer?.toString().trim().toUpperCase() === answer.toString().trim().toUpperCase();
    db_1.db.prepare('UPDATE redo_sessions SET user_answer = ?, is_correct = ? WHERE id = ?').run(answer, isCorrect ? 1 : 0, session_id);
    const remaining = db_1.db.prepare('SELECT COUNT(*) as c FROM redo_sessions WHERE question_id = ? AND user_answer IS NULL').get(questionId);
    if (remaining.c < 3) {
        (0, redoWorker_1.queueRedoGeneration)(questionId);
    }
    (0, response_1.success)(res, { isCorrect, correctAnswer: parsed.answer, explanation: parsed.explanation });
});
// GET /api/questions/:id/redo/pending
router.get('/:id/redo/pending', (req, res) => {
    const questionId = Number(req.params.id);
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const sessions = db_1.db
        .prepare('SELECT id, ai_generated_json, created_at FROM redo_sessions WHERE question_id = ? AND user_answer IS NULL ORDER BY created_at DESC')
        .all(questionId);
    const list = sessions.map((s) => ({
        id: s.id,
        question: JSON.parse(s.ai_generated_json),
        createdAt: s.created_at,
    }));
    (0, response_1.success)(res, list);
});
// GET /api/questions/:id/redo/session/:sessionId
router.get('/:id/redo/session/:sessionId', (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const questionId = Number(req.params.id);
    const session = db_1.db.prepare('SELECT * FROM redo_sessions WHERE id = ? AND question_id = ?').get(sessionId, questionId);
    if (!session)
        return (0, response_1.fail)(res, 'Session not found', 404);
    (0, response_1.success)(res, { sessionId: session.id, question: JSON.parse(session.ai_generated_json) });
});
// DELETE /api/questions/:id — 软删除
router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    db_1.db.prepare("UPDATE questions SET status = 'deleted', deleted_at = ? WHERE id = ?").run(Date.now(), id);
    (0, response_1.success)(res, null);
});
// POST /api/questions/:id/restore — 恢复
router.post('/:id/restore', (req, res) => {
    const id = Number(req.params.id);
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const prevStatus = db_1.db.prepare('SELECT action FROM review_logs WHERE question_id = ? ORDER BY created_at DESC LIMIT 1').get(id);
    const newStatus = prevStatus ? 'review' : q.reason_text ? 'summary' : 'photo';
    db_1.db.prepare("UPDATE questions SET status = ?, deleted_at = NULL WHERE id = ?").run(newStatus, id);
    (0, response_1.success)(res, null);
});
// DELETE /api/questions/:id/permanent — 永久删除（清理 OSS）
router.delete('/:id/permanent', async (req, res) => {
    const id = Number(req.params.id);
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const images = db_1.db.prepare('SELECT image_url FROM question_images WHERE question_id = ?').all(id);
    // 尝试清理 OSS（异步，失败不影响数据库删除）
    if (images.length > 0) {
        try {
            const OSS = await Promise.resolve().then(() => __importStar(require('ali-oss')));
            const client = new OSS.default({
                region: config_1.config.aliOss.region,
                accessKeyId: config_1.config.aliOss.accessKeyId,
                accessKeySecret: config_1.config.aliOss.accessKeySecret,
                bucket: config_1.config.aliOss.bucket,
                endpoint: config_1.config.aliOss.endpoint,
            });
            for (const img of images) {
                try {
                    const url = new URL(img.image_url);
                    const key = url.pathname.slice(1);
                    await client.delete(key);
                }
                catch (e) {
                    console.error('OSS delete error:', e);
                }
            }
        }
        catch (e) {
            console.error('OSS client error:', e);
        }
    }
    db_1.db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    (0, response_1.success)(res, null);
});
// POST /api/questions/:id/images/upload — 后端直传 OSS
router.post('/:id/images/upload', upload.single('image'), async (req, res) => {
    const questionId = Number(req.params.id);
    const imageType = req.body.image_type;
    const file = req.file;
    console.log('[IMG] START upload', { questionId, imageType, file: !!file, fileSize: file?.size, ct: req.headers['content-type'], bodyKeys: Object.keys(req.body).join(','), userId: req.userId });
    if (!file) {
        console.log('[IMG] NO FILE — body:', JSON.stringify(req.body).slice(0, 200));
        return (0, response_1.fail)(res, 'Missing image file', 400);
    }
    if (!imageType || !['original_question', 'wrong_solution', 'reference_answer'].includes(imageType)) {
        return (0, response_1.fail)(res, 'Invalid image_type', 400);
    }
    const q = db_1.db.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').get(questionId, req.userId);
    if (!q)
        return (0, response_1.fail)(res, 'Question not found', 404);
    const key = `questions/user-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    try {
        const imageUrl = await (0, ali_1.uploadBufferToOss)(key, file.buffer);
        console.log('[IMG] OSS success', imageUrl);
        const maxSort = db_1.db.prepare('SELECT MAX(sort_order) as m FROM question_images WHERE question_id = ?').get(questionId);
        const sortOrder = (maxSort?.m || 0) + 1;
        const result = db_1.db
            .prepare('INSERT INTO question_images (question_id, image_url, image_type, sort_order) VALUES (?, ?, ?, ?)')
            .run(questionId, imageUrl, imageType, sortOrder);
        console.log('[IMG] DB record inserted', result.lastInsertRowid);
        // 异步触发 OCR，不阻塞响应
        (0, ali_1.callOcr)(imageUrl)
            .then((text) => {
            db_1.db.prepare('UPDATE question_images SET ocr_text = ? WHERE id = ?').run(text, result.lastInsertRowid);
            console.log('[IMG] OCR done', result.lastInsertRowid);
        })
            .catch((err) => console.error('[IMG] OCR error:', err));
        (0, response_1.success)(res, { id: result.lastInsertRowid, image_url: imageUrl });
    }
    catch (err) {
        console.error('[IMG] UPLOAD ERROR:', err);
        (0, response_1.fail)(res, 'Upload failed: ' + err.message, 500);
    }
});
exports.default = router;
//# sourceMappingURL=questions.js.map