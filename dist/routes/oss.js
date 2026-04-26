"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const ali_1 = require("../utils/ali");
const response_1 = require("../utils/response");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/oss/sts
router.get('/sts', async (req, res) => {
    console.log('[OSS] START /api/oss/sts', { userId: req.userId });
    try {
        const creds = await (0, ali_1.getOssStsToken)(req.userId);
        console.log('[OSS] SUCCESS', { accessKeyId: creds.accessKeyId?.slice(0, 8) + '...', bucket: creds.bucket });
        (0, response_1.success)(res, creds);
    }
    catch (err) {
        console.error('[OSS] STS error:', err);
        (0, response_1.fail)(res, 'Failed to get STS token: ' + err.message, 500);
    }
});
// GET /api/oss/upload-url?key=xxx
router.get('/upload-url', async (req, res) => {
    const { key } = req.query;
    if (!key || typeof key !== 'string') {
        return (0, response_1.fail)(res, 'Missing key parameter', 400);
    }
    console.log('[OSS] START /api/oss/upload-url', { userId: req.userId, key });
    try {
        const result = await (0, ali_1.getOssUploadUrl)(req.userId, key);
        console.log('[OSS] upload-url SUCCESS', { host: result.host });
        (0, response_1.success)(res, result);
    }
    catch (err) {
        console.error('[OSS] upload-url error:', err);
        (0, response_1.fail)(res, 'Failed to get upload URL: ' + err.message, 500);
    }
});
exports.default = router;
//# sourceMappingURL=oss.js.map