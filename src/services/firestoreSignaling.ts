import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { CallRecord } from '../types/chat';

export type SignalingCallStatus = 'ringing' | 'connected' | 'ended' | 'declined' | 'missed';

export interface CallSignalingDocument {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar?: string;
  callType: 'audio' | 'video';
  status: SignalingCallStatus;
  durationSeconds: number;
  encryptionFingerprint: string;
  offerSdp: string;
  answerSdp?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface IceCandidateSignal {
  id: string;
  callId: string;
  senderId: string;
  callerId: string;
  calleeId: string;
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  createdAt?: unknown;
}

export interface CreateCallOfferInput {
  calleeId: string;
  callerName: string;
  callerAvatar?: string;
  calleeName: string;
  calleeAvatar?: string;
  callType: 'audio' | 'video';
  encryptionFingerprint: string;
  offer: RTCSessionDescriptionInit;
}

function requireVerifiedCaller(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول قبل بدء المكالمة.');
  if (!user.emailVerified) throw new Error('تحقق من بريدك الإلكتروني قبل إجراء المكالمات.');
  return user.uid;
}

function requireParticipant(call: CallSignalingDocument): string {
  const uid = requireVerifiedCaller();
  if (uid !== call.callerId && uid !== call.calleeId) {
    throw new Error('هذا المستخدم ليس طرفًا في المكالمة.');
  }
  return uid;
}

function toCallSignalingDocument(id: string, data: DocumentData): CallSignalingDocument {
  return {
    id,
    callerId: data.callerId,
    callerName: data.callerName,
    callerAvatar: data.callerAvatar,
    calleeId: data.calleeId,
    calleeName: data.calleeName,
    calleeAvatar: data.calleeAvatar,
    callType: data.callType,
    status: data.status,
    durationSeconds: data.durationSeconds,
    encryptionFingerprint: data.encryptionFingerprint,
    offerSdp: data.offerSdp,
    answerSdp: data.answerSdp,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

/**
 * Create the Firestore call document containing the caller's WebRTC offer.
 * The callee can discover it by subscribing to calls addressed to their UID.
 * Firestore rules must restrict call reads/writes to the two participants.
 */
export async function createCallOffer(input: CreateCallOfferInput): Promise<string> {
  const callerId = requireVerifiedCaller();
  if (!input.calleeId || input.calleeId === callerId) {
    throw new Error('معرّف الطرف المستقبل غير صالح.');
  }
  if (!input.offer.sdp || input.offer.sdp.length > 32768) {
    throw new Error('عرض WebRTC مفقود أو يتجاوز الحد المسموح.');
  }
  if (input.encryptionFingerprint.length < 6 || input.encryptionFingerprint.length > 128) {
    throw new Error('بصمة التحقق من المكالمة غير صالحة.');
  }

  const callRef = doc(collection(db, 'calls'));
  const now = serverTimestamp();
  const call: CallRecord & { offerSdp: string; updatedAt: unknown } = {
    id: callRef.id,
    callerId,
    callerName: input.callerName.trim().slice(0, 80) || 'مستخدم',
    callerAvatar: (input.callerAvatar || '').slice(0, 500),
    calleeId: input.calleeId,
    calleeName: input.calleeName.trim().slice(0, 80) || 'مستخدم',
    calleeAvatar: (input.calleeAvatar || '').slice(0, 500),
    callType: input.callType,
    status: 'ringing',
    direction: 'outgoing',
    durationSeconds: 0,
    encryptionFingerprint: input.encryptionFingerprint,
    offerSdp: input.offer.sdp,
    createdAtMs: Date.now(),
    updatedAt: now
  };

  try {
    await setDoc(callRef, {
      id: call.id,
      callerId: call.callerId,
      callerName: call.callerName,
      callerAvatar: call.callerAvatar,
      calleeId: call.calleeId,
      calleeName: call.calleeName,
      calleeAvatar: call.calleeAvatar,
      callType: call.callType,
      status: call.status,
      durationSeconds: call.durationSeconds,
      encryptionFingerprint: call.encryptionFingerprint,
      offerSdp: call.offerSdp,
      createdAt: now,
      updatedAt: now
    });
    return callRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `calls/${callRef.id}`);
  }
}

/** Listen to an individual call's offer, answer, and state changes. */
export function subscribeToCall(
  callId: string,
  onCall: (call: CallSignalingDocument | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'calls', callId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onCall(null);
        return;
      }
      const call = toCallSignalingDocument(snapshot.id, snapshot.data());
      try {
        requireParticipant(call);
        onCall(call);
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.GET, `calls/${callId}`);
    }
  );
}

