/** 从对象树里去掉常见密钥字段。用于集群和资源响应，避免把集群凭据交给模型。 */
export declare function redactSecrets(value: unknown): unknown;
/** Secret 清单只保留键名，不返回 data / stringData。 */
export declare function redactManifest(manifest: unknown): unknown;
export declare function redactText(text: string, secrets: readonly string[]): string;
/** Argo CD 日志接口返回 NDJSON（每行 result.content）或纯文本。 */
export declare function extractLogText(raw: string): string;
export declare function tokenExpiryMs(token: string): number | undefined;
