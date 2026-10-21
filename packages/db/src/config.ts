export type DatabaseConfig = {
  DATABASE_URL: string;
  DATABASE_URL_DIRECT?: string;
  NODE_ENV?: string;
  /** Max live connections the main pool may hold. Defaults to 5. */
  DB_POOL_MAX?: number | string;
  /** Max live connections the waitlist pool may hold. Defaults to 2. */
  DB_WAITLIST_POOL_MAX?: number | string;
  /** How long to wait for a connection. Defaults to 15000ms. */
  DB_CONNECT_TIMEOUT_MS?: number | string;
  /** Bounded connect retries at boot. Defaults to 6. */
  DB_CONNECT_RETRIES?: number | string;
};
