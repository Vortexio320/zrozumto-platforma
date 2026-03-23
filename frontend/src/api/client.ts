let onUnauthorized: () => void = () => {};

export function configureApi(opts: { onUnauthorized: () => void }) {
  onUnauthorized = opts.onUnauthorized;
}

const CREDENTIALS: RequestCredentials = 'include';

async function fetchWithRetry(path: string, options: RequestInit): Promise<Response> {
  const opts = { ...options, credentials: CREDENTIALS };
  let res = await fetch(path, opts);
  const shouldRetry =
    res.status === 401 &&
    !path.includes('/auth/login') &&
    !path.includes('/auth/refresh');
  if (shouldRetry) {
    const refreshRes = await fetch('/auth/refresh', {
      method: 'POST',
      credentials: CREDENTIALS,
    });
    if (refreshRes.ok) {
      res = await fetch(path, opts);
    }
  }
  return res;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    onUnauthorized();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(path, {});
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetchWithRetry(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPostForm<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetchWithRetry(path, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetchWithRetry(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(path, { method: 'DELETE' });
  return handleResponse<T>(res);
}

export async function loginApi(
  username: string,
  password: string,
): Promise<{
  access_token: string;
  user: {
    id: string;
    username: string;
    role: string;
    full_name?: string;
    school_type?: 'liceum' | 'podstawowka';
    class?: string;
  };
}> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: CREDENTIALS,
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Błąd logowania' }));
    throw new Error(data.detail || 'Błąd logowania');
  }
  return res.json();
}

export async function logoutApi(): Promise<void> {
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: CREDENTIALS,
  });
}

export async function authMe(): Promise<{
  id: string;
  username: string;
  role: string;
  full_name?: string;
  school_type?: 'liceum' | 'podstawowka';
  class?: string;
} | null> {
  const res = await fetch('/auth/me', { credentials: CREDENTIALS });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to fetch auth');
  return res.json();
}
