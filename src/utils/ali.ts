import { config } from '../config';

// 阿里云短信服务
export async function sendSmsCode(phone: string, code: string): Promise<void> {
  const Dysmsapi = await import('@alicloud/dysmsapi20170525');
  const OpenApi = await import('@alicloud/openapi-client');

  const smsConfig = new OpenApi.Config({
    accessKeyId: config.aliSms.accessKeyId,
    accessKeySecret: config.aliSms.accessKeySecret,
  });
  smsConfig.endpoint = 'dysmsapi.aliyuncs.com';

  const client = new Dysmsapi.default(smsConfig);
  const sendReq = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName: config.aliSms.signName,
    templateCode: config.aliSms.templateCode,
    templateParam: JSON.stringify({ code }),
  });

  const resp = await client.sendSms(sendReq);
  if (resp.body?.code !== 'OK') {
    throw new Error(`SMS send failed: ${resp.body?.message || 'unknown'}`);
  }
}

// 阿里云 OSS STS
export async function getOssStsToken(userId: number): Promise<{
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  region: string;
  bucket: string;
  endpoint: string;
}> {
  const Sts = await import('@alicloud/sts20150401');
  const OpenApi = await import('@alicloud/openapi-client');

  const stsConfig = new OpenApi.Config({
    accessKeyId: config.aliOss.accessKeyId,
    accessKeySecret: config.aliOss.accessKeySecret,
  });
  stsConfig.endpoint = 'sts.aliyuncs.com';

  const client = new Sts.default(stsConfig);
  const req = new Sts.AssumeRoleRequest({
    roleArn: config.aliOss.roleArn,
    roleSessionName: `korrection-user-${userId}`,
    durationSeconds: 3600,
  });

  const resp = await client.assumeRole(req);
  const creds = resp.body?.credentials;
  if (!creds) {
    throw new Error('Failed to obtain OSS STS token');
  }

  return {
    accessKeyId: creds.accessKeyId || '',
    accessKeySecret: creds.accessKeySecret || '',
    securityToken: creds.securityToken || '',
    expiration: creds.expiration || '',
    region: config.aliOss.region,
    bucket: config.aliOss.bucket,
    endpoint: config.aliOss.endpoint,
  };
}

// 阿里云百炼 — OCR
export async function callOcr(imageUrl: string): Promise<string> {
  const body = {
    model: config.aliBailian.ocrModel,
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { image: imageUrl },
            { text: '请识别图片中的所有文字，保持原有排版，直接输出文字内容。' },
          ],
        },
      ],
    },
  };

  const resp = await fetch(config.aliBailian.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.aliBailian.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`OCR request failed: ${resp.status}`);
  }

  const data = await resp.json() as any;
  const text = data?.output?.text || data?.output?.choices?.[0]?.message?.content || '';
  return text.trim();
}

// 阿里云百炼 — 通用对话
export async function callChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const body = {
    model: config.aliBailian.chatModel,
    input: {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
  };

  const resp = await fetch(config.aliBailian.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.aliBailian.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`Chat request failed: ${resp.status}`);
  }

  const data = await resp.json() as any;
  const text = data?.output?.text || data?.output?.choices?.[0]?.message?.content || '';
  return text.trim();
}
