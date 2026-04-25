import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { success, fail } from '../utils/response';
import { config } from '../config';

const router = Router();
router.use(authMiddleware);

router.post('/pdf', async (req: AuthRequest, res) => {
  const { question_ids, options, sort, paperSize } = req.body;
  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return fail(res, 'question_ids is required');
  }

  const userId = req.userId!;
  const placeholders = question_ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT q.*, c.name as category_name
       FROM questions q LEFT JOIN categories c ON q.category_id = c.id
       WHERE q.id IN (${placeholders}) AND q.user_id = ? AND q.status != 'deleted'`
    )
    .all(...question_ids, userId) as any[];

  if (rows.length === 0) {
    return fail(res, 'No questions found');
  }

  // 排序
  const sortField = sort?.field || 'created_at';
  const sortOrder = sort?.order || 'desc';
  const validFields = ['created_at', 'review_count', 'last_review_at'];
  if (validFields.includes(sortField)) {
    rows.sort((a, b) => {
      const av = a[sortField] || 0;
      const bv = b[sortField] || 0;
      return sortOrder === 'asc' ? av - bv : bv - av;
    });
  }

  // 获取图片和标签
  for (const q of rows) {
    q.images = db.prepare('SELECT * FROM question_images WHERE question_id = ? ORDER BY sort_order').all(q.id);
    q.tags = db
      .prepare('SELECT t.name FROM question_tags qt JOIN tags t ON qt.tag_id = t.id WHERE qt.question_id = ?')
      .all(q.id)
      .map((t: any) => t.name);
    q.reviewCount = q.review_count;
    q.lastReviewAt = q.last_review_at ? new Date(q.last_review_at).toLocaleString('zh-CN') : '-';
  }

  const include = {
    originalImage: options?.originalImage !== false,
    originalOcr: options?.originalOcr !== false,
    referenceImage: options?.referenceImage !== false,
    reason: options?.reason !== false,
    tags: options?.tags !== false,
    reviewCount: options?.reviewCount !== false,
    lastReviewAt: options?.lastReviewAt !== false,
    categoryPath: options?.categoryPath !== false,
  };

  const paper = paperSize || { width: 210, height: 297 }; // default A4 mm
  const isCustom = !!(paperSize?.width && paperSize?.height);

  const htmlContent = buildPdfHtml(rows, include, isCustom ? `${paper.width}mm` : (paper as any).name || '210mm');

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfOptions: any = {
      format: isCustom ? undefined : 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
    };
    if (isCustom) {
      pdfOptions.width = `${paper.width}mm`;
      pdfOptions.height = `${paper.height}mm`;
    }

    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `export-${Date.now()}.pdf`);

    await page.pdf({ ...pdfOptions, path: tmpFile });
    await browser.close();
    browser = undefined as any;

    // 上传到 OSS
    const OSS = await import('ali-oss');
    const client = new OSS.default({
      region: config.aliOss.region,
      accessKeyId: config.aliOss.accessKeyId,
      accessKeySecret: config.aliOss.accessKeySecret,
      bucket: config.aliOss.bucket,
    });

    const ossKey = `exports/user-${userId}/${Date.now()}.pdf`;
    await client.put(ossKey, tmpFile);

    // 生成签名 URL（7天有效）
    const url = client.signatureUrl(ossKey, { expires: 3600 * 24 * 7 });

    // 清理临时文件
    fs.unlinkSync(tmpFile);

    success(res, { url, ossKey });
  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    console.error('PDF export error:', err);
    fail(res, 'PDF export failed: ' + err.message, 500);
  }
});

function buildPdfHtml(questions: any[], include: any, paperWidth: string) {
  const items = questions
    .map((q, idx) => {
      const origImages = q.images.filter((i: any) => i.image_type === 'original_question');
      const refImages = q.images.filter((i: any) => i.image_type === 'reference_answer');

      let html = `<div class="question-item">`;
      html += `<div class="question-header">题目 ${idx + 1}</div>`;

      if (include.originalImage) {
        origImages.forEach((img: any) => {
          html += `<img class="q-img" src="${img.image_url}" />`;
          if (include.originalOcr && img.ocr_text) {
            html += `<div class="ocr-text"><strong>OCR:</strong> ${escapeHtml(img.ocr_text)}</div>`;
          }
        });
      }

      if (include.referenceImage) {
        refImages.forEach((img: any) => {
          html += `<img class="q-img" src="${img.image_url}" />`;
        });
      }

      if (include.reason && q.reason_text) {
        html += `<div class="meta"><strong>错题原因:</strong> ${escapeHtml(q.reason_text)}</div>`;
      }
      if (include.tags && q.tags.length) {
        html += `<div class="meta"><strong>标签:</strong> ${q.tags.map((t: string) => escapeHtml(t)).join(', ')}</div>`;
      }
      if (include.reviewCount) {
        html += `<div class="meta"><strong>复习次数:</strong> ${q.reviewCount}</div>`;
      }
      if (include.lastReviewAt) {
        html += `<div class="meta"><strong>最后复盘:</strong> ${q.lastReviewAt}</div>`;
      }
      if (include.categoryPath && q.category_name) {
        html += `<div class="meta"><strong>章节:</strong> ${escapeHtml(q.category_name)}</div>`;
      }

      html += `</div>`;
      return html;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { size: ${paperWidth}; margin: 15mm; }
body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 14px; color: #333; line-height: 1.6; }
.question-item { page-break-inside: avoid; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 16px; }
.question-header { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #111; }
.q-img { max-width: 100%; display: block; margin: 8px 0; border: 1px solid #ddd; border-radius: 4px; }
.ocr-text { background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 6px 0; font-size: 13px; color: #555; white-space: pre-wrap; }
.meta { margin: 4px 0; font-size: 13px; color: #444; }
</style>
</head>
<body>
${items}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;
