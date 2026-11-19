import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { decryptPayload, deriveRoomKeyFromSeed, encryptPayload, type IdentityKeys } from '../lib/crypto';
import {
  buildChannelInviteCode,
  filterActiveStatuses,
  isStatusExpired,
  MAX_STATUS_MEDIA_BYTES,
  MAX_STATUS_VIDEO_SECONDS,
  mergePollVotesMap,
  normalizeWasilId,
  resolveMessageReceiptStatus,
  STATUS_TTL_MS,
  suggestWasilIdFromName,
  validateWasilId
} from '../lib/chatLogic';
import { isDeviceSessionActive } from '../lib/deviceSession';
import type {
  CallRecord,
  ChatRoom,
  DecryptedMessage,
  DeviceSession,
  MessagePayload,
  MessageType,
  PrivacySettings,
  StatusItem,
  ThemeMode,
  UserProfile,
  VisibilityScope,
  ScheduledMessage
} from '../types/chat';

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

function sanitizePublicKeyJwk(value?: string | null): string {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  if (cleaned.length >= 20 && cleaned.includes('"kty"')) {
    return cleaned.slice(0, 1024);
  }
  return '';
}

export interface HydratedUserAccount {
  wasilId: string;
  displayName: string;
  about: string;
  avatarUrl: string;
  privacy: PrivacySettings;
  theme: ThemeMode;
  identityKeys?: IdentityKeys;
}

export async function checkWasilIdAvailability(
  desiredRaw: string,
  myUid?: string
): Promise<{ available: boolean; normalized: string; error?: string; uncertain?: boolean }> {
  const validation = validateWasilId(desiredRaw);
  if (!validation.valid) {
    return {
      available: false,
      normalized: validation.normalized,
      error: validation.error
    };
  }
  const normalized = validation.normalized;
  const bare = normalized.slice(1);
  try {
    const [atSnap, bareSnap] = await Promise.all([
      getDoc(doc(db, 'wasil_registry', normalized)),
      getDoc(doc(db, 'wasil_registry', bare))
    ]);
    const takenByOther =
      (atSnap.exists() && Boolean(atSnap.data().uid) && atSnap.data().uid !== myUid) ||
      (bareSnap.exists() && Boolean(bareSnap.data().uid) && bareSnap.data().uid !== myUid);

    if (takenByOther) {
      return {
        available: false,
        normalized,
        error: 'هذا المعرّف محجوز لمستخدم آخر بالفعل.'
      };
    }
    return { available: true, normalized };
  } catch {
    return {
      available: false,
      normalized,
      uncertain: true,
      error: 'تعذر التحقق من الخادم الآن بسبب تذبذب الاتصال.'
    };
  }
}

export async function claimCustomWasilId(
  uid: string,
  displayName: string,
  desiredRaw: string,
  oldWasilId?: string
): Promise<string> {
  const validation = validateWasilId(desiredRaw);
  if (!validation.valid) {
    throw new Error(validation.error || 'صيغة المعرّف غير صالحة.');
  }

  const normalized = validation.normalized;
  const bare = normalized.slice(1);
  const safeName = (displayName || 'مستخدم تواصل').trim().slice(0, 80) || 'مستخدم تواصل';

  const atRef = doc(db, 'wasil_registry', normalized);
  const bareRef = doc(db, 'wasil_registry', bare);
  const pubRef = doc(db, 'users', uid, 'public', 'profile');
  const privRef = doc(db, 'users', uid, 'private', 'info');

  await runTransaction(db, async (tx) => {
    const [atSnap, bareSnap, pubSnap, privSnap] = await Promise.all([
      tx.get(atRef),
      tx.get(bareRef),
      tx.get(pubRef),
      tx.get(privRef)
    ]);

    const takenByOther =
      (atSnap.exists() && Boolean(atSnap.data().uid) && atSnap.data().uid !== uid) ||
      (bareSnap.exists() && Boolean(bareSnap.data().uid) && bareSnap.data().uid !== uid);

    if (takenByOther) {
      throw new Error('هذا المعرّف محجوز لمستخدم آخر بالفعل. اختر معرّفاً مختلفاً.');
    }

    const prevWasil =
      oldWasilId || (pubSnap.exists() ? (pubSnap.data().wasilId as string | undefined) : undefined);

    if (prevWasil && prevWasil.toLowerCase() !== normalized) {
      const oldNorm = prevWasil.toLowerCase();
      tx.delete(doc(db, 'wasil_registry', oldNorm));
      if (oldNorm.startsWith('@')) {
        tx.delete(doc(db, 'wasil_registry', oldNorm.slice(1)));
      }
    }

    const registryData = {
      uid,
      wasilId: normalized,
      displayName: safeName,
      updatedAt: serverTimestamp()
    };

    tx.set(atRef, registryData);
    tx.set(bareRef, registryData);

    if (pubSnap.exists()) {
      tx.update(pubRef, {
        wasilId: normalized,
        updatedAt: serverTimestamp()
      });
    }
    if (privSnap.exists()) {
      tx.update(privRef, {
        wasilId: normalized,
        updatedAt: serverTimestamp()
      });
    }
  });

  return normalized;
}

