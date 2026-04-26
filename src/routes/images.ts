import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { fail } from '../utils/response';

const router = Router();
router.use(authMiddleware);

// GET /api/images/proxy?url=...
router.get('/proxy', async (req: AuthRequest, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    return fail(res, 'url is required', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail(res, 'invalid url', 400);
  }

  if (!parsed.hostname.endsWith('.aliyuncs.com')) {
    return fail(res, 'only aliyuncs.com urls are allowed', 403);
  }

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      return fail(res, `upstream error: ${response.status}`, 502);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err: any) {
    console.error('[ImageProxy] ERROR:', err);
    return fail(res, 'failed to proxy image', 500);
  }
});

export default router;
