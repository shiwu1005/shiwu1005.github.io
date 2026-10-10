interface SiteAction {
    name: string;
    arguments?: Record<string, unknown>;
}
declare function buildSiteContext(): Promise<Record<string, unknown>>;
declare function executeActions(actions: SiteAction[]): Promise<string[]>;
export { buildSiteContext, executeActions };
export type { SiteAction };
