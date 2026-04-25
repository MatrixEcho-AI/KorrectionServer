import { config } from '../config';

// ============================================================
// 阿里云短信服务
// ============================================================
export async function sendSmsCode(phone: string, code: string): Promise<void> {
  console.log('[SMS] START sendSmsCode', { phone, code });
  try {
    const Dysmsapi = await import('@alicloud/dysmsapi20170525');
    const OpenApi = await import('@alicloud/openapi-client');

    console.log('[SMS] SDK imported');

    const smsConfig = new OpenApi.Config({
      accessKeyId: config.aliSms.accessKeyId,
      accessKeySecret: config.aliSms.accessKeySecret,
    });
    smsConfig.endpoint = 'dysmsapi.aliyuncs.com';

    console.log('[SMS] Config created', {
      endpoint: smsConfig.endpoint,
      accessKeyId: config.aliSms.accessKeyId?.slice(0, 6) + '...',
      signName: config.aliSms.signName,
      templateCode: config.aliSms.templateCode,
    });

    const client = new Dysmsapi.default(smsConfig);
    const sendReq = new Dysmsapi.SendSmsRequest({
      phoneNumbers: phone,
      signName: config.aliSms.signName,
      templateCode: config.aliSms.templateCode,
      templateParam: JSON.stringify({ code }),
    });

    console.log('[SMS] Request prepared:', {
      phoneNumbers: sendReq.phoneNumbers,
      signName: sendReq.signName,
      templateCode: sendReq.templateCode,
      templateParam: sendReq.templateParam,
    });

    const resp = await client.sendSms(sendReq);
    console.log('[SMS] Raw response:', JSON.stringify(resp, null, 2));
    console.log('[SMS] Response body:', JSON.stringify(resp.body, null, 2));

    // 阿里云 SDK v2 返回字段是大写的 Code / Message
    const respCode = (resp.body as any)?.Code || (resp.body as any)?.code;
    const respMessage = (resp.body as any)?.Message || (resp.body as any)?.message;

    console.log('[SMS] Parsed Code:', respCode, 'Message:', respMessage);

    if (respCode !== 'OK') {
      throw new Error(`SMS send failed: [${respCode}] ${respMessage || 'unknown'}`);
    }

    console.log('[SMS] SUCCESS');
  } catch (err: any) {
    console.error('[SMS] ERROR:', err);
    console.error('[SMS] ERROR stack:', err.stack);
    throw err;
  }
}

// ============================================================
// 阿里云 OSS STS
// ============================================================
export async function getOssStsToken(userId: number): Promise<{
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  region: string;
  bucket: string;
  endpoint: string;
}> {
  console.log('[STS] START getOssStsToken', { userId });
  try {
    const Sts = await import('@alicloud/sts20150401');
    const OpenApi = await import('@alicloud/openapi-client');

    const stsConfig = new OpenApi.Config({
      accessKeyId: config.aliOss.accessKeyId,
      accessKeySecret: config.aliOss.accessKeySecret,
    });
    stsConfig.endpoint = 'sts.aliyuncs.com';

    console.log('[STS] Config:', {
      endpoint: stsConfig.endpoint,
      accessKeyId: config.aliOss.accessKeyId?.slice(0, 6) + '...',
      roleArn: config.aliOss.roleArn,
    });

    const client = new Sts.default(stsConfig);
    const req = new Sts.AssumeRoleRequest({
      roleArn: config.aliOss.roleArn,
      roleSessionName: `korrection-user-${userId}`,
      durationSeconds: 3600,
    });

    const resp = await client.assumeRole(req);
    console.log('[STS] Raw response:', JSON.stringify(resp, null, 2));

    const creds = resp.body?.credentials;
    if (!creds) {
      throw new Error('Failed to obtain OSS STS token: no credentials in response');
    }

    console.log('[STS] SUCCESS');
    return {
      accessKeyId: creds.accessKeyId || '',
      accessKeySecret: creds.accessKeySecret || '',
      securityToken: creds.securityToken || '',
      expiration: creds.expiration || '',
      region: config.aliOss.region,
      bucket: config.aliOss.bucket,
      endpoint: config.aliOss.endpoint,
    };
  } catch (err: any) {
    console.error('[STS] ERROR:', err);
    console.error('[STS] ERROR stack:', err.stack);
    throw err;
  }
}

// ============================================================
// 阿里云百炼 — OCR (多模态 VL)
// ============================================================
export async function callOcr(imageUrl: string): Promise<string> {
  const model = config.aliBailian.ocrModel;
  console.log('[OCR] START', { model, imageUrl: imageUrl.slice(0, 80) + '...' });

  // 百炼 OpenAI 兼容模式 endpoint
  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: '请识别图片中的所有文字，保持原有排版，直接输出文字内容。' },
        ],
      },
    ],
  };

  console.log('[OCR] Request body:', JSON.stringify(body, null, 2));

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.aliBailian.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[OCR] HTTP status:', resp.status);

    const data = await resp.json() as any;
    console.log('[OCR] Raw response:', JSON.stringify(data, null, 2));

    if (!resp.ok) {
      throw new Error(`OCR request failed: ${resp.status} ${JSON.stringify(data)}`);
    }

    const text = data?.choices?.[0]?.message?.content || '';
    console.log('[OCR] Extracted text length:', text.length);
    return text.trim();
  } catch (err: any) {
    console.error('[OCR] ERROR:', err);
    throw err;
  }
}

// ============================================================
// 阿里云百炼 — 通用对话
// ============================================================
export async function callChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const model = config.aliBailian.chatModel;
  console.log('[CHAT] START', { model, systemPromptLen: systemPrompt.length, userPromptLen: userPrompt.length });

  // 百炼 OpenAI 兼容模式 endpoint
  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };

  console.log('[CHAT] Request body:', JSON.stringify(body, null, 2));

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.aliBailian.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[CHAT] HTTP status:', resp.status);

    const data = await resp.json() as any;
    console.log('[CHAT] Raw response:', JSON.stringify(data, null, 2));

    if (!resp.ok) {
      throw new Error(`Chat request failed: ${resp.status} ${JSON.stringify(data)}`);
    }

    const text = data?.choices?.[0]?.message?.content || '';
    console.log('[CHAT] Extracted text length:', text.length);
    return text.trim();
  } catch (err: any) {
    console.error('[CHAT] ERROR:', err);
    throw err;
  }
}
