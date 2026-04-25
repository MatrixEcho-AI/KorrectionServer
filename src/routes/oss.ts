import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getOssStsToken } from '../utils/ali';
import { success, fail } from '../utils/response';

const router = Router();
router.use(authMiddleware);

// GET /api/oss/sts
router.get('/sts', async (req: AuthRequest, res) => {
  try {
    const creds = await getOssStsToken(req.userId!);
    success(res, creds);
  } catch (err: any) {
    console.error('STS error:', err);
    fail(res, 'Failed to get STS token: ' + err.message, 500);
  }
});

export default router;
