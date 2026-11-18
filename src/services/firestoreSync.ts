import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
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
  buildChannelInviteCode,
  filterActiveStatuses,
  isStatusExpired,
  MAX_STATUS_MEDIA_BYTES,
  MAX_STATUS_VIDEO_SECONDS,
  mergePollVotesMap,
  resolveMessageReceiptStatus,
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
      user.phoneNumber ||
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
        phone: (user.phoneNumber || '').slice(0, 32),
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
        displayName: user.displayName || user.email?.split('@')[0] || user.phoneNumber || 'مستخدم تواصل',
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

export async function setUserPresenceInFirestore(
  uid: string,
  isOnline: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid, 'public', 'profile'), {
      isOnline,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch {
    // Non-fatal on unload/unverified user
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
        unreadCount: typeof pref.unreadCount === 'number' ? pref.unreadCount : 0,
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
        roomSeed: chatId
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
        const c = chatSnap.data();
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
                  slot.peerMemberData = pmSnap.data();
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
        const d = docSnap.data();
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
