import { FirebaseError } from './errors';
import type { Context } from './types';

const IDENTITY_TOOLKIT_BASE = 'https://identitytoolkit.googleapis.com/v1';
export const SCOPE_IDENTITY = 'https://www.googleapis.com/auth/identitytoolkit';

/**
 * 'admin'  -> project-scoped endpoint, authenticated with the service account
 * 'apiKey' -> public endpoint, authenticated with the web API key
 */
export function createIdentityClient(ctx: Context) {
  async function call<T = any>(
    path: string,
    body: Record<string, any>,
    auth: 'admin' | 'apiKey'
  ): Promise<T> {
    let url: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (auth === 'admin') {
      headers['Authorization'] = `Bearer ${await ctx.getAccessToken(SCOPE_IDENTITY)}`;
      url = `${IDENTITY_TOOLKIT_BASE}/projects/${ctx.projectId}${path}`;
    } else {
      url = `${IDENTITY_TOOLKIT_BASE}${path}?key=${encodeURIComponent(ctx.apiKey)}`;
    }

    const res = await ctx.fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const raw: string =
        data.error?.message || `Identity Toolkit request failed (${res.status})`;
      throw new FirebaseError(raw.split(' : ')[0].trim(), raw, res.status);
    }
    return data as T;
  }

  async function lookupUser(query: { localId?: string[]; email?: string[] }) {
    const data = await call<any>('/accounts:lookup', query, 'admin');
    return (data.users?.[0] as any) ?? null;
  }

  return { call, lookupUser };
}
