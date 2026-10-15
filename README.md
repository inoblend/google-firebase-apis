# @inoblend/google-firebase-apis

Firebase Auth + Firestore admin utilities over plain REST. **Zero dependencies**, using standard `fetch` and Web Crypto APIs, so it runs on Cloudflare Workers, Vercel Edge, Deno, Bun and Node 20+.

This is a **server-side library**. It uses service-account credentials with administrative access; never bundle its private key into a browser or other untrusted client.

## Install

```bash
npm i @inoblend/google-firebase-apis
```

## Usage

```ts
import { createGF, configFromEnv, generateDocId } from '@inoblend/google-firebase-apis';

// Create once per isolate/process and reuse (token + key caches live in the client)
const fb = createGF(configFromEnv(process.env));

const { uid } = await fb.auth.createUser({
  email: 'a@b.com', password: 'secret123', displayName: 'Ada',
  role: 'admin',                    // stored on the Firestore user doc
  claims: { role: 'admin' },        // optional: set as custom claims on the Auth user
});

const decoded = await fb.auth.verifyIdToken(idToken);   // { uid, email, ...claims }
await fb.firestore.set('orders', generateDocId(), { total: 42.5 });
await fb.firestore.set('orders', id, { status: 'paid' }, { merge: true });
const order = await fb.firestore.get('orders', id);     // decoded data or null
```

### Cloudflare Workers

```ts
let fb: FirebaseClient | undefined;
export default {
  async fetch(req: Request, env: Env) {
    fb ??= createGF(configFromEnv(env as any));
    // ...
  },
};
```

### Config

| Option | Notes |
|---|---|
| `projectId`, `clientEmail`, `privateKey`, `privateKeyId` | From your service account JSON. `\n` escapes in the key are handled. |
| `apiKey` | Web API key (public Identity Toolkit endpoints). |
| `usersCollection` | Default `"users"`. |
| `emailSender` | `(msg) => Promise<boolean>`. Use `resendEmailSender({ apiKey, from })` or your own. |
| `fetchFn` | Optional custom fetch implementation. |

`configFromEnv` reads `GF_PROJECT_ID`, `GF_CLIENT_EMAIL`, `GF_PRIVATE_KEY_ID`, `GF_PRIVATE_KEY`, `GF_API_KEY`, and optionally `GF_RESEND_API_KEY` + `GF_RESEND_EMAIL_FROM`.

## API

**`fb.auth`**: `verifyIdToken`, `createUser`, `updateUser`, `setCustomUserClaims`, `disableUser`, `deleteUserPermanent`, `resetUserPassword`, `requestPasswordReset`, `verifyPasswordResetCode`, `confirmPasswordReset`

**`fb.firestore`**: `set` (replace or `{ merge: true }`), `update` (partial + atomic `increments`), `get`, `list` (single filtered/ordered query; up to 500 documents), `listPage` (filtered/ordered cursor pagination; pass each `nextPageToken` as `pageToken`), `delete`

Errors are thrown as `FirebaseError` with a `.code` (`EMAIL_EXISTS`, `WEAK_PASSWORD`, `USER_NOT_FOUND`, `INVALID_ID_TOKEN`, `USER_DISABLED`, ...).

## Firestore user doc fields

`email, displayName, phoneNumber, role, disabled, disabledAt, passwordResetCount, passwordResetAt, passwordResetLinkSentAt, passwordResetLinkVerifiedAt, passwordResetConfirmedAt, createdAt, updatedAt`. Timestamps are epoch milliseconds (numbers).

## Runtime compatibility checks

CI checks Node.js 20, 22 and 24, and runs a dependency-free smoke test against the built package on Node.js, Deno and Bun. Run the Node.js smoke test locally with `pnpm run test:runtime`.