/** Write the answer from the callee after setting the remote offer on RTCPeerConnection. */
export async function publishCallAnswer(call: CallSignalingDocument, answer: RTCSessionDescriptionInit): Promise<void> {
  const uid = requireParticipant(call);
  if (uid !== call.calleeId) throw new Error('فقط الطرف المستقبل يستطيع إرسال الإجابة.');
  if (call.status !== 'ringing') throw new Error('المكالمة لم تعد في حالة انتظار.');
  if (!answer.sdp || answer.sdp.length > 32768) throw new Error('إجابة WebRTC غير صالحة.');

  try {
    await updateDoc(doc(db, 'calls', call.id), {
      answerSdp: answer.sdp,
      status: 'connected',
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calls/${call.id}`);
  }
}

/** Publish one local ICE candidate. Firestore rules enforce participant membership. */
export async function publishIceCandidate(
  call: Pick<CallSignalingDocument, 'id' | 'callerId' | 'calleeId'>,
  candidate: RTCIceCandidateInit
): Promise<void> {
  const senderId = requireVerifiedCaller();
  if (senderId !== call.callerId && senderId !== call.calleeId) {
    throw new Error('لا يمكن إضافة مرشح ICE إلى مكالمة لست طرفًا فيها.');
  }
  if (!candidate.candidate || candidate.candidate.length > 2048) {
    throw new Error('مرشح ICE مفقود أو غير صالح.');
  }
  if (candidate.sdpMid && candidate.sdpMid.length > 64) throw new Error('sdpMid طويل جدًا.');
  if (candidate.sdpMLineIndex != null && (candidate.sdpMLineIndex < 0 || candidate.sdpMLineIndex > 32)) {
    throw new Error('sdpMLineIndex خارج النطاق.');
  }

  try {
    await addDoc(collection(db, 'calls', call.id, 'candidates'), {
      callId: call.id,
      senderId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      candidate: candidate.candidate,
      ...(candidate.sdpMid != null ? { sdpMid: candidate.sdpMid } : {}),
      ...(candidate.sdpMLineIndex != null ? { sdpMLineIndex: candidate.sdpMLineIndex } : {}),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `calls/${call.id}/candidates`);
  }
}

/** Listen for remote ICE candidates; the local peer's candidates are ignored. */
export function subscribeToRemoteIceCandidates(
  call: Pick<CallSignalingDocument, 'id' | 'callerId' | 'calleeId'>,
  onCandidate: (candidate: RTCIceCandidateInit) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const localUid = requireVerifiedCaller();
  if (localUid !== call.callerId && localUid !== call.calleeId) {
    throw new Error('لا يمكن الاستماع إلى مرشحي مكالمة لست طرفًا فيها.');
  }
  const candidatesQuery = query(
    collection(db, 'calls', call.id, 'candidates'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    candidatesQuery,
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;
        const data = change.doc.data();
        if (data.callId !== call.id || data.senderId === localUid) continue;
        onCandidate({
          candidate: data.candidate,
          sdpMid: data.sdpMid ?? null,
          sdpMLineIndex: data.sdpMLineIndex ?? null
        });
      }
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, `calls/${call.id}/candidates`);
    }
  );
}

/** End or decline a call; Firestore security rules remain the authoritative gate. */
export async function finishSignaledCall(
  call: CallSignalingDocument,
  status: 'ended' | 'declined' | 'missed',
  durationSeconds = 0
): Promise<void> {
  const uid = requireParticipant(call);
  if (['ended', 'declined', 'missed'].includes(call.status)) return;
  if (status === 'declined' && uid !== call.calleeId) {
    throw new Error('فقط الطرف المستقبل يستطيع رفض المكالمة.');
  }
  if (status === 'missed' && uid !== call.callerId) {
    throw new Error('فقط المتصل يستطيع إنهاء مكالمة فائتة.');
  }

  try {
    await updateDoc(doc(db, 'calls', call.id), {
      status,
      durationSeconds: Math.min(86400, Math.max(0, Math.floor(durationSeconds))),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calls/${call.id}`);
  }
}
