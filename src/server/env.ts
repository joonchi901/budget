export interface Env {
  DB: D1Database;
  COLLABORATION: DurableObjectNamespace;
  ASSETS?: Fetcher;
  DEMO_MODE?: string;
  APP_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_ALLOWED_EMAILS?: string;
}
