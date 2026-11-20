import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  where,
  type Unsubscribe
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  decryptPayload,
  derivePairwiseChatKey,
  deriveRoomKeyFromSeed,
  encryptPayload,
  type IdentityKeys
} from '../lib/crypto';
import type { DecryptedMessage, MessagePayload, MessageType } from '../types/chat';
import { validatePublicKeyJwk } from '../types/publicKey';

const GROUP_ENVELOPE_IV_MARKER = 'group-v2';
const MAX_STORED_CIPHERTEXT_LENGTH = 60_000;
const MAX_GROUP_MEMBERS = 50;
const PRIVATE_IDENTITY_STORAGE_KEY = 'wasil_identity_keys_v1';

interface GroupCipherEnvelope {
  version: 2;
  senderPublicKeyJwk: string;
  payloadCiphertext: string;
  payloadIv: string;
  wrappedKeys: Record<string, { ciphertext: string; iv: string }>;
}

function requireVerifiedUid(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول لإرسال الرسائل أو استقبالها.');
  if (!user.emailVerified) throw new Error('تحقق من بريدك الإلكتروني قبل استخدام الدردشة السحابية.');
  return user.uid;
}

function loadIdentityKeys(): IdentityKeys {
  const raw = localStorage.getItem(PRIVATE_IDENTITY_STORAGE_KEY);
  if (!raw) throw new Error('مفاتيح التشفير المحلية غير موجودة على هذا الجهاز.');
  try {
    const value = JSON.parse(raw) as Partial<IdentityKeys>;
    if (!value.privateKeyJwk || !value.publicKeyJwk) throw new Error('missing keys');
    return value as IdentityKeys;
  } catch {
    throw new Error('مفاتيح التشفير المحلية تالفة؛ لن تُرسل الرسالة.');
  }
}

async function getAuthorizedChat(chatId: string, uid: string) {
  const [chatSnap, memberSnap] = await Promise.all([
    getDoc(doc(db, 'chats', chatId)),
    getDoc(doc(db, 'chats', chatId, 'members', uid))
  ]);
  if (!chatSnap.exists() || !memberSnap.exists()) {
    throw new Error('لا تملك صلاحية الوصول إلى هذه الدردشة.');
  }
  const data = chatSnap.data();
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds.filter((id): id is string => typeof id === 'string') : [];
  if (!memberIds.includes(uid)) throw new Error('عضوية الدردشة غير متطابقة.');
  return { data, memberIds };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptForGroup(
  chatId: string,
  uid: string,
  memberIds: string[],
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  if (memberIds.length < 2 || memberIds.length > MAX_GROUP_MEMBERS) {
    throw new Error('عدد أعضاء المجموعة غير صالح لتشفير الرسائل.');
  }

  const identity = loadIdentityKeys();
  const ownPublicKeyJwk = await validatePublicKeyJwk(identity.publicKeyJwk);
  if (!ownPublicKeyJwk) throw new Error('مفتاحك العام غير صالح.');

  const groupKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const groupKey = await crypto.subtle.importKey(
    'raw',
    groupKeyBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  const payloadIv = crypto.getRandomValues(new Uint8Array(12));
  const payloadCipherBytes = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: payloadIv as unknown as BufferSource,
      additionalData: new TextEncoder().encode(`wasil-group-v2:${chatId}`) as unknown as BufferSource
    },
    groupKey,
    new TextEncoder().encode(plaintext) as unknown as BufferSource
  );
  const wrappedKeys: GroupCipherEnvelope['wrappedKeys'] = {};

  // Each member receives the random message key encrypted with an ECDH/HKDF
  // key derived from the sender and that recipient's public identity keys.
  for (const memberUid of memberIds) {
    const memberRef = doc(db, 'chats', chatId, 'members', memberUid);
    const memberSnap = memberUid === uid ? null : await getDoc(memberRef);
    const memberData = memberUid === uid ? null : memberSnap?.data();
    const publicKey = await validatePublicKeyJwk(memberUid === uid ? ownPublicKeyJwk : memberData?.publicKeyJwk);
    if (!publicKey) throw new Error(`تعذر التحقق من المفتاح العام للعضو ${memberUid}؛ لم تُرسل الرسالة.`);

    const wrappingKey = await derivePairwiseChatKey(identity.privateKeyJwk, publicKey, chatId);
    const wrapped = await encryptPayload(toBase64(groupKeyBytes), wrappingKey);
    wrappedKeys[memberUid] = { ciphertext: wrapped.ciphertext, iv: wrapped.iv };
  }

  const envelope: GroupCipherEnvelope = {
    version: 2,
    senderPublicKeyJwk: ownPublicKeyJwk,
    payloadCiphertext: toBase64(new Uint8Array(payloadCipherBytes)),
    payloadIv: toBase64(payloadIv),
    wrappedKeys
  };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > MAX_STORED_CIPHERTEXT_LENGTH) {
    throw new Error('حجم الرسالة المشفرة للمجموعة كبير جدًا.');
  }
  return { ciphertext: serialized, iv: GROUP_ENVELOPE_IV_MARKER };
}

