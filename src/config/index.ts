import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function env(key: string, required = false): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: env('JWT_SECRET') || 'default-dev-secret',

  db: {
    path: env('DB_PATH') || './data/korrection.db',
  },

  aliSms: {
    accessKeyId: env('ALI_ACCESS_KEY_ID'),
    accessKeySecret: env('ALI_ACCESS_KEY_SECRET'),
    signName: env('ALI_SMS_SIGN_NAME'),
    templateCode: env('ALI_SMS_TEMPLATE_CODE'),
  },

  aliOss: {
    region: env('ALI_OSS_REGION'),
    bucket: env('ALI_OSS_BUCKET'),
    endpoint: env('ALI_OSS_ENDPOINT'),
    accessKeyId: env('ALI_ACCESS_KEY_ID'),
    accessKeySecret: env('ALI_ACCESS_KEY_SECRET'),
    roleArn: env('ALI_OSS_ROLE_ARN'),
  },

  aliBailian: {
    apiKey: env('ALI_BAILIAN_API_KEY'),
    ocrModel: process.env.ALI_BAILIAN_OCR_MODEL || 'qwen-vl-plus',
    chatModel: process.env.ALI_BAILIAN_CHAT_MODEL || 'qwen-plus',
  },
};
