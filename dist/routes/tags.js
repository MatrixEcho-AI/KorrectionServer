"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/tags?subject_id=xx
router.get('/', (req, res) => {
    const subjectId = Number(req.query.subject_id);
    if (!subjectId) {
        return (0, response_1.fail)(res, 'subject_id is required');
    }
    const rows = db_1.db
        .prepare('SELECT * FROM tags WHERE user_id = ? AND subject_id = ? ORDER BY id DESC')
        .all(req.userId, subjectId);
    (0, response_1.success)(res, rows);
});
// POST /api/tags
router.post('/', (req, res) => {
    const { subject_id, name } = req.body;
    if (!subject_id || !name || typeof name !== 'string' || name.trim().length === 0) {
        return (0, response_1.fail)(res, 'subject_id and name are required');
    }
    const existing = db_1.db
        .prepare('SELECT id FROM tags WHERE user_id = ? AND subject_id = ? AND name = ?')
        .get(req.userId, subject_id, name.trim());
    if (existing) {
        return (0, response_1.fail)(res, 'Tag already exists');
    }
    const result = db_1.db
        .prepare('INSERT INTO tags (user_id, subject_id, name) VALUES (?, ?, ?)')
        .run(req.userId, subject_id, name.trim());
    (0, response_1.success)(res, { id: result.lastInsertRowid });
});
exports.default = router;
//# sourceMappingURL=tags.js.map