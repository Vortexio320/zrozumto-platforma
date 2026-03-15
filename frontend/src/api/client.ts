let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(opts: {
  getToken: () => string | null;
  onUnauthorized: () => void;
}) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const res = await fetch(path, { headers: authHeaders() });
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPostForm<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: authHeaders(),
  });
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
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Błąd logowania' }));
    throw new Error(data.detail || 'Błąd logowania');
  }
  return res.json();
}
