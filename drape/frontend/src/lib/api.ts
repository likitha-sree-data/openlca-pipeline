export class ApiError extends Error {
  status: number
  fields?: Record<string, string>
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

let tokenGetter: () => Promise<string | null> = async () => null
let onUnauthorized: () => void = () => {}

export function configureApi(getter: () => Promise<string | null>, unauthorized: () => void) {
  tokenGetter = getter
  onUnauthorized = unauthorized
}

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const token = await tokenGetter()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: payload, ...init })
  } catch {
    throw new ApiError('Drape could not reach the server. Check your connection and try again.', 0)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const d = data as { detail?: unknown; fields?: Record<string, string> } | null
    const msg = typeof d?.detail === 'string' ? d.detail : `The server answered with status ${res.status}. Try again in a moment.`
    if (res.status === 401) onUnauthorized()
    throw new ApiError(msg, res.status, d?.fields)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  blob: async (path: string): Promise<Blob> => {
    const token = await tokenGetter()
    const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new ApiError('The download could not be prepared. Try again.', res.status)
    return res.blob()
  },
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong. Try again.'
}