async function decryptGroupMessage(
  chatId: string,
  uid: string,
  ciphertext: string
): Promise<MessagePayload> {
  const envelope = JSON.parse(ciphertext) as Partial<GroupCipherEnvelope>;
  if (
    envelope.version !== 2 ||
    typeof envelope.senderPublicKeyJwk !== 'string' ||
    typeof envelope.payloadCiphertext !== 'string' ||
    typeof envelope.payloadIv !== 'string' ||
    !envelope.wrappedKeys || typeof envelope.wrappedKeys !== 'object'
  ) throw new Error('صيغة رسالة المجموعة المشفرة غير صالحة.');

  const identity = loadIdentityKeys();
  const senderPublicKey = await validatePublicKeyJwk(envelope.senderPublicKeyJwk);
  const wrapped = envelope.wrappedKeys[uid];
  if (!senderPublicKey || !wrapped?.ciphertext || !wrapped.iv) {
    throw new Error('لا يوجد مفتاح رسالة مخصص لهذا العضو.');
  }

  const wrappingKey = await derivePairwiseChatKey(identity.privateKeyJwk, senderPublicKey, chatId);
  const rawKey = fromBase64(await decryptPayload(wrapped.ciphertext, wrapped.iv, wrappingKey));
  if (rawKey.byteLength !== 32) throw new Error('مفتاح المجموعة غير صالح.');
  const groupKey = await crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(envelope.payloadIv) as unknown as BufferSource,
      additionalData: new TextEncoder().encode(`wasil-group-v2:${chatId}`) as unknown as BufferSource
    },
    groupKey,
    fromBase64(envelope.payloadCiphertext) as unknown as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as MessagePayload;
}

export interface SendChatMessageInput {
  chatId: string;
  senderName: string;
  type: MessageType;
  payload: MessagePayload;
  replyToId?: string;
}

