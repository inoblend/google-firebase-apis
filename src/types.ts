export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Return true if sent. Throwing or returning false never breaks the calling flow. */
export type EmailSender = (message: EmailMessage) => Promise<boolean | void>;

export interface FirebaseConfig {
  projectId: string;
  clientEmail: string;
  /** PEM private key. Escaped "\n" sequences and wrapping quotes are handled. */
  privateKey: string;
  privateKeyId: string;
  /** Web API key (used for public Identity Toolkit endpoints). */
  apiKey: string;
  /** Firestore database name. Default: "default" */
  databaseName?: string;
  /** Firestore collection holding user profile docs. Default: "users" */
  usersCollection?: string;
  /** Used by auth.resetPasswordUser to notify the user. Optional. */
  emailSender?: EmailSender;
  /** Custom fetch implementation (testing / proxies). Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/** @internal */
export interface Context {
  projectId: string;
  apiKey: string;
  databaseName?: string /** Firestore DB - if left empty (default) is used */
  usersCollection: string;
  fetchFn: typeof fetch;
  getAccessToken(scope: string): Promise<string>;
}
