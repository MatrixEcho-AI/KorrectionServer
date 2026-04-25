"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const db_1 = require("./db");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = __importDefault(require("./routes/auth"));
const subjects_1 = __importDefault(require("./routes/subjects"));
const categories_1 = __importDefault(require("./routes/categories"));
const tags_1 = __importDefault(require("./routes/tags"));
const questions_1 = __importDefault(require("./routes/questions"));
const oss_1 = __importDefault(require("./routes/oss"));
const export_1 = __importDefault(require("./routes/export"));
const app = (0, express_1.default)();
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express_1.default.json({ limit: '10mb' }));
// 初始化数据库
(0, db_1.initDb)();
// 路由
app.use('/api/auth', auth_1.default);
app.use('/api/subjects', subjects_1.default);
app.use('/api/categories', categories_1.default);
app.use('/api/tags', tags_1.default);
app.use('/api/questions', questions_1.default);
app.use('/api/oss', oss_1.default);
app.use('/api/export', export_1.default);
// 健康检查
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});
app.use(errorHandler_1.errorHandler);
app.listen(config_1.config.port, () => {
    console.log(`KorrectionServer running on http://localhost:${config_1.config.port}`);
});
//# sourceMappingURL=index.js.map