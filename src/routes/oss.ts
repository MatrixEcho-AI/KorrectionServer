import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getOssStsToken, getOssUploadUrl } from '../utils/ali';
import { success, fail } from '../utils/response';

const router = Router();
router.use(authMiddleware);

// GET /api/oss/sts
router.get('/sts', async (req: AuthRequest, res) => {
  console.log('[OSS] START /api/oss/sts', { userId: req.userId });
  try {
    const creds = await getOssStsToken(req.userId!);
    console.log('[OSS] SUCCESS', { accessKeyId: creds.accessKeyId?.slice(0, 8) + '...', bucket: creds.bucket });
    success(res, creds);
  } catch (err: any) {
    console.error('[OSS] STS error:', err);
    fail(res, 'Failed to get STS token: ' + err.message, 500);
  }
});

// GET /api/oss/upload-url?key=xxx
router.get('/upload-url', async (req: AuthRequest, res) => {
  const { key } = req.query;
  if (!key || typeof key !== 'string') {
    return fail(res, 'Missing key parameter', 400);
  }
  console.log('[OSS] START /api/oss/upload-url', { userId: req.userId, key });
  try {
    const result = await getOssUploadUrl(req.userId!, key);
    console.log('[OSS] upload-url SUCCESS', { host: result.host });
    success(res, result);
  } catch (err: any) {
    console.error('[OSS] upload-url error:', err);
    fail(res, 'Failed to get upload URL: ' + err.message, 500);
  }
});

export default router;
