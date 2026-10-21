import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { PublicUser } from '@gyeol/contracts';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/v1';
const native = () => Capacitor.isNativePlatform();
const storageKey = 'gyeol.refresh.v1';
type Session = { user: PublicUser; accessToken: string; refreshToken?: string };
let accessToken = '';
let refreshInFlight: Promise<Session> | null = null;
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(`${API}/${path}`, {
      ...init,
      headers,
      credentials: native() ? 'omit' : 'include',
      signal: AbortSignal.timeout(path.endsWith('/enrich') ? 30000 : 15000),
    });
  } catch {
    throw new RequestError('서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.', 0);
  }
  if (response.status === 401 && retry && !path.startsWith('auth/')) {
    try {
      await refresh();
      return api<T>(path, init, false);
    } catch {
      accessToken = '';
      throw new RequestError('다시 로그인해 주세요.', 401);
    }
  }
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(data.message || '요청을 처리하지 못했어요.', response.status);
  return data as T;
}
async function accept(session: Session) {
  if (native() && session.refreshToken) {
    try {
      await SecureStorage.set(storageKey, session.refreshToken);
    } catch {
      await api(
        'auth/native/logout',
        { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) },
        false,
      ).catch(() => {});
      accessToken = '';
      throw new RequestError('기기 보안 저장소에 세션을 저장할 수 없어요.', 0);
    }
  }
  accessToken = session.accessToken;
  return session;
}
export async function refresh() {
  refreshInFlight ??= (async () => {
    if (native()) {
      const refreshToken = await SecureStorage.get(storageKey, false);
      if (typeof refreshToken !== 'string') throw new RequestError('로그인이 필요합니다.', 401);
      try {
        return await accept(
          await api<Session>(
            'auth/native/refresh',
            { method: 'POST', body: JSON.stringify({ refreshToken }) },
            false,
          ),
        );
      } catch (error) {
        if (error instanceof RequestError && error.status === 401)
          await SecureStorage.remove(storageKey);
        throw error;
      }
    }
    return accept(await api<Session>('auth/refresh', { method: 'POST' }, false));
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
export async function createSession(mode: 'register' | 'login', body: Record<string, unknown>) {
  return accept(
    await api<Session>(
      `auth/${native() ? 'native/' : ''}${mode}`,
      { method: 'POST', body: JSON.stringify(body) },
      false,
    ),
  );
}
export async function endSession() {
  if (native()) {
    const refreshToken = await SecureStorage.get(storageKey, false);
    if (typeof refreshToken === 'string')
      await api(
        'auth/native/logout',
        { method: 'POST', body: JSON.stringify({ refreshToken }) },
        false,
      );
    await SecureStorage.remove(storageKey);
  } else await api('auth/logout', { method: 'POST' }, false);
  accessToken = '';
}
