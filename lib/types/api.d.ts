import type { Context } from '@deepseek-ai/cordis';
import type { RuntimeConfig } from './config.js';
import { type ResolvedSite } from './sites.js';
export interface LoginResult {
    siteId: string;
    siteName: string;
    username: string;
    loggedIn: boolean;
    token: string;
    expiresAt?: string;
}
export declare class ArgocdApi {
    private readonly ctx;
    private readonly config;
    private readonly tokens;
    constructor(ctx: Context, config: RuntimeConfig);
    sites(): {
        sites: ResolvedSite[];
        defaultSiteId: string;
    };
    pick(site?: string): ResolvedSite;
    invalidate(passwordRef?: string): void;
    login(site: ResolvedSite, signal?: AbortSignal, fresh?: boolean): Promise<LoginResult>;
    /** 测试连接只报告能否登录，不返回 token，也不回显密码。 */
    testConnection(input: {
        baseUrl: string;
        username: string;
        passwordRef: string;
        timeoutMs: number;
        insecureSkipTls: boolean;
        password?: string;
        signal?: AbortSignal;
    }): Promise<{
        ok: true;
        username: string;
    } | {
        ok: false;
        message: string;
    }>;
    listClusters(site: ResolvedSite, signal?: AbortSignal): Promise<{
        siteId: string;
        count: number;
        clusters: {
            name: string;
            server: string;
            namespaces: any;
            connectionState: {
                status: string;
                message: string;
            };
            serverVersion: string;
            applicationsCount: any;
            cacheInfo: any;
        }[];
    }>;
    listApplications(site: ResolvedSite, signal?: AbortSignal): Promise<{
        siteId: string;
        count: number;
        applications: {
            name: string;
            namespace: string;
            project: string;
            repoURL: string;
            path: string;
            targetRevision: string;
            destination: {
                server: string;
                namespace: string;
                name: string;
            };
            sync: string;
            revision: string;
            health: string;
        }[];
    }>;
    applicationSyncStatus(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal): Promise<{
        application: string;
        namespace: string;
        sync: string;
        revision: string;
        health: string;
        operationPhase: string;
        operationMessage: string;
        siteId: string;
    }>;
    applicationResources(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal): Promise<{
        siteId: string;
        application: string;
        count: number;
        resources: {
            group: string;
            version: string;
            kind: string;
            namespace: string;
            name: string;
            uid: string;
            health: string;
            createdAt: string;
        }[];
        truncated: boolean;
    }>;
    resourceSyncStatus(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal): Promise<{
        siteId: string;
        application: string;
        count: number;
        resources: {
            group: string;
            version: string;
            kind: string;
            namespace: string;
            name: string;
            sync: string;
        }[];
        truncated: boolean;
    }>;
    describeResource(site: ResolvedSite, query: ResourceQuery, signal?: AbortSignal): Promise<{
        siteId: string;
        application: string;
        resource: {
            group: string;
            version: string;
            kind: string;
            namespace: string;
            name: string;
        };
        manifest: unknown;
    }>;
    resourceEvents(site: ResolvedSite, query: EventQuery, signal?: AbortSignal): Promise<{
        siteId: string;
        application: string;
        count: number;
        events: {
            type: string;
            reason: string;
            message: string;
            count: any;
            firstTimestamp: string;
            lastTimestamp: string;
            involvedObject: {
                kind: string;
                namespace: string;
                name: string;
            };
        }[];
        truncated: boolean;
    }>;
    syncEvents(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal): Promise<unknown>;
    pods(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal): Promise<{
        siteId: string;
        application: string;
        count: number;
        pods: {
            name: string;
            namespace: string;
            health: string;
            phase: string;
            nodeName: string;
            startTime: string;
            ready: string | undefined;
            restarts: number;
            containers: {
                name: string;
                image: string;
                ready: boolean | undefined;
                restartCount: number | undefined;
                requests: unknown;
                limits: unknown;
            }[];
        }[];
    }>;
    listPods(site: ResolvedSite, name: string, appNamespace: string | undefined, signal?: AbortSignal): Promise<{
        siteId: string;
        application: string;
        count: number;
        pods: {
            name: string;
            namespace: string;
            health: string;
            createdAt: string;
        }[];
    }>;
    podLogs(site: ResolvedSite, options: {
        application: string;
        namespace: string;
        podName: string;
        container?: string;
        tailLines: number;
        previous?: boolean;
        appNamespace?: string;
        signal?: AbortSignal;
    }): Promise<{
        siteId: string;
        application: string;
        namespace: string;
        podName: string;
        container: string | undefined;
        tailLines: number;
        truncated: boolean;
        logs: string;
    }>;
    syncApplication(site: ResolvedSite, options: {
        application: string;
        appNamespace?: string;
        revision?: string;
        prune?: boolean;
        dryRun?: boolean;
        signal?: AbortSignal;
    }): Promise<{
        application: string;
        namespace: string;
        sync: string;
        revision: string;
        health: string;
        operationPhase: string;
        operationMessage: string;
        siteId: string;
    }>;
    syncAll(site: ResolvedSite, options: {
        prune?: boolean;
        dryRun?: boolean;
        signal?: AbortSignal;
    }): Promise<{
        siteId: string;
        total: number;
        succeeded: number;
        failed: number;
        results: ({
            application: string;
            ok: boolean;
            sync: string;
            health: string;
            message?: undefined;
        } | {
            application: string;
            ok: boolean;
            message: string;
            sync?: undefined;
            health?: undefined;
        })[];
    }>;
    deleteResource(site: ResolvedSite, query: ResourceQuery & {
        force?: boolean;
        orphan?: boolean;
    }, signal?: AbortSignal): Promise<{
        siteId: string;
        application: string;
        deleted: {
            group: string;
            version: string;
            kind: string;
            namespace: string;
            name: string;
        };
    }>;
    private application;
    private resourceNodes;
    private tryManifest;
    private tokenFor;
    private createSession;
    private userInfo;
    private json;
    private text;
}
interface ResourceQuery {
    application: string;
    appNamespace?: string;
    namespace: string;
    name: string;
    version: string;
    kind: string;
    group?: string;
}
interface EventQuery {
    application: string;
    appNamespace?: string;
    namespace?: string;
    name?: string;
    uid?: string;
}
export {};
