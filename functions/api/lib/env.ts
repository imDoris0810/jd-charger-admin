/** Cloudflare Workers 环境绑定（对应 wrangler.toml 的 [[d1_databases]]） */
export interface Env {
  DB: D1Database
}
