import type { Context } from '@deepseek-ai/cordis';
import { type Volatile } from '@deepseek-ai/cosmokit';
import type { RuntimeConfig } from './config.js';
import { selectSite, type ResolvedSite } from './model.js';
export declare function readSites(config: RuntimeConfig | Volatile<RuntimeConfig>): {
    sites: ResolvedSite[];
    defaultSiteId: string;
};
export declare function resolvePassword(ctx: Context, site: ResolvedSite): Promise<string>;
export { selectSite };
export type { ResolvedSite } from './model.js';
