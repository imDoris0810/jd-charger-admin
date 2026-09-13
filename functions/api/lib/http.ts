/** 统一 JSON 响应 */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400)
}

export function notFound(message: string): Response {
  return json({ error: message }, 404)
}

export function conflict(message: string): Response {
  return json({ error: message }, 409)
}

export function serverError(message: string): Response {
  return json({ error: message }, 500)
}

/** 读取并解析 JSON 请求体；解析失败返回 null（由调用方决定如何报错） */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
