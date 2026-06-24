let apiSessionToken: string | null = null

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')

  if (isMutableRequest(method)) {
    headers.set('x-pam-session', await getApiSessionToken())
  }

  const response = await fetch(path, {
    ...init,
    headers,
  })
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new ApiError(body.error ?? `Request failed: ${response.status}`, response.status, body)
  }
  return body
}

async function getApiSessionToken(): Promise<string> {
  if (apiSessionToken) return apiSessionToken

  const response = await fetch('/api/session')
  const body = (await response.json()) as { token?: string; error?: string }
  if (!response.ok || !body.token) {
    throw new Error(body.error ?? 'PAM session token unavailable.')
  }
  apiSessionToken = body.token
  return apiSessionToken
}

function isMutableRequest(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE'
}