export async function syncUserProfileToFirestore(
  user: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    phoneNumber?: string | null;
  },
  publicKeyJwk: string,
  safetyCode: string,
  about = 'متاح · رسائلي مشفرة تماماً',
  theme: ThemeMode = 'light',
  preferredWasilId?: string,
  privateKeyJwk?: string
): Promise<HydratedUserAccount> {
  const pubRef = doc(db, 'users', user.uid, 'public', 'profile');
  const privRef = doc(db, 'users', user.uid, 'private', 'info');

  const fallbackName = (
    user.displayName ||
    user.email?.split('@')[0] ||
    user.phoneNumber ||
    'مستخدم تواصل'
  ).slice(0, 80);

  const preferredValidation = preferredWasilId ? validateWasilId(preferredWasilId) : null;
  const validPreferredId = preferredValidation?.valid ? preferredValidation.normalized : '';

  try {
    // Parallel reads cut initial login sync latency in half
    const [pubSnap, privSnap] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
    const existingPub = pubSnap.exists() ? pubSnap.data() : null;
    const existingPriv = privSnap.exists() ? privSnap.data() : null;

    const displayName = (
      (existingPub?.displayName as string) ||
      fallbackName
    ).slice(0, 80);
    const resolvedAbout =
      typeof existingPub?.about === 'string' ? existingPub.about.slice(0, 200) : about.slice(0, 200);
    const avatarUrl = (
      typeof existingPub?.avatarUrl === 'string' ? existingPub.avatarUrl : user.photoURL || ''
    ).slice(0, 65536);

    const safeLocalPublicKey = sanitizePublicKeyJwk(publicKeyJwk);
    if (!safeLocalPublicKey) {
      throw new Error('Missing publicKeyJwk for authenticated user.');
    }

    // Multi-device key continuity: if private/info already holds an authoritative E2EE keypair, adopt it
    const cloudPubKey = sanitizePublicKeyJwk(existingPriv?.identityPublicKeyJwk as string | undefined);
    const cloudPrivKey =
      typeof existingPriv?.identityPrivateKeyJwk === 'string' &&
      existingPriv.identityPrivateKeyJwk.length >= 20
        ? existingPriv.identityPrivateKeyJwk.slice(0, 1024)
        : '';
    const cloudSafetyCode =
      typeof existingPriv?.identitySafetyCode === 'string' &&
      existingPriv.identitySafetyCode.length >= 10
        ? existingPriv.identitySafetyCode.slice(0, 120)
        : '';

    const hasCloudIdentityKeys = Boolean(cloudPubKey && cloudPrivKey && cloudSafetyCode);
    const safePublicKey = hasCloudIdentityKeys ? cloudPubKey : safeLocalPublicKey;
    const resolvedPrivateKey = hasCloudIdentityKeys
      ? cloudPrivKey
      : (privateKeyJwk || '').slice(0, 1024);
    const resolvedSafetyCode = hasCloudIdentityKeys
      ? cloudSafetyCode
      : safetyCode.slice(0, 120);

    const existingWasilRaw =
      (existingPriv?.wasilId as string) || (existingPub?.wasilId as string) || '';
    const existingValid = existingWasilRaw ? validateWasilId(existingWasilRaw) : null;

    let wasilId = validPreferredId || (existingValid?.valid ? existingValid.normalized : '');
    if (!wasilId) {
      let candidate = suggestWasilIdFromName(displayName, user.uid.slice(-4));
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const check = await checkWasilIdAvailability(candidate, user.uid);
        if (check.available || check.uncertain) {
          wasilId = check.normalized;
          break;
        }
        candidate = suggestWasilIdFromName(displayName);
      }
      if (!wasilId) {
        wasilId = suggestWasilIdFromName('wasil');
      }
    }
    const bareId = wasilId.startsWith('@') ? wasilId.slice(1) : wasilId;

    const defaultPrivacy: PrivacySettings = {
      readReceipts: true,
      lastSeenMode: 'everyone',
      profilePhotoVisibility: 'everyone',
      bioVisibility: 'everyone'
    };

    const registryPayload = {
      uid: user.uid,
      wasilId,
      displayName,
      updatedAt: serverTimestamp()
    };

    // Atomic batch commit ensures public profile, private info, and wasil_registry stay synchronized
    const batch = writeBatch(db);
    batch.set(doc(db, 'wasil_registry', wasilId), registryPayload);
    batch.set(doc(db, 'wasil_registry', bareId), registryPayload);
    batch.set(
      pubRef,
      {
        uid: user.uid,
        wasilId,
        displayName,
        about: resolvedAbout,
        avatarUrl,
        publicKeyJwk: safePublicKey,
        safetyCode: resolvedSafetyCode,
        isOnline: true,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: false }
    );

    if (!privSnap.exists()) {
      batch.set(privRef, {
        uid: user.uid,
        wasilId,
        email: (user.email || `${user.uid}@wasil.app`).slice(0, 160),
        phone: (user.phoneNumber || '').slice(0, 32),
        theme,
        readReceipts: defaultPrivacy.readReceipts,
        lastSeenVisible: true,
        lastSeenMode: defaultPrivacy.lastSeenMode,
        profilePhotoVisibility: defaultPrivacy.profilePhotoVisibility,
        bioVisibility: defaultPrivacy.bioVisibility,
        identityPublicKeyJwk: safePublicKey,
        ...(resolvedPrivateKey ? { identityPrivateKeyJwk: resolvedPrivateKey } : {}),
        identitySafetyCode: resolvedSafetyCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const privUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp()
      };
      let needsPrivUpdate = false;
      if (existingPriv?.wasilId !== wasilId) {
        privUpdates.wasilId = wasilId;
        needsPrivUpdate = true;
      }
      if (!hasCloudIdentityKeys && resolvedPrivateKey) {
        privUpdates.identityPublicKeyJwk = safePublicKey;
        privUpdates.identityPrivateKeyJwk = resolvedPrivateKey;
        privUpdates.identitySafetyCode = resolvedSafetyCode;
        needsPrivUpdate = true;
      }
      if (needsPrivUpdate) {
        batch.update(privRef, privUpdates);
      }
    }

    await batch.commit();

    const privData = existingPriv || {};
    const hydratedPrivacy: PrivacySettings = {
      readReceipts: typeof privData.readReceipts === 'boolean' ? privData.readReceipts : true,
      lastSeenMode: (privData.lastSeenMode as VisibilityScope) || 'everyone',
      profilePhotoVisibility: (privData.profilePhotoVisibility as VisibilityScope) || 'everyone',
      bioVisibility: (privData.bioVisibility as VisibilityScope) || 'everyone'
    };

    const hydratedKeys: IdentityKeys | undefined =
      safePublicKey && resolvedPrivateKey
        ? {
            publicKeyJwk: safePublicKey,
            privateKeyJwk: resolvedPrivateKey,
            safetyCode: resolvedSafetyCode
          }
        : undefined;

    return {
      wasilId,
      displayName,
      about: resolvedAbout,
      avatarUrl,
      privacy: hydratedPrivacy,
      theme: privData.theme === 'dark' ? 'dark' : 'light',
      ...(hydratedKeys ? { identityKeys: hydratedKeys } : {})
    };
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    const lower = errStr.toLowerCase();
    if (
      lower.includes('offline') ||
      lower.includes('unavailable') ||
      lower.includes('failed to get document') ||
      lower.includes('permission')
    ) {
      console.warn('Firestore local fallback for syncUserProfileToFirestore:', errStr);
      return {
        wasilId: validPreferredId || suggestWasilIdFromName(fallbackName, user.uid.slice(-4)),
        displayName: fallbackName,
        about: about.slice(0, 200),
        avatarUrl: user.photoURL || '',
        privacy: {
          readReceipts: true,
          lastSeenMode: 'everyone',
          profilePhotoVisibility: 'everyone',
          bioVisibility: 'everyone'
        },
        theme
      };
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function registerOrHeartbeatDeviceInFirestore(
  uid: string,
  device: {
    deviceId: string;
    deviceName: string;
    platform: string;
    isOnline: boolean;
  }
): Promise<void> {
  const deviceRef = doc(db, 'users', uid, 'devices', device.deviceId);
  const safeName = device.deviceName.slice(0, 100) || 'Web Browser';
  const safePlatform = device.platform.slice(0, 40) || 'Web';

  try {
    const existing = await getDoc(deviceRef);
    if (existing.exists()) {
      await updateDoc(deviceRef, {
        deviceName: safeName,
        platform: safePlatform,
        isOnline: Boolean(device.isOnline),
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(deviceRef, {
        deviceId: device.deviceId,
        uid,
        deviceName: safeName,
        platform: safePlatform,
        isOnline: Boolean(device.isOnline),
        lastActiveAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch {
    // Non-fatal during transient offline periods
  }
}

async function aggregateMultiDeviceOnlineStatus(
  uid: string,
  hintOnline: boolean,
  excludeDeviceId?: string
): Promise<boolean> {
  if (hintOnline) return true;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'devices'), where('uid', '==', uid))
    );
    const nowMs = Date.now();
    for (const d of snap.docs) {
      const data = d.data({ serverTimestamps: 'estimate' });
      if (excludeDeviceId && data.deviceId === excludeDeviceId) continue;
      if (data.isOnline === true && isDeviceSessionActive(toMillis(data.lastActiveAt), nowMs)) {
        return true;
      }
    }
  } catch {
    // Fall back to hintOnline
  }
  return false;
}

export async function setUserPresenceInFirestore(
  uid: string,
  isOnline: boolean,
  deviceInfo?: { deviceId: string; deviceName: string; platform: string }
): Promise<void> {
  try {
    if (deviceInfo) {
      await registerOrHeartbeatDeviceInFirestore(uid, {
        ...deviceInfo,
        isOnline
      });
    }
    const aggregatedOnline = await aggregateMultiDeviceOnlineStatus(uid, isOnline);
    await updateDoc(doc(db, 'users', uid, 'public', 'profile'), {
      isOnline: aggregatedOnline,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch {
    // Non-fatal on unload/unverified user
  }
}

export async function removeDeviceSessionInFirestore(
  uid: string,
  deviceId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'devices', deviceId));
    const stillOnlineElsewhere = await aggregateMultiDeviceOnlineStatus(uid, false, deviceId);
    await updateDoc(doc(db, 'users', uid, 'public', 'profile'), {
      isOnline: stillOnlineElsewhere,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp()
    }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/devices/${deviceId}`);
  }
}

export function subscribeUserDevicesFromFirestore(
  uid: string,
  onDevices: (devices: DeviceSession[]) => void
): () => void {
  const q = query(collection(db, 'users', uid, 'devices'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DeviceSession[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data({ serverTimestamps: 'estimate' });
        return {
          deviceId: d.deviceId as string,
          uid: d.uid as string,
          deviceName: (d.deviceName as string) || 'جهاز غير معروف',
          platform: (d.platform as string) || 'Web',
          isOnline: Boolean(d.isOnline),
          lastActiveAtMs: toMillis(d.lastActiveAt),
          createdAtMs: toMillis(d.createdAt)
        };
      });
      list.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return b.lastActiveAtMs - a.lastActiveAtMs;
      });
      onDevices(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${uid}/devices`);
    }
  );
}

export function subscribeOwnPublicProfileFromFirestore(
  uid: string,
  onUpdate: (patch: {
    wasilId?: string;
    displayName: string;
    about: string;
    avatarUrl: string;
    publicKeyJwk: string;
    safetyCode: string;
  }) => void
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'public', 'profile'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data({ serverTimestamps: 'estimate' });
      onUpdate({
        ...(typeof d.wasilId === 'string' ? { wasilId: d.wasilId } : {}),
        displayName: (d.displayName as string) || 'مستخدم تواصل',
        about: (d.about as string) || '',
        avatarUrl: (d.avatarUrl as string) || '',
        publicKeyJwk: (d.publicKeyJwk as string) || '',
        safetyCode: (d.safetyCode as string) || ''
      });
    },
    () => {}
  );
}

export function subscribeOwnPrivateInfoFromFirestore(
  uid: string,
  onUpdate: (patch: {
    wasilId?: string;
    theme: ThemeMode;
    privacy: PrivacySettings;
    identityKeys?: IdentityKeys;
  }) => void
): () => void {
  return onSnapshot(
    doc(db, 'users', uid, 'private', 'info'),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data({ serverTimestamps: 'estimate' });
      const pub = sanitizePublicKeyJwk(d.identityPublicKeyJwk as string | undefined);
      const priv =
        typeof d.identityPrivateKeyJwk === 'string' && d.identityPrivateKeyJwk.length >= 20
          ? d.identityPrivateKeyJwk
          : '';
      const code =
        typeof d.identitySafetyCode === 'string' && d.identitySafetyCode.length >= 10
          ? d.identitySafetyCode
          : '';
      onUpdate({
        ...(typeof d.wasilId === 'string' ? { wasilId: d.wasilId } : {}),
        theme: d.theme === 'dark' ? 'dark' : 'light',
        privacy: {
          readReceipts: typeof d.readReceipts === 'boolean' ? d.readReceipts : true,
          lastSeenMode: (d.lastSeenMode as VisibilityScope) || 'everyone',
          profilePhotoVisibility: (d.profilePhotoVisibility as VisibilityScope) || 'everyone',
          bioVisibility: (d.bioVisibility as VisibilityScope) || 'everyone'
        },
        ...(pub && priv && code
          ? {
              identityKeys: {
                publicKeyJwk: pub,
                privateKeyJwk: priv,
                safetyCode: code
              }
            }
          : {})
      });
    },
    () => {}
  );
}

export async function updateProfileInFirestore(
  uid: string,
  currentProfile: UserProfile,
  updates: { displayName: string; about: string; avatarUrl: string; wasilId?: string }
): Promise<void> {
  const pubRef = doc(db, 'users', uid, 'public', 'profile');
  try {
    const safePublicKey = sanitizePublicKeyJwk(currentProfile.publicKeyJwk);
    if (!safePublicKey) {
      throw new Error('Missing publicKeyJwk for updating user profile.');
    }

    const safeName = updates.displayName.slice(0, 80);
    const rawWasil = updates.wasilId || currentProfile.wasilId || '';
    const validWasil = rawWasil ? validateWasilId(rawWasil) : null;
    const normalizedWasil = validWasil?.valid
      ? validWasil.normalized
      : suggestWasilIdFromName(safeName, uid.slice(-4));
    const bare = normalizedWasil.slice(1);

    const regPayload = {
      uid,
      wasilId: normalizedWasil,
      displayName: safeName,
      updatedAt: serverTimestamp()
    };

    // Atomic batch commit keeps users/{uid}/public/profile and wasil_registry consistent
    const batch = writeBatch(db);
    batch.set(doc(db, 'wasil_registry', normalizedWasil), regPayload);
    batch.set(doc(db, 'wasil_registry', bare), regPayload);
    batch.set(pubRef, {
      uid,
      wasilId: normalizedWasil,
      displayName: safeName,
      about: updates.about.slice(0, 200),
      avatarUrl: updates.avatarUrl.slice(0, 65536),
      publicKeyJwk: safePublicKey,
      safetyCode: currentProfile.safetyCode.slice(0, 120),
      isOnline: true,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/public/profile`);
  }
}

export async function updatePrivacySettingsInFirestore(
  uid: string,
  privacy: PrivacySettings
): Promise<void> {
  const privRef = doc(db, 'users', uid, 'private', 'info');
  try {
    await updateDoc(privRef, {
      readReceipts: privacy.readReceipts,
      lastSeenVisible: privacy.lastSeenMode !== 'nobody',
      lastSeenMode: privacy.lastSeenMode,
      profilePhotoVisibility: privacy.profilePhotoVisibility,
      bioVisibility: privacy.bioVisibility,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/private/info`);
  }
}

export async function updateThemePrefInFirestore(uid: string, theme: ThemeMode): Promise<void> {
  const privRef = doc(db, 'users', uid, 'private', 'info');
  try {
    await updateDoc(privRef, {
      theme,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/private/info`);
  }
}

export async function fetchPublicProfileByUid(targetUid: string): Promise<UserProfile | null> {
  const cleaned = (targetUid || '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('@')) {
    return lookupUserByWasilIdOrUid(cleaned);
  }
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(cleaned)) {
    return null;
  }
  try {
    const snap = await getDoc(doc(db, 'users', cleaned, 'public', 'profile'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: d.uid,
      ...(typeof d.wasilId === 'string' ? { wasilId: d.wasilId } : {}),
      displayName: d.displayName,
      about: d.about,
      avatarUrl: d.avatarUrl,
      publicKeyJwk: d.publicKeyJwk,
      safetyCode: d.safetyCode,
      isOnline: Boolean(d.isOnline),
      lastSeenMs: toMillis(d.lastSeen)
    };
  } catch (error) {
    console.warn(`fetchPublicProfileByUid failed for ${cleaned}:`, error);
    return null;
  }
}

export async function createChatInFirestore(
  chatId: string,
  type: 'direct' | 'group' | 'community',
  title: string,
  description: string,
  avatarUrl: string,
  creator: UserProfile,
  initialMessageText: string,
  invitedContacts: UserProfile[] = [],
  options?: { adminOnlyPost?: boolean; inviteCode?: string }
): Promise<void> {
  const batch = writeBatch(db);
  const chatRef = doc(db, 'chats', chatId);
  const myMemberRef = doc(db, 'chats', chatId, 'members', creator.uid);
  const myPrefRef = doc(db, 'users', creator.uid, 'chatPrefs', chatId);
  const msgId = `msg_${Date.now()}`;
  const msgRef = doc(db, 'chats', chatId, 'messages', msgId);

  const creatorPublicKey = sanitizePublicKeyJwk(creator.publicKeyJwk);
  if (!creatorPublicKey) {
    throw new Error('لا يمكن إنشاء محادثة: المفتاح العام للمستخدم غير موجود.');
  }

  const memberIds = Array.from(
    new Set([creator.uid, ...invitedContacts.map((c) => c.uid)])
  ).slice(0, 50);

  const key = await deriveRoomKeyFromSeed(chatId);
  const payload: MessagePayload = { text: initialMessageText };
  const envelope = await encryptPayload(JSON.stringify(payload), key);
  const inviteCode =
    options?.inviteCode ||
    (type !== 'direct' ? buildChannelInviteCode(chatId) : undefined);

  batch.set(chatRef, {
    id: chatId,
    type,
    title: title.slice(0, 100),
    description: description.slice(0, 300),
    avatarUrl: avatarUrl.slice(0, 65536),
    createdBy: creator.uid,
    memberIds,
    ...(typeof options?.adminOnlyPost === 'boolean'
      ? { adminOnlyPost: options.adminOnlyPost }
      : {}),
    ...(inviteCode ? { inviteCode: inviteCode.slice(0, 32) } : {}),
    lastMessageCiphertext: envelope.ciphertext.slice(0, 2048),
    lastMessageIv: envelope.iv,
    lastMessageSenderId: creator.uid,
    lastMessageType: 'text',
    lastMessageDeliveredToIds: [creator.uid],
    lastMessageReadByIds: [creator.uid],
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.set(myMemberRef, {
    chatId,
    uid: creator.uid,
    role: 'admin',
    displayName: creator.displayName.slice(0, 80),
    avatarUrl: creator.avatarUrl.slice(0, 65536),
    publicKeyJwk: creatorPublicKey,
    isTyping: false,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  for (const contact of invitedContacts.slice(0, 49)) {
    if (!contact.uid || contact.uid === creator.uid) continue;
    const contactPublicKey = sanitizePublicKeyJwk(contact.publicKeyJwk);
    if (!contactPublicKey) continue;
    const contactMemberRef = doc(db, 'chats', chatId, 'members', contact.uid);
    batch.set(contactMemberRef, {
      chatId,
      uid: contact.uid,
      role: 'member',
      displayName: contact.displayName.slice(0, 80),
      avatarUrl: (contact.avatarUrl || '').slice(0, 65536),
      publicKeyJwk: contactPublicKey,
      isTyping: false,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  batch.set(myPrefRef, {
    chatId,
    uid: creator.uid,
    pinned: false,
    archived: false,
    muted: false,
    favorite: false,
    unreadCount: 0,
    disappearingSeconds: 0,
    updatedAt: serverTimestamp()
  });

  batch.set(msgRef, {
    id: msgId,
    chatId,
    senderId: creator.uid,
    senderName: creator.displayName.slice(0, 80),
    type: 'text',
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    algorithm: 'AES-GCM-256',
    viewerIds: memberIds,
    deliveredToIds: [creator.uid],
    readByIds: [creator.uid],
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function updateGroupSettingsInFirestore(
  chatId: string,
  title: string,
  description: string,
  avatarUrl: string,
  adminOnlyPost?: boolean
): Promise<void> {
  const path = `chats/${chatId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      title: title.slice(0, 100),
      description: description.slice(0, 300),
      avatarUrl: avatarUrl.slice(0, 65536),
      ...(typeof adminOnlyPost === 'boolean' ? { adminOnlyPost } : {}),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function inviteMemberToGroupInFirestore(
  chatId: string,
  contact: UserProfile,
  updatedMemberIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  const memberRef = doc(db, 'chats', chatId, 'members', contact.uid);
  const chatRef = doc(db, 'chats', chatId);

  const publicKeyJwk = sanitizePublicKeyJwk(contact.publicKeyJwk);
  if (!publicKeyJwk) {
    throw new Error('لا يمكن دعوة عضو جديد: المفتاح العام غير موجود.');
  }

  batch.set(memberRef, {
    chatId,
    uid: contact.uid,
    role: 'member',
    displayName: contact.displayName.slice(0, 80),
    avatarUrl: (contact.avatarUrl || '').slice(0, 65536),
    publicKeyJwk,
    isTyping: false,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.update(chatRef, {
    memberIds: updatedMemberIds.slice(0, 50),
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/members/${contact.uid}`);
  }
}

export async function removeMemberFromGroupInFirestore(
  chatId: string,
  memberUid: string,
  updatedMemberIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  const memberRef = doc(db, 'chats', chatId, 'members', memberUid);
  const chatRef = doc(db, 'chats', chatId);

  batch.delete(memberRef);
  batch.update(chatRef, {
    memberIds: updatedMemberIds.slice(0, 50),
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/members/${memberUid}`);
  }
}

export async function updateChatTypingInFirestore(
  chatId: string,
  uid: string,
  isTyping: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId, 'members', uid), {
      isTyping,
      typingAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch {
    // Non-fatal
  }
}

export async function sendEncryptedMessageToFirestore(
  chatId: string,
  roomSeed: string,
  sender: UserProfile,
  type: MessageType,
  payload: MessagePayload,
  viewerIds: string[],
  replyToId?: string,
  customMsgId?: string
): Promise<string> {
  const msgId = customMsgId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const key = await deriveRoomKeyFromSeed(roomSeed);
  const envelope = await encryptPayload(JSON.stringify(payload), key);

  const batch = writeBatch(db);
  const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
  const chatRef = doc(db, 'chats', chatId);

  const boundedViewers = Array.from(new Set([sender.uid, ...viewerIds])).slice(0, 50);

  batch.set(msgRef, {
    id: msgId,
    chatId,
    senderId: sender.uid,
    senderName: sender.displayName.slice(0, 80),
    type,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    algorithm: 'AES-GCM-256',
    viewerIds: boundedViewers,
    ...(replyToId ? { replyToId } : {}),
    deliveredToIds: [sender.uid],
    readByIds: [sender.uid],
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.update(chatRef, {
    lastMessageCiphertext: envelope.ciphertext.slice(0, 2048),
    lastMessageIv: envelope.iv,
    lastMessageSenderId: sender.uid,
    lastMessageType: type,
    lastMessageDeliveredToIds: [sender.uid],
    lastMessageReadByIds: [sender.uid],
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
    return msgId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages/${msgId}`);
  }
}

export async function markChatMessagesDeliveredInFirestore(
  chatId: string,
  uid: string,
  messageIds: string[],
  alsoMarkChatLastMessage = false
): Promise<void> {
  if (messageIds.length === 0 && !alsoMarkChatLastMessage) return;
  try {
    const batch = writeBatch(db);
    for (const msgId of messageIds.slice(0, 25)) {
      batch.update(doc(db, 'chats', chatId, 'messages', msgId), {
        deliveredToIds: arrayUnion(uid),
        updatedAt: serverTimestamp()
      });
    }
    if (alsoMarkChatLastMessage) {
      batch.update(doc(db, 'chats', chatId), {
        lastMessageDeliveredToIds: arrayUnion(uid),
        updatedAt: serverTimestamp()
      });
    }
    await batch.commit();
  } catch {
    // Non-fatal if doc already deleted or rule pending verification
  }
}

export async function markChatMessagesReadInFirestore(
  chatId: string,
  uid: string,
  messageIds: string[],
  alsoMarkChatLastMessage = false
): Promise<void> {
  if (messageIds.length === 0 && !alsoMarkChatLastMessage) return;
  try {
    const batch = writeBatch(db);
    for (const msgId of messageIds.slice(0, 25)) {
      batch.update(doc(db, 'chats', chatId, 'messages', msgId), {
        deliveredToIds: arrayUnion(uid),
        readByIds: arrayUnion(uid),
        updatedAt: serverTimestamp()
      });
    }
    if (alsoMarkChatLastMessage) {
      batch.update(doc(db, 'chats', chatId), {
        lastMessageDeliveredToIds: arrayUnion(uid),
        lastMessageReadByIds: arrayUnion(uid),
        updatedAt: serverTimestamp()
      });
    }
    await batch.commit();
  } catch {
    // Non-fatal
  }
}

export async function editEncryptedMessageInFirestore(
  chatId: string,
  messageId: string,
  roomSeed: string,
  newPayload: MessagePayload,
  updateChatLastMessage = false
): Promise<{ ciphertext: string; iv: string; algorithm: string }> {
  const path = `chats/${chatId}/messages/${messageId}`;
  const key = await deriveRoomKeyFromSeed(roomSeed);
  const envelope = await encryptPayload(
    JSON.stringify({ ...newPayload, edited: true }),
    key
  );
  try {
    if (updateChatLastMessage) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'chats', chatId, 'messages', messageId), {
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        updatedAt: serverTimestamp()
      });
      batch.update(doc(db, 'chats', chatId), {
        lastMessageCiphertext: envelope.ciphertext.slice(0, 2048),
        lastMessageIv: envelope.iv,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
    } else {
      await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        updatedAt: serverTimestamp()
      });
    }
    return envelope;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function softDeleteMessageInFirestore(
  chatId: string,
  messageId: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      isDeleted: true,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateMessageReactionsInFirestore(
  chatId: string,
  messageId: string,
  reactions: Record<string, string[]>,
  reactionsCount: number
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  const compactReactions: Record<string, string[]> = {};
  for (const [emoji, users] of Object.entries(reactions).slice(0, 20)) {
    if (Array.isArray(users) && users.length > 0) {
      compactReactions[emoji] = users.slice(0, 50);
    }
  }
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      reactions: compactReactions,
      reactionsCount: Math.max(0, Math.min(10000, Math.floor(reactionsCount))),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleStarMessageInFirestore(
  chatId: string,
  messageId: string,
  uid: string,
  isCurrentlyStarred: boolean
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      starredBy: isCurrentlyStarred ? arrayRemove(uid) : arrayUnion(uid),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function votePollInFirestore(
  chatId: string,
  messageId: string,
  nextPollVotes: Record<string, string>
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  const boundedVotes: Record<string, string> = {};
  for (const [voterUid, optionId] of Object.entries(nextPollVotes).slice(0, 50)) {
    if (voterUid && optionId) {
      boundedVotes[voterUid] = optionId;
    }
  }
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      pollVotes: boundedVotes,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveChatPrefToFirestore(
  uid: string,
  chatId: string,
  pref: {
    pinned: boolean;
    archived: boolean;
    muted: boolean;
    favorite: boolean;
    unreadCount: number;
    disappearingSeconds: number;
  }
): Promise<void> {
  const path = `users/${uid}/chatPrefs/${chatId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'chatPrefs', chatId), {
      chatId,
      uid,
      pinned: Boolean(pref.pinned),
      archived: Boolean(pref.archived),
      muted: Boolean(pref.muted),
      favorite: Boolean(pref.favorite),
      unreadCount: Math.max(0, Math.min(10000, Math.floor(pref.unreadCount))),
      disappearingSeconds: Math.max(0, Math.min(7776000, Math.floor(pref.disappearingSeconds))),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

interface LiveChatSlot {
  chatData: Record<string, unknown> | null;
  prefData: Record<string, unknown> | null;
  peerMemberData: Record<string, unknown> | null;
  peerProfileData: Record<string, unknown> | null;
  previewText: string;
  lastCipherSignature: string;
  peerUid?: string;
  unsubs: (() => void)[];
}

export function subscribeUserChatsFromFirestore(
  uid: string,
  onChats: (chats: ChatRoom[]) => void
): () => void {
  const slots = new Map<string, LiveChatSlot>();
  let emitTimer: number | null = null;
  let disposed = false;

  const buildAndEmit = () => {
    if (disposed) return;
    const nowMs = Date.now();
    const list: ChatRoom[] = [];

    for (const [chatId, slot] of slots.entries()) {
      const c = slot.chatData;
      if (!c) continue;
      const pref = slot.prefData || {};
      const memberIds: string[] =
        Array.isArray(c.memberIds) && c.memberIds.length > 0 ? (c.memberIds as string[]) : [uid];

      const pm = slot.peerMemberData;
      const pp = slot.peerProfileData;
      let resolvedTitle = (c.title as string) || 'محادثة';
      let resolvedAvatar = (c.avatarUrl as string) || '';
      let peerAbout: string | undefined;
      let peerPublicKeyJwk: string | undefined;
      let isOnline = false;
      let isTyping = false;

      if (c.type === 'direct') {
        resolvedTitle =
          (pp?.displayName as string) || (pm?.displayName as string) || resolvedTitle;
        resolvedAvatar =
          (pp?.avatarUrl as string) || (pm?.avatarUrl as string) || resolvedAvatar;
        peerAbout = (pp?.about as string) || undefined;
        peerPublicKeyJwk =
          (pp?.publicKeyJwk as string) || (pm?.publicKeyJwk as string) || undefined;
        isOnline = Boolean(pp?.isOnline);
        if (pm?.isTyping === true && pm.typingAt) {
          const typingMs = toMillis(pm.typingAt);
          isTyping = nowMs - typingMs < 10_000;
        }
      }

      const senderId = (c.lastMessageSenderId as string) || '';
      const deliveredIds = Array.isArray(c.lastMessageDeliveredToIds)
        ? (c.lastMessageDeliveredToIds as string[])
        : undefined;
      const readIds = Array.isArray(c.lastMessageReadByIds)
        ? (c.lastMessageReadByIds as string[])
        : undefined;

      const lastMessageStatus = resolveMessageReceiptStatus(
        senderId,
        deliveredIds,
        readIds,
        'sent'
      );

      const hasUnreadCloud =
        Boolean(senderId) &&
        senderId !== uid &&
        !readIds?.includes(uid);
      const prefUnread = typeof pref.unreadCount === 'number' ? pref.unreadCount : 0;
      const resolvedUnread = hasUnreadCloud ? Math.max(1, prefUnread) : 0;

      list.push({
        id: chatId,
        type: (c.type as ChatRoom['type']) || 'direct',
        title: resolvedTitle,
        description: (c.description as string) || '',
        avatarUrl: resolvedAvatar,
        ...(slot.peerUid ? { peerUid: slot.peerUid } : {}),
        ...(peerAbout ? { peerAbout } : {}),
        ...(peerPublicKeyJwk ? { peerPublicKeyJwk } : {}),
        isOnline,
        isTyping,
        memberIds,
        pinned: Boolean(pref.pinned),
        archived: Boolean(pref.archived),
        muted: Boolean(pref.muted),
        favorite: Boolean(pref.favorite),
        unreadCount: resolvedUnread,
        disappearingSeconds:
          typeof pref.disappearingSeconds === 'number' ? pref.disappearingSeconds : 0,
        ...(typeof c.adminOnlyPost === 'boolean' ? { adminOnlyPost: c.adminOnlyPost } : {}),
        ...(typeof c.inviteCode === 'string' ? { inviteCode: c.inviteCode } : {}),
        lastMessagePreview: slot.previewText,
        lastMessageType: (c.lastMessageType as MessageType) || 'text',
        lastMessageSenderId: senderId,
        lastMessageStatus,
        ...(deliveredIds ? { lastMessageDeliveredToIds: deliveredIds } : {}),
        ...(readIds ? { lastMessageReadByIds: readIds } : {}),
        lastMessageAtMs: toMillis(c.lastMessageAt),
        roomSeed: chatId,
        ...(typeof c.createdBy === 'string' ? { createdBy: c.createdBy } : {})
      });
    }

    onChats(list);
  };

  const scheduleEmit = () => {
    if (emitTimer !== null) return;
    emitTimer = window.setTimeout(() => {
      emitTimer = null;
      buildAndEmit();
    }, 16);
  };

  const cleanupSlot = (chatId: string) => {
    const existing = slots.get(chatId);
    if (!existing) return;
    existing.unsubs.forEach((u) => u());
    slots.delete(chatId);
  };

  const attachChatSlot = (chatId: string) => {
    if (slots.has(chatId)) return;
    const slot: LiveChatSlot = {
      chatData: null,
      prefData: null,
      peerMemberData: null,
      peerProfileData: null,
      previewText: 'رسالة مشفرة 🔒',
      lastCipherSignature: '',
      unsubs: []
    };
    slots.set(chatId, slot);

    let peerWatchedUid: string | null = null;

    const unsubChat = onSnapshot(
      doc(db, 'chats', chatId),
      async (chatSnap) => {
        if (!chatSnap.exists()) {
          slot.chatData = null;
          scheduleEmit();
          return;
        }
        const c = chatSnap.data({ serverTimestamps: 'estimate' });
        slot.chatData = c;

        const sig = `${c.lastMessageCiphertext || ''}|${c.lastMessageIv || ''}`;
        if (sig !== slot.lastCipherSignature) {
          slot.lastCipherSignature = sig;
          if (c.lastMessageCiphertext && c.lastMessageIv) {
            try {
              const key = await deriveRoomKeyFromSeed(chatId);
              const raw = await decryptPayload(
                c.lastMessageCiphertext as string,
                c.lastMessageIv as string,
                key
              );
              const parsed = JSON.parse(raw) as MessagePayload;
              slot.previewText = parsed.text || 'رسالة مشفرة';
            } catch {
              slot.previewText = 'رسالة مشفرة 🔒';
            }
          } else {
            slot.previewText = 'رسالة مشفرة 🔒';
          }
        }

        if (c.type === 'direct' && Array.isArray(c.memberIds)) {
          const detectedPeer = (c.memberIds as string[]).find((id) => id && id !== uid) || null;
          if (detectedPeer && detectedPeer !== peerWatchedUid) {
            peerWatchedUid = detectedPeer;
            slot.peerUid = detectedPeer;

            const unsubPeerMember = onSnapshot(
              doc(db, 'chats', chatId, 'members', detectedPeer),
              (pmSnap) => {
                if (pmSnap.exists()) {
                  slot.peerMemberData = pmSnap.data({ serverTimestamps: 'estimate' });
                  scheduleEmit();
                }
              },
              () => {}
            );

            const unsubPeerProfile = onSnapshot(
              doc(db, 'users', detectedPeer, 'public', 'profile'),
              (ppSnap) => {
                if (ppSnap.exists()) {
                  slot.peerProfileData = ppSnap.data();
                  scheduleEmit();
                }
              },
              () => {}
            );

            slot.unsubs.push(unsubPeerMember, unsubPeerProfile);
          }
        }

        scheduleEmit();
      },
      () => {}
    );

    const unsubPref = onSnapshot(
      doc(db, 'users', uid, 'chatPrefs', chatId),
      (prefSnap) => {
        slot.prefData = prefSnap.exists() ? prefSnap.data() : null;
        scheduleEmit();
      },
      () => {}
    );

    slot.unsubs.push(unsubChat, unsubPref);
  };

  const membersQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid));
  const unsubMembers = onSnapshot(
    membersQuery,
    (snapshot) => {
      const nextChatIds = new Set<string>();
      for (const memberDoc of snapshot.docs) {
        const chatId = memberDoc.data().chatId as string;
        if (chatId) nextChatIds.add(chatId);
      }

      for (const existingId of Array.from(slots.keys())) {
        if (!nextChatIds.has(existingId)) {
          cleanupSlot(existingId);
        }
      }

      for (const chatId of nextChatIds) {
        attachChatSlot(chatId);
      }

      if (nextChatIds.size === 0) {
        onChats([]);
      } else {
        scheduleEmit();
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'members');
    }
  );

  return () => {
    disposed = true;
    if (emitTimer !== null) {
      window.clearTimeout(emitTimer);
    }
    unsubMembers();
    for (const chatId of Array.from(slots.keys())) {
      cleanupSlot(chatId);
    }
  };
}

export function subscribeChatMessagesFromFirestore(
  chatId: string,
  roomSeed: string,
  uid: string,
  onMessages: (messages: DecryptedMessage[]) => void
): () => void {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    where('viewerIds', 'array-contains', uid)
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      const key = await deriveRoomKeyFromSeed(roomSeed);
      const list: DecryptedMessage[] = [];
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data({ serverTimestamps: 'estimate' });
        let payload: MessagePayload = { text: 'تعذر فك التشفير' };
        try {
          const decoded = await decryptPayload(d.ciphertext, d.iv, key);
          payload = JSON.parse(decoded) as MessagePayload;
        } catch {
          payload = { text: '🔒 رسالة مشفرة بمفتاح مختلف' };
        }

        const rawPollVotes =
          d.pollVotes && typeof d.pollVotes === 'object'
            ? (d.pollVotes as Record<string, string>)
            : undefined;
        if (payload.pollOptions && rawPollVotes) {
          payload = {
            ...payload,
            pollOptions: mergePollVotesMap(payload.pollOptions, rawPollVotes)
          };
        }

        const reactions: Record<string, string[]> = {};
        if (d.reactions && typeof d.reactions === 'object') {
          for (const [emoji, users] of Object.entries(d.reactions as Record<string, unknown>)) {
            if (Array.isArray(users) && users.length > 0) {
              reactions[emoji] = users.filter((u): u is string => typeof u === 'string');
            }
          }
        }

        const deliveredToIds = Array.isArray(d.deliveredToIds)
          ? (d.deliveredToIds as string[])
          : undefined;
        const readByIds = Array.isArray(d.readByIds)
          ? (d.readByIds as string[])
          : undefined;
        const starredBy = Array.isArray(d.starredBy)
          ? (d.starredBy as string[])
          : [];

        const createdAtMs =
          d.createdAt instanceof Timestamp
            ? d.createdAt.toMillis()
            : typeof d.createdAt === 'number'
              ? d.createdAt
              : Date.now();

        list.push({
          id: d.id,
          chatId: d.chatId,
          senderId: d.senderId,
          senderName: d.senderName,
          type: d.type,
          payload,
          ciphertext: d.ciphertext,
          iv: d.iv,
          algorithm: d.algorithm || 'AES-GCM-256',
          replyToId: d.replyToId,
          ...(deliveredToIds ? { deliveredToIds } : {}),
          ...(readByIds ? { readByIds } : {}),
          ...(rawPollVotes ? { pollVotes: rawPollVotes } : {}),
          reactions,
          reactionsCount:
            typeof d.reactionsCount === 'number'
              ? d.reactionsCount
              : Object.values(reactions).reduce((a, b) => a + b.length, 0),
          starredBy,
          isDeleted: Boolean(d.isDeleted),
          status: resolveMessageReceiptStatus(d.senderId, deliveredToIds, readByIds, 'sent'),
          createdAtMs
        });
      }
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onMessages(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
    }
  );
}

export interface MultiChatMessageSyncController {
  syncTargets: (
    targets: Array<{ id: string; roomSeed: string; lastMessageAtMs: number }>,
    prioritizedChatId: string | null
  ) => void;
  resubscribeAll: () => void;
  dispose: () => void;
}

/**
 * Maintains persistent real-time message listeners across all active user chats
 * (without tearing down unchanged subscriptions when chats update), ensuring instant
 * multi-device message sync even for background conversations.
 */
export function createMultiChatMessageSyncController(
  uid: string,
  onChatMessages: (chatId: string, messages: DecryptedMessage[]) => void
): MultiChatMessageSyncController {
  const MAX_LIVE_CHATS = 25;
  const activeSubs = new Map<string, { roomSeed: string; unsub: () => void }>();
  let latestTargets: Array<{ id: string; roomSeed: string; lastMessageAtMs: number }> = [];
  let latestPriorityId: string | null = null;
  let disposed = false;

  const applyTargets = (
    targets: Array<{ id: string; roomSeed: string; lastMessageAtMs: number }>,
    prioritizedChatId: string | null
  ) => {
    if (disposed) return;
    latestTargets = targets;
    latestPriorityId = prioritizedChatId;

    const sorted = [...targets].sort((a, b) => {
      if (prioritizedChatId) {
        if (a.id === prioritizedChatId && b.id !== prioritizedChatId) return -1;
        if (b.id === prioritizedChatId && a.id !== prioritizedChatId) return 1;
      }
      return b.lastMessageAtMs - a.lastMessageAtMs;
    });

    const selected = sorted.slice(0, MAX_LIVE_CHATS);
    const desiredMap = new Map(selected.map((t) => [t.id, t.roomSeed || t.id]));

    for (const [chatId, entry] of activeSubs.entries()) {
      const nextSeed = desiredMap.get(chatId);
      if (!nextSeed || nextSeed !== entry.roomSeed) {
        entry.unsub();
        activeSubs.delete(chatId);
      }
    }

    for (const [chatId, roomSeed] of desiredMap.entries()) {
      if (!activeSubs.has(chatId)) {
        const unsub = subscribeChatMessagesFromFirestore(chatId, roomSeed, uid, (msgs) => {
          onChatMessages(chatId, msgs);
        });
        activeSubs.set(chatId, { roomSeed, unsub });
      }
    }
  };

  return {
    syncTargets: applyTargets,
    resubscribeAll: () => {
      for (const entry of activeSubs.values()) {
        entry.unsub();
      }
      activeSubs.clear();
      applyTargets(latestTargets, latestPriorityId);
    },
    dispose: () => {
      disposed = true;
      for (const entry of activeSubs.values()) {
        entry.unsub();
      }
      activeSubs.clear();
    }
  };
}

export async function publishStatusToFirestore(
  author: UserProfile,
  options: {
    id?: string;
    type: 'text' | 'image' | 'video';
    content: string;
    backgroundColor: string;
    fontStyle?: 'display' | 'sans' | 'mono';
    mediaUrl?: string;
    posterUrl?: string;
    durationSec?: number;
    pinned?: boolean;
    viewerIds: string[];
  }
): Promise<StatusItem> {
  const statusId =
    options.id || `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `statuses/${statusId}`;
  const nowMs = Date.now();
  const expiresAtMs = nowMs + STATUS_TTL_MS;
  const boundedViewers = Array.from(new Set([author.uid, ...options.viewerIds])).slice(0, 50);
  const clampedDuration =
    typeof options.durationSec === 'number'
      ? Math.max(0, Math.min(MAX_STATUS_VIDEO_SECONDS, Math.round(options.durationSec)))
      : undefined;

  try {
    await setDoc(doc(db, 'statuses', statusId), {
      id: statusId,
      authorId: author.uid,
      authorName: author.displayName.slice(0, 80),
      authorAvatar: author.avatarUrl.slice(0, 65536),
      type: options.type,
      content: options.content.slice(0, 500),
      backgroundColor: options.backgroundColor.slice(0, 32),
      ...(options.fontStyle ? { fontStyle: options.fontStyle } : {}),
      ...(options.mediaUrl ? { mediaUrl: options.mediaUrl.slice(0, MAX_STATUS_MEDIA_BYTES) } : {}),
      ...(options.posterUrl ? { posterUrl: options.posterUrl.slice(0, 65536) } : {}),
      ...(typeof clampedDuration === 'number' ? { durationSec: clampedDuration } : {}),
      ...(typeof options.pinned === 'boolean' ? { pinned: options.pinned } : {}),
      viewerIds: boundedViewers,
      viewedByIds: [],
      viewCount: 0,
      expiresAt: Timestamp.fromMillis(expiresAtMs),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return {
      id: statusId,
      authorId: author.uid,
      authorName: author.displayName.slice(0, 80),
      authorAvatar: author.avatarUrl.slice(0, 65536),
      type: options.type,
      content: options.content.slice(0, 500),
      backgroundColor: options.backgroundColor.slice(0, 32),
      fontStyle: options.fontStyle,
      mediaUrl: options.mediaUrl?.slice(0, MAX_STATUS_MEDIA_BYTES),
      posterUrl: options.posterUrl?.slice(0, 65536),
      durationSec: clampedDuration,
      pinned: Boolean(options.pinned),
      viewerIds: boundedViewers,
      viewedByIds: [],
      viewCount: 0,
      viewedByMe: true,
      createdAtMs: nowMs,
      expiresAtMs
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeStatusesFromFirestore(
  uid: string,
  onStatuses: (items: StatusItem[]) => void
): () => void {
  const q = query(
    collection(db, 'statuses'),
    where('viewerIds', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const nowMs = Date.now();
      const rawItems: StatusItem[] = [];
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        const createdAtMs = toMillis(d.createdAt);
        const expiresAtMs =
          d.expiresAt instanceof Timestamp
            ? d.expiresAt.toMillis()
            : typeof d.expiresAt === 'number'
              ? d.expiresAt
              : createdAtMs + STATUS_TTL_MS;
        const viewedByIds: string[] = Array.isArray(d.viewedByIds) ? d.viewedByIds : [];
        const item: StatusItem = {
          id: d.id,
          authorId: d.authorId,
          authorName: d.authorName,
          authorAvatar: d.authorAvatar || '',
          type: d.type,
          content: d.content || '',
          backgroundColor: d.backgroundColor || '#005C4B',
          fontStyle: d.fontStyle,
          mediaUrl: d.mediaUrl,
          posterUrl: typeof d.posterUrl === 'string' ? d.posterUrl : undefined,
          durationSec: typeof d.durationSec === 'number' ? d.durationSec : undefined,
          pinned: Boolean(d.pinned),
          viewerIds: Array.isArray(d.viewerIds) ? d.viewerIds : [d.authorId],
          viewedByIds,
          viewCount: typeof d.viewCount === 'number' ? d.viewCount : 0,
          viewedByMe: d.authorId === uid || viewedByIds.includes(uid),
          createdAtMs,
          expiresAtMs
        };

        if (isStatusExpired(item, nowMs)) {
          if (item.authorId === uid) {
            void deleteDoc(doc(db, 'statuses', item.id)).catch(() => {});
          }
          continue;
        }
        rawItems.push(item);
      }
      onStatuses(filterActiveStatuses(rawItems, nowMs));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'statuses');
    }
  );
}

export async function togglePinStatusInFirestore(
  statusId: string,
  pinned: boolean
): Promise<void> {
  const path = `statuses/${statusId}`;
  try {
    await updateDoc(doc(db, 'statuses', statusId), {
      pinned,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markStatusViewedInFirestore(
  statusId: string,
  viewerUid: string,
  currentViewedByIds: string[],
  currentViewCount: number
): Promise<void> {
  if (currentViewedByIds.includes(viewerUid)) return;
  const path = `statuses/${statusId}`;
  try {
    await updateDoc(doc(db, 'statuses', statusId), {
      viewedByIds: Array.from(new Set([...currentViewedByIds, viewerUid])).slice(0, 50),
      viewCount: currentViewCount + 1,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStatusFromFirestore(statusId: string): Promise<void> {
  const path = `statuses/${statusId}`;
  try {
    await deleteDoc(doc(db, 'statuses', statusId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCallRecordToFirestore(call: CallRecord): Promise<void> {
  const path = `calls/${call.id}`;
  try {
    await setDoc(doc(db, 'calls', call.id), {
      id: call.id,
      callerId: call.callerId,
      callerName: call.callerName.slice(0, 80),
      callerAvatar: call.callerAvatar.slice(0, 65536),
      calleeId: call.calleeId,
      calleeName: call.calleeName.slice(0, 80),
      calleeAvatar: call.calleeAvatar.slice(0, 65536),
      callType: call.callType,
      status: 'ringing',
      durationSeconds: 0,
      encryptionFingerprint: call.encryptionFingerprint.slice(0, 128),
      ...(call.offerSdp ? { offerSdp: call.offerSdp.slice(0, 32768) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCallOfferSdpInFirestore(
  callId: string,
  offerSdp: string
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      offerSdp: offerSdp.slice(0, 32768),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function answerIncomingCallInFirestore(
  callId: string,
  answerSdp: string
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'connected',
      answerSdp: answerSdp.slice(0, 32768),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function declineIncomingCallInFirestore(callId: string): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'declined',
      durationSeconds: 0,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function sendIceCandidateToFirestore(
  callId: string,
  callerId: string,
  calleeId: string,
  senderId: string,
  candidateInit: RTCIceCandidateInit
): Promise<void> {
  if (!candidateInit.candidate) return;
  const candId = `cand_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `calls/${callId}/candidates/${candId}`;
  try {
    await setDoc(doc(db, 'calls', callId, 'candidates', candId), {
      id: candId,
      callId,
      senderId,
      callerId,
      calleeId,
      candidate: candidateInit.candidate.slice(0, 2048),
      ...(typeof candidateInit.sdpMid === 'string'
        ? { sdpMid: candidateInit.sdpMid.slice(0, 64) }
        : {}),
      ...(typeof candidateInit.sdpMLineIndex === 'number' &&
      candidateInit.sdpMLineIndex >= 0 &&
      candidateInit.sdpMLineIndex <= 32
        ? { sdpMLineIndex: candidateInit.sdpMLineIndex }
        : {}),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeCallDocument(
  callId: string,
  onUpdate: (data: {
    status: CallRecord['status'];
    offerSdp?: string;
    answerSdp?: string;
    durationSeconds?: number;
  }) => void
): () => void {
  return onSnapshot(
    doc(db, 'calls', callId),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onUpdate({
        status: d.status,
        offerSdp: typeof d.offerSdp === 'string' ? d.offerSdp : undefined,
        answerSdp: typeof d.answerSdp === 'string' ? d.answerSdp : undefined,
        durationSeconds: typeof d.durationSeconds === 'number' ? d.durationSeconds : undefined
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `calls/${callId}`);
    }
  );
}

export function subscribeCallIceCandidates(
  callId: string,
  callerId: string,
  myUid: string,
  onRemoteCandidate: (candidate: RTCIceCandidateInit) => void
): () => void {
  const roleField = myUid === callerId ? 'callerId' : 'calleeId';
  const q = query(
    collection(db, 'calls', callId, 'candidates'),
    where('callId', '==', callId),
    where(roleField, '==', myUid)
  );
  const seenIds = new Set<string>();
  return onSnapshot(
    q,
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;
        const d = change.doc.data();
        if (seenIds.has(d.id) || d.senderId === myUid) continue;
        seenIds.add(d.id);
        onRemoteCandidate({
          candidate: d.candidate,
          sdpMid: typeof d.sdpMid === 'string' ? d.sdpMid : undefined,
          sdpMLineIndex: typeof d.sdpMLineIndex === 'number' ? d.sdpMLineIndex : undefined
        });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `calls/${callId}/candidates`);
    }
  );
}

export function subscribeIncomingCallsFromFirestore(
  myUid: string,
  onIncomingCall: (call: CallRecord | null) => void
): () => void {
  const q = query(collection(db, 'calls'), where('calleeId', '==', myUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const nowMs = Date.now();
      const ringing = snapshot.docs
        .map((docSnap) => docSnap.data())
        .filter((d) => {
          const createdMs = toMillis(d.createdAt);
          return d.status === 'ringing' && nowMs - createdMs < 120_000;
        })
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

      if (ringing.length === 0) {
        onIncomingCall(null);
        return;
      }

      const d = ringing[0];
      onIncomingCall({
        id: d.id,
        callerId: d.callerId,
        callerName: d.callerName,
        callerAvatar: d.callerAvatar || '',
        calleeId: d.calleeId,
        calleeName: d.calleeName,
        calleeAvatar: d.calleeAvatar || '',
        callType: d.callType,
        status: 'ringing',
        direction: 'incoming',
        durationSeconds: 0,
        encryptionFingerprint: d.encryptionFingerprint,
        offerSdp: typeof d.offerSdp === 'string' ? d.offerSdp : undefined,
        createdAtMs: toMillis(d.createdAt)
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calls');
    }
  );
}

export async function finalizeCallRecordInFirestore(
  callId: string,
  status: 'ended' | 'declined' | 'missed',
  durationSeconds: number
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status,
      durationSeconds: Math.max(0, Math.floor(durationSeconds)),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeCallsFromFirestore(
  uid: string,
  onCalls: (calls: CallRecord[]) => void
): () => void {
  const outgoingMap = new Map<string, CallRecord>();
  const incomingMap = new Map<string, CallRecord>();

  const emitMerged = () => {
    const merged = new Map<string, CallRecord>([...outgoingMap, ...incomingMap]);
    const list = Array.from(merged.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
    onCalls(list);
  };

  const toCallRecord = (d: Record<string, unknown>): CallRecord => ({
    id: d.id as string,
    callerId: d.callerId as string,
    callerName: d.callerName as string,
    callerAvatar: (d.callerAvatar as string) || '',
    calleeId: d.calleeId as string,
    calleeName: d.calleeName as string,
    calleeAvatar: (d.calleeAvatar as string) || '',
    callType: d.callType as 'audio' | 'video',
    status: d.status as CallRecord['status'],
    direction: d.callerId === uid ? 'outgoing' : 'incoming',
    durationSeconds: typeof d.durationSeconds === 'number' ? d.durationSeconds : 0,
    encryptionFingerprint: (d.encryptionFingerprint as string) || '',
    createdAtMs: toMillis(d.createdAt)
  });

  const qOut = query(collection(db, 'calls'), where('callerId', '==', uid));
  const qIn = query(collection(db, 'calls'), where('calleeId', '==', uid));

  const unsubOut = onSnapshot(
    qOut,
    (snapshot) => {
      outgoingMap.clear();
      for (const docSnap of snapshot.docs) {
        const rec = toCallRecord(docSnap.data());
        outgoingMap.set(rec.id, rec);
      }
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calls');
    }
  );

  const unsubIn = onSnapshot(
    qIn,
    (snapshot) => {
      incomingMap.clear();
      for (const docSnap of snapshot.docs) {
        const rec = toCallRecord(docSnap.data());
        incomingMap.set(rec.id, rec);
      }
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calls');
    }
  );

  return () => {
    unsubOut();
    unsubIn();
  };
}

export async function scheduleMessageInFirestore(
  msg: Omit<ScheduledMessage, 'createdAtMs'>
): Promise<void> {
  const path = `scheduled_messages/${msg.id}`;
  try {
    await setDoc(doc(db, 'scheduled_messages', msg.id), {
      ...msg,
      createdAt: serverTimestamp(),
      createdAtMs: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteScheduledMessageFromFirestore(msgId: string): Promise<void> {
  const path = `scheduled_messages/${msgId}`;
  try {
    await deleteDoc(doc(db, 'scheduled_messages', msgId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeScheduledMessagesFromFirestore(
  myUid: string,
  onUpdate: (msgs: ScheduledMessage[]) => void
): () => void {
  const q = query(
    collection(db, 'scheduled_messages'),
    where('senderId', '==', myUid),
    where('status', '==', 'pending')
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ScheduledMessage[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: d.id,
          chatId: d.chatId,
          senderId: d.senderId,
          senderName: d.senderName,
          type: d.type,
          payload: d.payload,
          sendAtMs: d.sendAtMs,
          status: d.status,
          createdAtMs: toMillis(d.createdAtMs || d.createdAt) || Date.now()
        });
      });
      onUpdate(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'scheduled_messages');
    }
  );
}

export async function lookupUserByWasilIdOrUid(queryStr: string): Promise<UserProfile | null> {
  const cleaned = queryStr.trim();
  if (!cleaned) return null;

  try {
    let targetUid = '';
    let resolvedRegistryId: string | undefined;

    if (cleaned.startsWith('@')) {
      const normalized = normalizeWasilId(cleaned);
      if (!normalized) return null;
      const bare = normalized.slice(1);
      const [atSnap, bareSnap] = await Promise.all([
        getDoc(doc(db, 'wasil_registry', normalized)),
        getDoc(doc(db, 'wasil_registry', bare))
      ]);
      const matchSnap = atSnap.exists() ? atSnap : bareSnap.exists() ? bareSnap : null;
      if (!matchSnap) return null;
      targetUid = matchSnap.data().uid;
      resolvedRegistryId = (matchSnap.data().wasilId as string) || normalized;
    } else {
      const normalized = normalizeWasilId(cleaned);
      const bare = normalized ? normalized.slice(1) : '';
      const looksLikeUid = /^[a-zA-Z0-9_-]{20,128}$/.test(cleaned);

      if (looksLikeUid) {
        const [directSnap, regSnap] = await Promise.all([
          getDoc(doc(db, 'users', cleaned, 'public', 'profile')),
          normalized ? getDoc(doc(db, 'wasil_registry', normalized)) : Promise.resolve(null)
        ]);
        if (directSnap.exists()) {
          const d = directSnap.data();
          return {
            uid: d.uid,
            ...(typeof d.wasilId === 'string' ? { wasilId: d.wasilId } : {}),
            displayName: d.displayName,
            about: d.about || '',
            avatarUrl: d.avatarUrl || '',
            publicKeyJwk: d.publicKeyJwk || '',
            safetyCode: d.safetyCode || '',
            isOnline: Boolean(d.isOnline),
            lastSeenMs: toMillis(d.lastSeen) || Date.now()
          };
        }
        if (regSnap && regSnap.exists()) {
          targetUid = regSnap.data().uid;
          resolvedRegistryId = (regSnap.data().wasilId as string) || normalized;
        }
      } else if (normalized) {
        const [atSnap, bareSnap] = await Promise.all([
          getDoc(doc(db, 'wasil_registry', normalized)),
          bare ? getDoc(doc(db, 'wasil_registry', bare)) : Promise.resolve(null)
        ]);
        const matchSnap = atSnap.exists() ? atSnap : bareSnap && bareSnap.exists() ? bareSnap : null;
        if (matchSnap) {
          targetUid = matchSnap.data().uid;
          resolvedRegistryId = (matchSnap.data().wasilId as string) || normalized;
        }
      }
    }

    if (!targetUid || targetUid.startsWith('@') || !/^[a-zA-Z0-9_-]{10,128}$/.test(targetUid)) {
      return null;
    }

    const pubSnap = await getDoc(doc(db, 'users', targetUid, 'public', 'profile'));
    if (!pubSnap.exists()) return null;

    const d = pubSnap.data();
    return {
      uid: d.uid,
      wasilId: (typeof d.wasilId === 'string' ? d.wasilId : undefined) || resolvedRegistryId,
      displayName: d.displayName,
      about: d.about || '',
      avatarUrl: d.avatarUrl || '',
      publicKeyJwk: d.publicKeyJwk || '',
      safetyCode: d.safetyCode || '',
      isOnline: Boolean(d.isOnline),
      lastSeenMs: toMillis(d.lastSeen) || Date.now()
    };
  } catch {
    return null;
  }
}

export async function deleteChatInFirestore(
  chatId: string,
  uid: string,
  isCreator = false
): Promise<void> {
  try {
    // 1. Remove user membership so chat disappears from live query
    await deleteDoc(doc(db, 'chats', chatId, 'members', uid)).catch(() => {});
    // 2. Remove user chat preference
    await deleteDoc(doc(db, 'users', uid, 'chatPrefs', chatId)).catch(() => {});
    // 3. If creator, attempt to delete root chat document
    if (isCreator) {
      await deleteDoc(doc(db, 'chats', chatId)).catch(() => {});
    }
  } catch (error) {
    console.warn(`deleteChatInFirestore failed for chat ${chatId}:`, error);
  }
}

export async function backupUserDataToFirestore(uid: string, backupPayload: Record<string, any>): Promise<void> {
  try {
    await setDoc(doc(db, 'users', uid, 'backups', 'latest'), {
      payloadJson: JSON.stringify(backupPayload),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/backups/latest`);
  }
}

export async function restoreUserDataFromFirestore(uid: string): Promise<Record<string, any> | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'backups', 'latest'));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.payloadJson) {
      return JSON.parse(data.payloadJson);
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/backups/latest`);
    return null;
  }
}

