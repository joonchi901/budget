export interface Env {
  DB: D1Database;
  COLLABORATION: DurableObjectNamespace;
  ASSETS?: Fetcher;
  DEMO_MODE?: string;
}
