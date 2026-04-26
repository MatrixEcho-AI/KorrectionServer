import { db } from '../db';
import { callChat } from './ali';

const pendingQueue = new Set<number>();
let isProcessing = false;

async function generateRedoForQuestion(questionId: number) {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId) as any;
  if (!q) return;

  const images = db
    .prepare("SELECT ocr_text FROM question_images WHERE question_id = ? AND image_type = 'original_question' ORDER BY sort_order")
    .all(questionId) as any[];
  const ocrText = images.map((i) => i.ocr_text).filter(Boolean).join('\n');

  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(q.category_id) as any;
  let path = cat?.name || '';
  if (cat && cat.parent_id !== 0) {
    let curr = cat;
    const names = [curr.name];
    while (curr.parent_id !== 0) {
      curr = db.prepare('SELECT * FROM categories WHERE id = ?').get(curr.parent_id) as any;
      if (curr) names.unshift(curr.name);
    }
    path = names.join(' / ');
  }

  const systemPrompt =
    '你是一位资深学科老师。根据以下错题文本、错题原因、所属科目与章节，生成1道相似考点的单选题。输出严格JSON：{"question":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"B","explanation":"解析文字"}';
  const userPrompt = `科目与章节：${path}\n错题文本：${ocrText || '无 OCR 文本'}\n错题原因：${q.reason_text || '未填写'}`;

  const aiText = await callChat(systemPrompt, userPrompt);
  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);

  db.prepare('INSERT INTO redo_sessions (question_id, ai_generated_json) VALUES (?, ?)').run(
    questionId,
    JSON.stringify(parsed)
  );
  console.log('[WORKER] Generated redo quiz for question', questionId);
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    for (const questionId of pendingQueue) {
      pendingQueue.delete(questionId);
      const count = db
        .prepare('SELECT COUNT(*) as c FROM redo_sessions WHERE question_id = ? AND user_answer IS NULL')
        .get(questionId) as any;
      if (count.c >= 3) continue;
      try {
        await generateRedoForQuestion(questionId);
      } catch (err) {
        console.error('[WORKER] Failed to generate redo for', questionId, err);
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function scanAllRedoQuestions() {
  const questions = db.prepare("SELECT id FROM questions WHERE status = 'redo'").all() as any[];
  for (const q of questions) {
    const count = db
      .prepare('SELECT COUNT(*) as c FROM redo_sessions WHERE question_id = ? AND user_answer IS NULL')
      .get(q.id) as any;
    if (count.c < 3) {
      pendingQueue.add(q.id);
    }
  }
}

export function queueRedoGeneration(questionId: number) {
  pendingQueue.add(questionId);
}

export function startRedoWorker() {
  scanAllRedoQuestions().then(() => processQueue());

  setInterval(async () => {
    await processQueue();
    await scanAllRedoQuestions();
  }, 30000);

  console.log('[WORKER] Redo worker started');
}
