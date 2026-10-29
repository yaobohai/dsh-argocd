import type { Context } from '@deepseek-ai/cordis';
import { Config, type RuntimeConfig } from './config.js';
export declare const name = "dsh-argocd";
export declare const inject: readonly ["tools", "credentials"];
/**
 * 必须从入口模块导出 Config。Loader 用它生成设置表单；不导出时设置页会显示不可用。
 * 连接元数据由设置页「ArgoCD连接」编辑。这里关闭自动配置页，避免同一份字段出现在插件页。
 */
export { Config };
export declare function apply(ctx: Context, config: RuntimeConfig): void;