/** Encrypt and persist a text/media-reference message for a direct or group chat. */
export async function sendChatMessage(input: SendChatMessageInput): Promise<string> {
  const uid = requireVerifiedUid();
  const { data: chatData, memberIds } = await getAuthorizedChat(input.chatId, uid);
  if (memberIds.length > MAX_GROUP_MEMBERS) throw new Error('المجموعة تتجاوز الحد المسموح للأعضاء.');

  const msgRef = doc(collection(db, 'chats', input.chatId, 'messages'));
  const plaintext = JSON.stringify(input.payload);
  let ciphertext: string;
  let iv: string;

  if (chatData.type === 'direct') {
    if (memberIds.length !== 2) throw new Error('الدردشة المباشرة يجب أن تضم عضوين بالضبط.');
    const key = await deriveRoomKeyFromSeed(input.chatId);
    const envelope = await encryptPayload(plaintext, key);
    ciphertext = envelope.ciphertext;
    iv = envelope.iv;
  } else {
    const groupEnvelope = await encryptForGroup(input.chatId, uid, memberIds, plaintext);
    ciphertext = groupEnvelope.ciphertext;
    iv = groupEnvelope.iv;
  }

  if (!ciphertext || ciphertext.length > MAX_STORED_CIPHERTEXT_LENGTH) {
    throw new Error('الرسالة المشفرة تتجاوز الحجم المسموح.');
  }

  const batch = writeBatch(db);
  batch.set(msgRef, {
    id: msgRef.id,
    chatId: input.chatId,
    senderId: uid,
    senderName: input.senderName.trim().slice(0, 80) || 'مستخدم',
    type: input.type,
    ciphertext,
    iv,
    algorithm: 'AES-GCM-256',
    viewerIds: Array.from(new Set(memberIds)),
    ...(input.replyToId ? { replyToId: input.replyToId.slice(0, 128) } : {}),
    reactionsCount: 0,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // For groups, keep the list preview opaque rather than putting plaintext in
  // the chat document. Message bodies and media metadata remain encrypted.
  batch.update(doc(db, 'chats', input.chatId), {
    lastMessageCiphertext: chatData.type === 'direct' ? ciphertext.slice(0, 2048) : 'group-e2ee-v2',
    lastMessageIv: chatData.type === 'direct' ? iv : GROUP_ENVELOPE_IV_MARKER,
    lastMessageSenderId: uid,
    lastMessageType: input.type,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
    return msgRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${input.chatId}/messages/${msgRef.id}`);
  }
}

/** Subscribe and decrypt messages visible to the authenticated chat member. */
export function subscribeToChatMessages(
  chatId: string,
  onMessages: (messages: DecryptedMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const uid = requireVerifiedUid();
  const messagesQuery = query(
    collection(db, 'chats', chatId, 'messages'),
    where('viewerIds', 'array-contains', uid),
    orderBy('createdAt', 'asc')
  );
  let active = true;
  let revision = 0;

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const currentRevision = ++revision;
      void (async () => {
        const chatSnap = await getDoc(doc(db, 'chats', chatId));
        if (!chatSnap.exists()) throw new Error('الدردشة غير موجودة.');
        const chatType = chatSnap.data().type;
        const list: DecryptedMessage[] = [];
        for (const snap of snapshot.docs) {
          const data = snap.data();
          let payload: MessagePayload;
          try {
            payload = data.iv === GROUP_ENVELOPE_IV_MARKER && chatType !== 'direct'
              ? await decryptGroupMessage(chatId, uid, data.ciphertext)
              : JSON.parse(await decryptPayload(data.ciphertext, data.iv, await deriveRoomKeyFromSeed(chatId))) as MessagePayload;
          } catch {
            payload = { text: "🔒 رسالة مشفرة بمفتاح مختلف" };
          }
          list.push({
            id: snap.id,
            chatId,
            senderId: data.senderId,
            senderName: data.senderName,
            type: data.type,
            payload,
            ciphertext: data.ciphertext,
            iv: data.iv,
            algorithm: data.algorithm || 'AES-GCM-256',
            replyToId: data.replyToId,
            reactions: {},
            reactionsCount: typeof data.reactionsCount === 'number' ? data.reactionsCount : 0,
            starredBy: [],
            isDeleted: Boolean(data.isDeleted),
            status: data.senderId === uid ? 'sent' : 'delivered',
            createdAtMs: data.createdAt?.toMillis?.() ?? Date.now()
          });
        }
        if (active && currentRevision === revision) onMessages(list);
      })().catch((error: unknown) => {
        if (active) {
          if (onError) onError(error instanceof Error ? error : new Error(String(error)));
          else handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
        }
      });
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
    }
  );
}

/** Stop forwarding callbacks from a subscription after the caller unsubscribes. */
export function guardedUnsubscribe(unsubscribe: Unsubscribe): Unsubscribe {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
}
