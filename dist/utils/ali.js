"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSmsCode = sendSmsCode;
exports.getOssStsToken = getOssStsToken;
exports.callOcr = callOcr;
exports.callChat = callChat;
const config_1 = require("../config");
// ============================================================
// 阿里云短信服务
// ============================================================
async function sendSmsCode(phone, code) {
    console.log('[SMS] START sendSmsCode', { phone, code });
    try {
        const Dysmsapi = await Promise.resolve().then(() => __importStar(require('@alicloud/dysmsapi20170525')));
        const OpenApi = await Promise.resolve().then(() => __importStar(require('@alicloud/openapi-client')));
        console.log('[SMS] SDK imported');
        const smsConfig = new OpenApi.Config({
            accessKeyId: config_1.config.aliSms.accessKeyId,
            accessKeySecret: config_1.config.aliSms.accessKeySecret,
        });
        smsConfig.endpoint = 'dysmsapi.aliyuncs.com';
        console.log('[SMS] Config created', {
            endpoint: smsConfig.endpoint,
            accessKeyId: config_1.config.aliSms.accessKeyId?.slice(0, 6) + '...',
            signName: config_1.config.aliSms.signName,
            templateCode: config_1.config.aliSms.templateCode,
        });
        const client = new Dysmsapi.default(smsConfig);
        const sendReq = new Dysmsapi.SendSmsRequest({
            phoneNumbers: phone,
            signName: config_1.config.aliSms.signName,
            templateCode: config_1.config.aliSms.templateCode,
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
        const respCode = resp.body?.Code || resp.body?.code;
        const respMessage = resp.body?.Message || resp.body?.message;
        console.log('[SMS] Parsed Code:', respCode, 'Message:', respMessage);
        if (respCode !== 'OK') {
            throw new Error(`SMS send failed: [${respCode}] ${respMessage || 'unknown'}`);
        }
        console.log('[SMS] SUCCESS');
    }
    catch (err) {
        console.error('[SMS] ERROR:', err);
        console.error('[SMS] ERROR stack:', err.stack);
        throw err;
    }
}
// ============================================================
// 阿里云 OSS STS
// ============================================================
async function getOssStsToken(userId) {
    console.log('[STS] START getOssStsToken', { userId });
    try {
        const Sts = await Promise.resolve().then(() => __importStar(require('@alicloud/sts20150401')));
        const OpenApi = await Promise.resolve().then(() => __importStar(require('@alicloud/openapi-client')));
        const stsConfig = new OpenApi.Config({
            accessKeyId: config_1.config.aliOss.accessKeyId,
            accessKeySecret: config_1.config.aliOss.accessKeySecret,
        });
        stsConfig.endpoint = 'sts.aliyuncs.com';
        console.log('[STS] Config:', {
            endpoint: stsConfig.endpoint,
            accessKeyId: config_1.config.aliOss.accessKeyId?.slice(0, 6) + '...',
            roleArn: config_1.config.aliOss.roleArn,
        });
        const client = new Sts.default(stsConfig);
        const req = new Sts.AssumeRoleRequest({
            roleArn: config_1.config.aliOss.roleArn,
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
            region: config_1.config.aliOss.region,
            bucket: config_1.config.aliOss.bucket,
            endpoint: config_1.config.aliOss.endpoint,
        };
    }
    catch (err) {
        console.error('[STS] ERROR:', err);
        console.error('[STS] ERROR stack:', err.stack);
        throw err;
    }
}
// ============================================================
// 阿里云百炼 — OCR (多模态 VL)
// ============================================================
async function callOcr(imageUrl) {
    const model = config_1.config.aliBailian.ocrModel;
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
                Authorization: `Bearer ${config_1.config.aliBailian.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        console.log('[OCR] HTTP status:', resp.status);
        const data = await resp.json();
        console.log('[OCR] Raw response:', JSON.stringify(data, null, 2));
        if (!resp.ok) {
            throw new Error(`OCR request failed: ${resp.status} ${JSON.stringify(data)}`);
        }
        const text = data?.choices?.[0]?.message?.content || '';
        console.log('[OCR] Extracted text length:', text.length);
        return text.trim();
    }
    catch (err) {
        console.error('[OCR] ERROR:', err);
        throw err;
    }
}
// ============================================================
// 阿里云百炼 — 通用对话
// ============================================================
async function callChat(systemPrompt, userPrompt) {
    const model = config_1.config.aliBailian.chatModel;
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
                Authorization: `Bearer ${config_1.config.aliBailian.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        console.log('[CHAT] HTTP status:', resp.status);
        const data = await resp.json();
        console.log('[CHAT] Raw response:', JSON.stringify(data, null, 2));
        if (!resp.ok) {
            throw new Error(`Chat request failed: ${resp.status} ${JSON.stringify(data)}`);
        }
        const text = data?.choices?.[0]?.message?.content || '';
        console.log('[CHAT] Extracted text length:', text.length);
        return text.trim();
    }
    catch (err) {
        console.error('[CHAT] ERROR:', err);
        throw err;
    }
}
//# sourceMappingURL=ali.js.map