"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const response_1 = require("../utils/response");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/images/proxy?url=...
router.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return (0, response_1.fail)(res, 'url is required', 400);
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return (0, response_1.fail)(res, 'invalid url', 400);
    }
    if (!parsed.hostname.endsWith('.aliyuncs.com')) {
        return (0, response_1.fail)(res, 'only aliyuncs.com urls are allowed', 403);
    }
    try {
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            return (0, response_1.fail)(res, `upstream error: ${response.status}`, 502);
        }
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(buffer);
    }
    catch (err) {
        console.error('[ImageProxy] ERROR:', err);
        return (0, response_1.fail)(res, 'failed to proxy image', 500);
    }
});
exports.default = router;
//# sourceMappingURL=images.js.map