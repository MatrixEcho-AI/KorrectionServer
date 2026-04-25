import express from 'express';
import { config } from './config';
import { initDb } from './db';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth';
import subjectRoutes from './routes/subjects';
import categoryRoutes from './routes/categories';
import tagRoutes from './routes/tags';
import questionRoutes from './routes/questions';
import ossRoutes from './routes/oss';
import exportRoutes from './routes/export';

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: '10mb' }));

// 初始化数据库
initDb();

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/oss', ossRoutes);
app.use('/api/export', exportRoutes);

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`KorrectionServer running on http://localhost:${config.port}`);
});
