/// <reference types="../worker-configuration.d.ts" />

interface Env {
  DB: D1Database;
  ROOM: DurableObjectNamespace;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
}
