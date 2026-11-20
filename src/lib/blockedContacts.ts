import type {
  BlockedContact,
  CallRecord,
  ChatRoom,
  DecryptedMessage,
  StatusItem,
  UserProfile
} from '../types/chat';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function buildBlockedUidSet(blockedContacts: BlockedContact[]): Set<string> {
  const set = new Set<string>();
  for (const item of blockedContacts) {
    if (item.blockedUid) {
      set.add(item.blockedUid);
    }
  }
  return set;
}

export function isUidBlocked(
  blockedSet: ReadonlySet<string>,
  targetUid?: string | null
): boolean {
  if (!targetUid) return false;
  return blockedSet.has(targetUid);
}

export function getDirectChatPeerUid(
  chat: Pick<ChatRoom, 'type' | 'peerUid' | 'memberIds'>,
  myUid: string
): string | null {
  if (chat.type !== 'direct') return null;
  if (chat.peerUid && chat.peerUid !== myUid) return chat.peerUid;
  const other = chat.memberIds.find((id) => id && id !== myUid);
  return other || null;
}

export function getDirectChatBlockedPeerUid(
  chat: Pick<ChatRoom, 'type' | 'peerUid' | 'memberIds'>,
  myUid: string,
  blockedSet: ReadonlySet<string>
): string | null {
  const peerUid = getDirectChatPeerUid(chat, myUid);
  if (!peerUid) return null;
  return blockedSet.has(peerUid) ? peerUid : null;
}

export function filterBlockedMessages(
  messages: DecryptedMessage[],
  blockedSet: ReadonlySet<string>
): DecryptedMessage[] {
  if (blockedSet.size === 0) return messages;
  return messages.filter((msg) => !blockedSet.has(msg.senderId));
}

export function filterBlockedStatuses(
  statuses: StatusItem[],
  blockedSet: ReadonlySet<string>
): StatusItem[] {
  if (blockedSet.size === 0) return statuses;
  return statuses.filter((st) => !blockedSet.has(st.authorId));
}

export function filterBlockedIncomingCall(
  call: CallRecord | null,
  blockedSet: ReadonlySet<string>
): { allowed: CallRecord | null; blockedCallToDecline: CallRecord | null } {
  if (!call) return { allowed: null, blockedCallToDecline: null };
  if (blockedSet.has(call.callerId)) {
    return { allowed: null, blockedCallToDecline: call };
  }
  return { allowed: call, blockedCallToDecline: null };
}

export function sanitizeChatsForBlockedUsers(
  chats: ChatRoom[],
  myUid: string,
  blockedSet: ReadonlySet<string>
): ChatRoom[] {
  if (blockedSet.size === 0) return chats;
  return chats.map((chat) => {
    const blockedPeerUid = getDirectChatBlockedPeerUid(chat, myUid, blockedSet);
    const lastSenderBlocked = Boolean(
      chat.lastMessageSenderId && blockedSet.has(chat.lastMessageSenderId)
    );
    if (!blockedPeerUid && !lastSenderBlocked) {
      return chat;
    }
    return {
      ...chat,
      ...(blockedPeerUid
        ? {
            isOnline: false,
            isTyping: false,
            unreadCount: 0
          }
        : {}),
      ...(lastSenderBlocked
        ? {
            lastMessagePreview: blockedPeerUid
              ? 'جهة اتصال محظورة'
              : 'رسالة من جهة اتصال محظورة'
          }
        : {})
    };
  });
}

export interface SanitizedBlockedContactPayload {
  uid: string;
  blockedUid: string;
  displayName: string;
  wasilId: string;
  avatarUrl: string;
}

export function sanitizeBlockedContactInput(
  myUid: string,
  target: Pick<UserProfile, 'uid' | 'displayName' | 'wasilId' | 'avatarUrl'>
): SanitizedBlockedContactPayload {
  const cleanMyUid = (myUid || '').trim();
  const cleanBlockedUid = (target.uid || '').trim();
  if (!VALID_ID_REGEX.test(cleanMyUid)) {
    throw new Error('معرّف المستخدم الحالي غير صالح.');
  }
  if (!VALID_ID_REGEX.test(cleanBlockedUid)) {
    throw new Error('معرّف جهة الاتصال المراد حظرها غير صالح.');
  }
  if (cleanBlockedUid === cleanMyUid) {
    throw new Error('لا يمكنك حظر حسابك الشخصي.');
  }

  const displayName = (target.displayName || '').trim().slice(0, 80) || cleanBlockedUid.slice(0, 80);
  const wasilId = (target.wasilId || '').trim().slice(0, 36);
  const avatarUrl = (target.avatarUrl || '').slice(0, 65536);

  return {
    uid: cleanMyUid,
    blockedUid: cleanBlockedUid,
    displayName,
    wasilId,
    avatarUrl
  };
}
