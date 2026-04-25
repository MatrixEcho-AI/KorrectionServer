export declare function sendSmsCode(phone: string, code: string): Promise<void>;
export declare function getOssStsToken(userId: number): Promise<{
    accessKeyId: string;
    accessKeySecret: string;
    securityToken: string;
    expiration: string;
    region: string;
    bucket: string;
    endpoint: string;
}>;
export declare function callOcr(imageUrl: string): Promise<string>;
export declare function callChat(systemPrompt: string, userPrompt: string): Promise<string>;
//# sourceMappingURL=ali.d.ts.map