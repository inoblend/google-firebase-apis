export function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----(BEGIN|END)[A-Z ]*-----/g, '').replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Firestore-style random ID (default 20 chars, URL/path safe, unbiased). */
export function generateDocId(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const limit = 256 - (256 % chars.length);
  let id = '';
  while (id.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && id.length < length) id += chars[byte % chars.length];
    }
  }
  return id;
}

export function encodeDocPath(collection: string, docId?: string): string {
  return [...collection.split('/'), docId].filter(Boolean).map(p => encodeURIComponent(p!)).join('/');
}
