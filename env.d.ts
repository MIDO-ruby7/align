// Augment the generated Env interfaces with runtime secrets managed via
// `wrangler secret put` (never stored in wrangler.toml or committed).

interface __BaseEnv_Env {
  /** better-auth signing secret – set via `wrangler secret put BETTER_AUTH_SECRET` */
  BETTER_AUTH_SECRET: string;
}

interface Env {
  /** better-auth signing secret – set via `wrangler secret put BETTER_AUTH_SECRET` */
  BETTER_AUTH_SECRET: string;
}
