import { Router } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { success, fail } from '../utils/response';

const router = Router();
router.use(authMiddleware);

// GET /api/categories
router.get('/', (req: AuthRequest, res) => {
  const rows = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order, id').all(req.userId!) as any[];
  success(res, rows);
});

// POST /api/categories
router.post('/', (req: AuthRequest, res) => {
  const { parent_id = 0, name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return fail(res, 'Name is required');
  }

  const parentId = Number(parent_id);
  let level = 1;

  if (parentId !== 0) {
    const parent = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(parentId, req.userId!) as any;
    if (!parent) {
      return fail(res, 'Parent not found');
    }
    level = parent.level + 1;
    if (level > 10) {
      return fail(res, 'Max level exceeded (10)');
    }
    // 校验子章节深度不超过8：从parent往上数
    let depth = 1;
    let curr = parent;
    while (curr.parent_id !== 0) {
      curr = db.prepare('SELECT * FROM categories WHERE id = ?').get(curr.parent_id) as any;
      depth++;
    }
    // 当前parent已经是第 depth 层子章节（root是科目），再加当前节点就是 depth+1
    if (depth >= 8) {
      return fail(res, 'Max sub-chapter depth exceeded (8)');
    }
  }

  // 同级名称唯一
  const sibling = db
    .prepare('SELECT id FROM categories WHERE user_id = ? AND parent_id = ? AND name = ?')
    .get(req.userId!, parentId, name.trim()) as any;
  if (sibling) {
    return fail(res, 'Duplicate name at same level');
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories WHERE user_id = ? AND parent_id = ?')
    .get(req.userId!, parentId) as any;

  const result = db
    .prepare('INSERT INTO categories (user_id, parent_id, name, level, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(req.userId!, parentId, name.trim(), level, (maxOrder?.m || 0) + 1);

  success(res, { id: result.lastInsertRowid });
});

// PUT /api/categories/:id
router.put('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return fail(res, 'Name is required');
  }

  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!cat) {
    return fail(res, 'Category not found', 404);
  }

  const sibling = db
    .prepare('SELECT id FROM categories WHERE user_id = ? AND parent_id = ? AND name = ? AND id != ?')
    .get(req.userId!, cat.parent_id, name.trim(), id) as any;
  if (sibling) {
    return fail(res, 'Duplicate name at same level');
  }

  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id);
  success(res, null);
});

// DELETE /api/categories/:id
router.delete('/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, req.userId!) as any;
  if (!cat) {
    return fail(res, 'Category not found', 404);
  }

  const children = db.prepare('SELECT COUNT(*) as c FROM categories WHERE parent_id = ?').get(id) as any;
  if (children.c > 0) {
    return fail(res, 'Cannot delete category with children');
  }

  const questions = db.prepare('SELECT COUNT(*) as c FROM questions WHERE category_id = ?').get(id) as any;
  if (questions.c > 0) {
    return fail(res, 'Cannot delete category with questions');
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  success(res, null);
});

export default router;
