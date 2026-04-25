"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.success = success;
exports.fail = fail;
function success(res, data, message = 'ok') {
    res.json({ code: 0, message, data });
}
function fail(res, message, status = 400, code = status) {
    res.status(status).json({ code, message });
}
//# sourceMappingURL=response.js.map