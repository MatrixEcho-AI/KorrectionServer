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
    try {
        const creds = await (0, ali_1.getOssStsToken)(req.userId);
        (0, response_1.success)(res, creds);
    }
    catch (err) {
        console.error('STS error:', err);
        (0, response_1.fail)(res, 'Failed to get STS token: ' + err.message, 500);
    }
});
exports.default = router;
//# sourceMappingURL=oss.js.map