import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

// Firebase web configuration is public. Production deployments can override it
// with Vercel environment variables; the checked-in applet config remains a
const metaEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string> }).env
    : undefined;

const firebaseConfig = {
  ...appletConfig,
  apiKey: metaEnv?.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: metaEnv?.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: metaEnv?.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  appId: metaEnv?.VITE_FIREBASE_APP_ID || appletConfig.appId,
  storageBucket: metaEnv?.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId:
    metaEnv?.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  measurementId: metaEnv?.VITE_FIREBASE_MEASUREMENT_ID || appletConfig.measurementId
};

const databaseId =
  metaEnv?.VITE_FIREBASE_DATABASE_ID || (appletConfig as Record<string, any>).firestoreDatabaseId || '(default)';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        }),
        experimentalAutoDetectLongPolling: true
      },
      databaseId
    );
  } catch {
    return getFirestore(app, databaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/contacts');
googleProvider.addScope('https://www.googleapis.com/auth/contacts.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/user.emails.read');
googleProvider.addScope('https://www.googleapis.com/auth/user.phonenumbers.read');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isTransientFirestoreError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code || '';
  const lower = msg.toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'aborted' ||
    code === 'deadline-exceeded' ||
    lower.includes('code=unavailable') ||
    lower.includes('the client is offline') ||
    lower.includes('could not reach cloud firestore backend')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      return false;
    }
    // Permission denied / not found still confirms live network reachability to Firestore server
    return true;
  }
}

if (typeof window !== 'undefined') {
  void testFirestoreConnection();
}
