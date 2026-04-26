import Database from 'better-sqlite3';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: Database.Database = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS auth_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON auth_codes(phone);

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      parent_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_subject ON categories(subject_id);

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'photo' CHECK(status IN ('photo','summary','review','redo','completed','deleted')),
      reason_text TEXT,
      review_count INTEGER NOT NULL DEFAULT 0,
      last_review_at INTEGER,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);
    CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
    CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);
    CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);

    CREATE TABLE IF NOT EXISTS question_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      image_type TEXT NOT NULL CHECK(image_type IN ('original_question','wrong_solution','reference_answer')),
      ocr_text TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_qimages_question ON question_images(question_id);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
    CREATE INDEX IF NOT EXISTS idx_tags_subject ON tags(subject_id);

    CREATE TABLE IF NOT EXISTS question_tags (
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (question_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('understood','not_understood')),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_review_logs_question ON review_logs(question_id);

    CREATE TABLE IF NOT EXISTS redo_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      ai_generated_json TEXT NOT NULL,
      user_answer TEXT,
      is_correct INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_redo_question ON redo_sessions(question_id);
  `);

  try {
    db.exec(`ALTER TABLE question_images ADD COLUMN name TEXT;`);
  } catch {
    // 字段已存在，忽略错误
  }
}
