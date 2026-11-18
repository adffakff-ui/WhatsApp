import { doc, getDoc } from 'firebase/firestore';
import { getBytes, getStorage, ref, uploadBytes } from 'firebase/storage';
import { auth, db } from '../lib/firebase';
import { deriveRoomKeyFromSeed } from '../lib/crypto';

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const encoder = new TextEncoder();

export interface EncryptedMediaRef {
  path: string;
  iv: string;
  mediaId: string;
  byteLength: number;
}

function mediaAad(chatId: string, mediaId: string): Uint8Array {
  return encoder.encode(`wasil-media-v1:${chatId}:${mediaId}`);
}

async function requireDirectChatMember(chatId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول قبل إرسال الوسائط.');
  const [chatSnap, memberSnap] = await Promise.all([
    getDoc(doc(db, 'chats', chatId)),
    getDoc(doc(db, 'chats', chatId, 'members', user.uid))
  ]);
  if (!chatSnap.exists() || chatSnap.data().type !== 'direct' || !memberSnap.exists()) {
    throw new Error('إرسال الوسائط المشفرة متاح فقط لأعضاء دردشة مباشرة صالحة.');
  }
  return user.uid;
}

/** Encrypt and upload media bytes. Only ciphertext is written to Firebase Storage. */
export async function uploadEncryptedMedia(
  chatId: string,
  file: Blob
): Promise<EncryptedMediaRef> {
  const uid = await requireDirectChatMember(chatId);
  if (file.size < 1 || file.size > MAX_MEDIA_BYTES) {
    throw new Error('حجم الوسائط يجب أن يكون بين بايت واحد و15 ميغابايت.');
  }

  const mediaId = crypto.randomUUID();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveRoomKeyFromSeed(chatId);
  const plaintext = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: mediaAad(chatId, mediaId) as unknown as BufferSource
    },
    key,
    plaintext
  );
  const path = `chats/${chatId}/media/${mediaId}`;
  const storageRef = ref(getStorage(), path);
  await uploadBytes(storageRef, ciphertext, {
    contentType: 'application/octet-stream',
    customMetadata: { ownerUid: uid, mediaId, version: '1' }
  });

  return {
    path,
    iv: Array.from(iv, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    mediaId,
    byteLength: file.size
  };
}

/** Download and decrypt a media object after Firebase Storage authorizes membership. */
export async function downloadEncryptedMedia(
  chatId: string,
  media: EncryptedMediaRef,
  mimeType: string
): Promise<Blob> {
  await requireDirectChatMember(chatId);
  if (media.path !== `chats/${chatId}/media/${media.mediaId}` || media.byteLength > MAX_MEDIA_BYTES) {
    throw new Error('مرجع الوسائط غير صالح.');
  }
  if (!/^[0-9a-f]{24}$/i.test(media.iv)) throw new Error('قيمة IV غير صالحة.');

  const key = await deriveRoomKeyFromSeed(chatId);
  const encrypted = await getBytes(ref(getStorage(), media.path), MAX_MEDIA_BYTES + 16);
  const iv = new Uint8Array(media.iv.match(/.{2}/g)!.map((part) => parseInt(part, 16)));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: mediaAad(chatId, media.mediaId) as unknown as BufferSource
    },
    key,
    encrypted as unknown as BufferSource
  );
  return new Blob([plaintext], { type: mimeType || 'application/octet-stream' });
}
