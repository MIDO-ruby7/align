import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema/index";

export function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? "http://localhost:5173",
    emailAndPassword: {
      enabled: true,
    },
    // V-3: Cloudflare Workers では BETTER_AUTH_URL が未設定でも
    // Secure フラグを確実に付与する。
    advanced: {
      useSecureCookies: true,
    },
    // V-1: Cloudflare Workers では NODE_ENV が設定されないため
    // better-auth のデフォルト判定が OFF になる。明示的に有効化する。
    // TODO: Workers isolate 間でキャッシュが共有されないため、
    //       本番スケールアップ時は D1 または KV をストレージに指定すること。
    rateLimit: {
      enabled: true,
      window: 60, // 秒
      max: 10, // 全エンドポイント共通
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
  });
}
