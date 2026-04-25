"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/categories
router.get('/', (req, res) => {
    const subjectId = req.query.subject_id ? Number(req.query.subject_id) : undefined;
    let sql = 'SELECT * FROM categories WHERE user_id = ?';
    const params = [req.userId];
    if (subjectId) {
        sql += ' AND subject_id = ?';
        params.push(subjectId);
    }
    sql += ' ORDER BY sort_order, id';
    const rows = db_1.db.prepare(sql).all(...params);
    (0, response_1.success)(res, rows);
});
// POST /api/categories
router.post('/', (req, res) => {
    const { parent_id = 0, subject_id, name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return (0, response_1.fail)(res, 'Name is required');
    }
    const parentId = Number(parent_id);
    let level = 1;
    let subjectId = subject_id ? Number(subject_id) : 0;
    if (parentId !== 0) {
        const parent = db_1.db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(parentId, req.userId);
        if (!parent) {
            return (0, response_1.fail)(res, 'Parent not found');
        }
        level = parent.level + 1;
        subjectId = parent.subject_id;
        if (level > 10) {
            return (0, response_1.fail)(res, 'Max level exceeded (10)');
        }
        // 校验子章节深度不超过8：从parent往上数
        let depth = 1;
        let curr = parent;
        while (curr.parent_id !== 0) {
            curr = db_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(curr.parent_id);
            depth++;
        }
        // 当前parent已经是第 depth 层子章节（root是科目），再加当前节点就是 depth+1
        if (depth >= 8) {
            return (0, response_1.fail)(res, 'Max sub-chapter depth exceeded (8)');
        }
    }
    else {
        if (!subjectId) {
            return (0, response_1.fail)(res, 'subject_id is required for root category');
        }
        const sub = db_1.db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(subjectId, req.userId);
        if (!sub) {
            return (0, response_1.fail)(res, 'Subject not found');
        }
    }
    // 同级名称唯一
    const sibling = db_1.db
        .prepare('SELECT id FROM categories WHERE user_id = ? AND parent_id = ? AND name = ?')
        .get(req.userId, parentId, name.trim());
    if (sibling) {
        return (0, response_1.fail)(res, 'Duplicate name at same level');
    }
    const maxOrder = db_1.db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories WHERE user_id = ? AND parent_id = ?')
        .get(req.userId, parentId);
    const result = db_1.db
        .prepare('INSERT INTO categories (user_id, parent_id, subject_id, name, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .run(req.userId, parentId, subjectId, name.trim(), level, (maxOrder?.m || 0) + 1);
    (0, response_1.success)(res, { id: result.lastInsertRowid });
});
// PUT /api/categories/:id
router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return (0, response_1.fail)(res, 'Name is required');
    }
    const cat = db_1.db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!cat) {
        return (0, response_1.fail)(res, 'Category not found', 404);
    }
    const sibling = db_1.db
        .prepare('SELECT id FROM categories WHERE user_id = ? AND parent_id = ? AND name = ? AND id != ?')
        .get(req.userId, cat.parent_id, name.trim(), id);
    if (sibling) {
        return (0, response_1.fail)(res, 'Duplicate name at same level');
    }
    db_1.db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id);
    (0, response_1.success)(res, null);
});
// DELETE /api/categories/:id
router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const cat = db_1.db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!cat) {
        return (0, response_1.fail)(res, 'Category not found', 404);
    }
    const children = db_1.db.prepare('SELECT COUNT(*) as c FROM categories WHERE parent_id = ?').get(id);
    if (children.c > 0) {
        return (0, response_1.fail)(res, 'Cannot delete category with children');
    }
    const questions = db_1.db.prepare('SELECT COUNT(*) as c FROM questions WHERE category_id = ?').get(id);
    if (questions.c > 0) {
        return (0, response_1.fail)(res, 'Cannot delete category with questions');
    }
    db_1.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    (0, response_1.success)(res, null);
});
exports.default = router;
//# sourceMappingURL=categories.js.map