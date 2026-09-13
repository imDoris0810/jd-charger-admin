import type { Env } from './lib/env'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

// 全局中间件：处理 CORS 与 OPTIONS 预检（本地开发前后端跨域）
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  const response = await context.next()
  const cloned = new Response(response.body, response)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    cloned.headers.set(key, value)
  }
  return cloned
}
