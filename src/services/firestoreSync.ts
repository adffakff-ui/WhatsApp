import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { decryptPayload, deriveRoomKeyFromSeed, encryptPayload } from '../lib/crypto';
import {
  filterActiveStatuses,
  isStatusExpired,
  MAX_STATUS_MEDIA_BYTES,
  STATUS_TTL_MS
} from '../lib/chatLogic';
import type {
  CallRecord,
  ChatRoom,
  DecryptedMessage,
  MessagePayload,
  MessageType,
  PrivacySettings,
  StatusItem,
  ThemeMode,
  UserProfile,
  VisibilityScope
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
  displayName: string;
  about: string;
  avatarUrl: string;
  privacy: PrivacySettings;
  theme: ThemeMode;
}

export async function syncUserProfileToFirestore(
  user: { uid: string; displayName: string | null; email: string | null; photoURL: string | null },
  publicKeyJwk: string,
  safetyCode: string,
  about = 'متاح · رسائلي مشفرة تماماً',
  theme: ThemeMode = 'light'
): Promise<HydratedUserAccount> {
  const pubRef = doc(db, 'users', user.uid, 'public', 'profile');
  const privRef = doc(db, 'users', user.uid, 'private', 'info');

  try {
    const pubSnap = await getDoc(pubRef);
    const existingPub = pubSnap.exists() ? pubSnap.data() : null;
    const displayName = (
      (existingPub?.displayName as string) ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'مستخدم تواصل'
    ).slice(0, 80);
    const resolvedAbout =
      typeof existingPub?.about === 'string' ? existingPub.about.slice(0, 200) : about.slice(0, 200);
    const avatarUrl = (
      typeof existingPub?.avatarUrl === 'string' ? existingPub.avatarUrl : user.photoURL || ''
    ).slice(0, 65536);

    const safePublicKey = sanitizePublicKeyJwk(publicKeyJwk);
    if (!safePublicKey) {
      throw new Error('Missing publicKeyJwk for authenticated user.');
    }

    await setDoc(
      pubRef,
      {
        uid: user.uid,
        displayName,
        about: resolvedAbout,
        avatarUrl,
        publicKeyJwk: safePublicKey,
        safetyCode: safetyCode.slice(0, 120),
        isOnline: true,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: false }
    );

    const privSnap = await getDoc(privRef);
    const defaultPrivacy: PrivacySettings = {
      readReceipts: true,
      lastSeenMode: 'everyone',
      profilePhotoVisibility: 'everyone',
      bioVisibility: 'everyone'
    };

    if (!privSnap.exists()) {
      await setDoc(privRef, {
        uid: user.uid,
        email: (user.email || `${user.uid}@wasil.app`).slice(0, 160),
        phone: '',
        theme,
        readReceipts: defaultPrivacy.readReceipts,
        lastSeenVisible: true,
        lastSeenMode: defaultPrivacy.lastSeenMode,
        profilePhotoVisibility: defaultPrivacy.profilePhotoVisibility,
        bioVisibility: defaultPrivacy.bioVisibility,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { displayName, about: resolvedAbout, avatarUrl, privacy: defaultPrivacy, theme };
    }

    const privData = privSnap.data();
    await updateDoc(privRef, {
      updatedAt: serverTimestamp()
    });

    const hydratedPrivacy: PrivacySettings = {
      readReceipts: typeof privData.readReceipts === 'boolean' ? privData.readReceipts : true,
      lastSeenMode: (privData.lastSeenMode as VisibilityScope) || 'everyone',
      profilePhotoVisibility: (privData.profilePhotoVisibility as VisibilityScope) || 'everyone',
      bioVisibility: (privData.bioVisibility as VisibilityScope) || 'everyone'
    };

    return {
      displayName,
      about: resolvedAbout,
      avatarUrl,
      privacy: hydratedPrivacy,
      theme: privData.theme === 'dark' ? 'dark' : 'light'
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function updateProfileInFirestore(
  uid: string,
  currentProfile: UserProfile,
  updates: { displayName: string; about: string; avatarUrl: string }
): Promise<void> {
  const pubRef = doc(db, 'users', uid, 'public', 'profile');
  try {
    const safePublicKey = sanitizePublicKeyJwk(currentProfile.publicKeyJwk);
    if (!safePublicKey) {
      throw new Error('Missing publicKeyJwk for updating user profile.');
    }

    await updateDoc(pubRef, {
      displayName: updates.displayName.slice(0, 80),
      about: updates.about.slice(0, 200),
      avatarUrl: updates.avatarUrl.slice(0, 65536),
      publicKeyJwk: safePublicKey,
      safetyCode: currentProfile.safetyCode.slice(0, 120),
      isOnline: true,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
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
  const path = `users/${targetUid}/public/profile`;
  try {
    const snap = await getDoc(doc(db, 'users', targetUid, 'public', 'profile'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: d.uid,
      displayName: d.displayName,
      about: d.about,
      avatarUrl: d.avatarUrl,
      publicKeyJwk: d.publicKeyJwk,
      safetyCode: d.safetyCode,
      isOnline: Boolean(d.isOnline),
      lastSeenMs: toMillis(d.lastSeen)
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
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
  invitedContacts: UserProfile[] = []
): Promise<void> {
  const batch = writeBatch(db);
  const chatRef = doc(db, 'chats', chatId);
  const myMemberRef = doc(db, 'chats', chatId, 'members', creator.uid);
  const myPrefRef = doc(db, 'users', creator.uid, 'chatPrefs', chatId);
  const msgId = `msg_${Date.now()}`;
  const msgRef = doc(db, 'chats', chatId, 'messages', msgId);

  const creatorPublicKey = sanitizePublicKeyJwk(creator.publicKeyJwk);
  if (!creatorPublicKey) {
    throw new Error('لا يمكن إنشاء محادثة: المفتاح العام للمستخدم غير موجود.' );
  }

  const memberIds = Array.from(
    new Set([creator.uid, ...invitedContacts.map((c) => c.uid)])
  ).slice(0, 50);

  const key = await deriveRoomKeyFromSeed(chatId);
  const payload: MessagePayload = { text: initialMessageText };
  const envelope = await encryptPayload(JSON.stringify(payload), key);

  batch.set(chatRef, {
    id: chatId,
    type,
    title: title.slice(0, 100),
    description: description.slice(0, 300),
    avatarUrl: avatarUrl.slice(0, 65536),
    createdBy: creator.uid,
    memberIds,
    lastMessageCiphertext: envelope.ciphertext.slice(0, 2048),
    lastMessageIv: envelope.iv,
    lastMessageSenderId: creator.uid,
    lastMessageType: 'text',
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
    reactionsCount: 0,
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
  avatarUrl: string
): Promise<void> {
  const path = `chats/${chatId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      title: title.slice(0, 100),
      description: description.slice(0, 300),
      avatarUrl: avatarUrl.slice(0, 65536),
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

export async function sendEncryptedMessageToFirestore(
  chatId: string,
  roomSeed: string,
  sender: UserProfile,
  type: MessageType,
  payload: MessagePayload,
  viewerIds: string[],
  replyToId?: string
): Promise<void> {
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
    reactionsCount: 0,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.update(chatRef, {
    lastMessageCiphertext: envelope.ciphertext.slice(0, 2048),
    lastMessageIv: envelope.iv,
    lastMessageSenderId: sender.uid,
    lastMessageType: type,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages/${msgId}`);
  }
}

export function subscribeUserChatsFromFirestore(
  uid: string,
  onChats: (chats: ChatRoom[]) => void
): () => void {
  const membersQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid));
  return onSnapshot(
    membersQuery,
    async (snapshot) => {
      const chatRooms: ChatRoom[] = [];
      for (const memberDoc of snapshot.docs) {
        const chatId = memberDoc.data().chatId as string;
        try {
          const chatSnap = await getDoc(doc(db, 'chats', chatId));
          if (!chatSnap.exists()) continue;
          const c = chatSnap.data();
          const prefSnap = await getDoc(doc(db, 'users', uid, 'chatPrefs', chatId));
          const pref = prefSnap.exists() ? prefSnap.data() : {};

          let previewText = 'رسالة مشفرة 🔒';
          if (c.lastMessageCiphertext && c.lastMessageIv) {
            try {
              const key = await deriveRoomKeyFromSeed(chatId);
              const raw = await decryptPayload(c.lastMessageCiphertext, c.lastMessageIv, key);
              const parsed = JSON.parse(raw) as MessagePayload;
              previewText = parsed.text || 'رسالة مشفرة';
            } catch {
              previewText = 'رسالة مشفرة 🔒';
            }
          }

          chatRooms.push({
            id: chatId,
            type: c.type || 'direct',
            title: c.title || 'محادثة',
            description: c.description || '',
            avatarUrl: c.avatarUrl || '',
            memberIds: Array.isArray(c.memberIds) && c.memberIds.length > 0 ? c.memberIds : [uid],
            pinned: Boolean(pref.pinned),
            archived: Boolean(pref.archived),
            muted: Boolean(pref.muted),
            favorite: Boolean(pref.favorite),
            unreadCount: typeof pref.unreadCount === 'number' ? pref.unreadCount : 0,
            disappearingSeconds: typeof pref.disappearingSeconds === 'number' ? pref.disappearingSeconds : 0,
            lastMessagePreview: previewText,
            lastMessageType: c.lastMessageType || 'text',
            lastMessageSenderId: c.lastMessageSenderId || '',
            lastMessageStatus: 'read',
            lastMessageAtMs: toMillis(c.lastMessageAt),
            roomSeed: chatId
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `chats/${chatId}`);
        }
      }
      onChats(chatRooms);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'members');
    }
  );
}

export function subscribeChatMessagesFromFirestore(
  chatId: string,
  roomSeed: string,
  uid: string,
  onMessages: (messages: DecryptedMessage[]) => void
): () => void {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    where('viewerIds', 'array-contains', uid),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      const key = await deriveRoomKeyFromSeed(roomSeed);
      const list: DecryptedMessage[] = [];
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        let payload: MessagePayload = { text: 'تعذر فك التشفير' };
        try {
          const decoded = await decryptPayload(d.ciphertext, d.iv, key);
          payload = JSON.parse(decoded) as MessagePayload;
        } catch {
          payload = { text: '🔒 رسالة مشفرة بمفتاح مختلف' };
        }
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
          reactions: {},
          reactionsCount: d.reactionsCount || 0,
          starredBy: [],
          isDeleted: Boolean(d.isDeleted),
          status: 'read',
          createdAtMs: toMillis(d.createdAt)
        });
      }
      onMessages(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
    }
  );
}

export async function publishStatusToFirestore(
  author: UserProfile,
  options: {
    type: 'text' | 'image';
    content: string;
    backgroundColor: string;
    fontStyle?: 'display' | 'sans' | 'mono';
    mediaUrl?: string;
    viewerIds: string[];
  }
): Promise<StatusItem> {
  const statusId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `statuses/${statusId}`;
  const nowMs = Date.now();
  const expiresAtMs = nowMs + STATUS_TTL_MS;
  const boundedViewers = Array.from(new Set([author.uid, ...options.viewerIds])).slice(0, 50);

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
      callerAvatar: call.callerAvatar.slice(0, 500),
      calleeId: call.calleeId,
      calleeName: call.calleeName.slice(0, 80),
      calleeAvatar: call.calleeAvatar.slice(0, 500),
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
  const q = query(
    collection(db, 'calls'),
    where('callerId', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CallRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: d.id,
          callerId: d.callerId,
          callerName: d.callerName,
          callerAvatar: d.callerAvatar || '',
          calleeId: d.calleeId,
          calleeName: d.calleeName,
          calleeAvatar: d.calleeAvatar || '',
          callType: d.callType,
          status: d.status,
          direction: d.callerId === uid ? 'outgoing' : 'incoming',
          durationSeconds: d.durationSeconds || 0,
          encryptionFingerprint: d.encryptionFingerprint,
          createdAtMs: toMillis(d.createdAt)
        };
      });
      onCalls(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calls');
    }
  );
}
