import { FirebaseError } from './errors';
import type { Context } from './types';
import { encodeDocPath } from './utils';

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';
const SCOPE_DATASTORE = 'https://www.googleapis.com/auth/datastore';

/** Field paths with special characters must be wrapped in backticks. */
function toFieldPath(key: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
    ? key
    : '`' + key.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';
}

function encodeFields(data: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue; // Firestore has no `undefined`
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

export function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'bigint') return { integerValue: value.toString() };
  if (typeof value === 'number') {
    return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } };
  }
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

export function fromFirestoreValue(v: any): any {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  return v.referenceValue ?? v.bytesValue ?? v.geoPointValue ?? null;
}

function decodeFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
  return out;
}

export function createFirestore(ctx: Context) {
  async function request(url: string, init: RequestInit, fallback: string): Promise<Response> {
    const token = await ctx.getAccessToken(SCOPE_DATASTORE);
    const res = await ctx.fetchFn(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok && res.status !== 404) {
      const err: any = await res.json().catch(() => ({}));
      throw new FirebaseError(
        err.error?.status || 'FIRESTORE_ERROR',
        err.error?.message || fallback,
        res.status
      );
    }
    return res;
  }

  const docsBase = `${FIRESTORE_BASE}/projects/${ctx.projectId}/databases/(${ctx.databaseName})/documents`;

  /**
   * Default: replaces the whole document.
   * With `{ merge: true }`: only the provided top-level fields are written
   * (the document is created if missing).
   */
  async function set(
    collection: string,
    docId: string,
    data: Record<string, any>,
    options: { merge?: boolean } = {}
  ): Promise<void> {
    const fields = encodeFields(data);

    let query = '';
    if (options.merge) {
      const keys = Object.keys(fields);
      if (keys.length === 0) return; // empty mask would be a full replace
      query =
        '?' +
        keys
          .map((k) => `updateMask.fieldPaths=${encodeURIComponent(toFieldPath(k))}`)
          .join('&');
    }

    const res = await request(
      `${docsBase}/${encodeDocPath(collection, docId)}${query}`,
      { method: 'PATCH', body: JSON.stringify({ fields }) },
      'Firestore write failed'
    );
    if (res.status === 404) throw new FirebaseError('NOT_FOUND', 'Firestore write failed', 404);
  }

  /**
   * Merges `data` into the document (creating it if needed) in one atomic commit.
   * `increments: { field: n }` atomically adds n to a numeric field.
   */
  async function update(
    collection: string,
    docId: string,
    data: Record<string, any> = {},
    options: { increments?: Record<string, number> } = {}
  ): Promise<void> {
    const fields = encodeFields(data);
    const updateTransforms = Object.entries(options.increments ?? {}).map(
      ([field, amount]) => ({
        fieldPath: toFieldPath(field),
        increment: Number.isInteger(amount)
          ? { integerValue: String(amount) }
          : { doubleValue: amount },
      })
    );

    const write: Record<string, any> = {
      update: {
        name: `projects/${ctx.projectId}/databases/(${ctx.databaseName})/documents/${collection}/${docId}`,
        fields,
      },
      // Explicit mask: only touch the listed fields, never replace the document
      updateMask: { fieldPaths: Object.keys(fields).map(toFieldPath) },
    };
    if (updateTransforms.length) write.updateTransforms = updateTransforms;

    await request(
      `${docsBase}:commit`,
      { method: 'POST', body: JSON.stringify({ writes: [write] }) },
      'Firestore update failed'
    );
  }

  /** Returns the decoded document data, or null if it doesn't exist. */
  async function get<T = Record<string, any>>(
    collection: string,
    docId: string
  ): Promise<T | null> {
    const res = await request(
      `${docsBase}/${encodeDocPath(collection, docId)}`,
      { method: 'GET' },
      'Firestore read failed'
    );
    if (res.status === 404) return null;
    const doc: any = await res.json();
    return decodeFields(doc.fields ?? {}) as T;
  }

  /** Returns list of the decoded document data, or an empty.
   * - Max records of 500 per request
  */
  async function list<T = Array<Record<string, unknown>>>(
    collection: string,
    query: {
      field?: string,
      value?: unknown,
      limit?: number,
      orderBy?: string,
      direction?: "ASCENDING" | "DESCENDING"
      op?: "IN" | "EQUAL" | "NOT_EQUAL" | "LESS_THAN" | "LESS_THAN_OR_EQUAL" | "GREATER_THAN" | "GREATER_THAN_OR_EQUAL" | "ARRAY_CONTAINS"
    } = {}
  ): Promise<T | null> {

    query.limit = query.limit || 100
    const structureQuery: any = {
      limit: Math.min(query.limit, 500),
      from: [
        { collectionId: collection }
      ]
    }

    // filters
    if (query.field && query.op) {
      structureQuery.where = {
        fieldFilter: {
          op: query.op,
          value: toFirestoreValue(query.value),
          field: {
            fieldPath: query.field,
          }
        }
      }
    }

    // Order By settings
    if (query.orderBy) {
      const direction = query.direction ?? "ASCENDING"
      structureQuery.orderBy = [
        {
          direction,
          field: {
            fieldPath: query.orderBy,
          },
        }
      ]
    }

    // execute the req
    const res = await request(
      `${docsBase}:runQuery`,
      { method: 'POST', body: JSON.stringify({ structureQuery }) },
      'Firestore document query failed'
    );
    if (!res.ok) throw new FirebaseError("QUERY_FAILED", `Failed to perform firestore query of collection ${collection}`);

    const rows: any[] = await res.json()
    return rows.filter(r => r.document)
      .map(r => ({
        ...decodeFields(r.document.fields || {}),
        id: r.document.name.split("/").pop(),
      })) as T
  }

  /** Deleting a missing document is a no-op. */
  async function remove(collection: string, docId: string): Promise<void> {
    await request(
      `${docsBase}/${encodeDocPath(collection, docId)}`,
      { method: 'DELETE' },
      'Firestore delete failed'
    );
  }

  return { set, update, get, list, delete: remove };
}

export type FirestoreApi = ReturnType<typeof createFirestore>;
