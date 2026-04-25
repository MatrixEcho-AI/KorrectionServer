"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/subjects
router.get('/', (req, res) => {
    const rows = db_1.db
        .prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY sort_order, id')
        .all(req.userId);
    (0, response_1.success)(res, rows);
});
// POST /api/subjects
router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return (0, response_1.fail)(res, 'Name is required');
    }
    const existing = db_1.db
        .prepare('SELECT id FROM subjects WHERE user_id = ? AND name = ?')
        .get(req.userId, name.trim());
    if (existing) {
        return (0, response_1.fail)(res, 'Subject already exists');
    }
    const maxOrder = db_1.db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM subjects WHERE user_id = ?')
        .get(req.userId);
    const result = db_1.db
        .prepare('INSERT INTO subjects (user_id, name, sort_order) VALUES (?, ?, ?)')
        .run(req.userId, name.trim(), (maxOrder?.m || 0) + 1);
    (0, response_1.success)(res, { id: result.lastInsertRowid });
});
// PUT /api/subjects/:id
router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return (0, response_1.fail)(res, 'Name is required');
    }
    const sub = db_1.db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!sub) {
        return (0, response_1.fail)(res, 'Subject not found', 404);
    }
    const existing = db_1.db
        .prepare('SELECT id FROM subjects WHERE user_id = ? AND name = ? AND id != ?')
        .get(req.userId, name.trim(), id);
    if (existing) {
        return (0, response_1.fail)(res, 'Subject already exists');
    }
    db_1.db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(name.trim(), id);
    (0, response_1.success)(res, null);
});
// DELETE /api/subjects/:id
router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const sub = db_1.db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!sub) {
        return (0, response_1.fail)(res, 'Subject not found', 404);
    }
    const cats = db_1.db.prepare('SELECT COUNT(*) as c FROM categories WHERE subject_id = ?').get(id);
    if (cats.c > 0) {
        return (0, response_1.fail)(res, 'Cannot delete subject with categories');
    }
    const questions = db_1.db.prepare('SELECT COUNT(*) as c FROM questions WHERE subject_id = ?').get(id);
    if (questions.c > 0) {
        return (0, response_1.fail)(res, 'Cannot delete subject with questions');
    }
    db_1.db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
    (0, response_1.success)(res, null);
});
exports.default = router;
//# sourceMappingURL=subjects.js.map