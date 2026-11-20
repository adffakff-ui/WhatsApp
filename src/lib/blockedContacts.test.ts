import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlockedUidSet,
  filterBlockedIncomingCall,
  filterBlockedMessages,
  filterBlockedStatuses,
  getDirectChatBlockedPeerUid,
  isUidBlocked,
  sanitizeBlockedContactInput,
  sanitizeChatsForBlockedUsers
} from './blockedContacts';
import type {
  BlockedContact,
  CallRecord,
  ChatRoom,
  DecryptedMessage,
  StatusItem
} from '../types/chat';

const sampleBlocked: BlockedContact[] = [
  {
    uid: 'user_me',
    blockedUid: 'user_bad',
    displayName: 'مستخدم مزعج',
    wasilId: '@bad_user',
    avatarUrl: '',
    createdAtMs: 1000,
    updatedAtMs: 1000
  }
];

test('buildBlockedUidSet and isUidBlocked identify blocked users', () => {
  const set = buildBlockedUidSet(sampleBlocked);
  assert.equal(isUidBlocked(set, 'user_bad'), true);
  assert.equal(isUidBlocked(set, 'user_good'), false);
  assert.equal(isUidBlocked(set, null), false);
});

test('filterBlockedMessages removes messages sent by blocked users', () => {
  const set = buildBlockedUidSet(sampleBlocked);
  const messages: DecryptedMessage[] = [
    {
      id: 'm1',
      chatId: 'c1',
      senderId: 'user_me',
      senderName: 'أنا',
      type: 'text',
      payload: { text: 'مرحبا' },
      ciphertext: 'c1',
      iv: 'iv12345678',
      algorithm: 'AES-GCM-256',
      reactions: {},
      reactionsCount: 0,
      starredBy: [],
      isDeleted: false,
      status: 'sent',
      createdAtMs: 100
    },
    {
      id: 'm2',
      chatId: 'c1',
      senderId: 'user_bad',
      senderName: 'مزعج',
      type: 'text',
      payload: { text: 'رسالة غير مرغوبة' },
      ciphertext: 'c2',
      iv: 'iv12345678',
      algorithm: 'AES-GCM-256',
      reactions: {},
      reactionsCount: 0,
      starredBy: [],
      isDeleted: false,
      status: 'sent',
      createdAtMs: 200
    }
  ];

  const filtered = filterBlockedMessages(messages, set);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'm1');
});

test('filterBlockedIncomingCall rejects calls from blocked callers and marks for decline', () => {
  const set = buildBlockedUidSet(sampleBlocked);
  const blockedCall: CallRecord = {
    id: 'call_1',
    callerId: 'user_bad',
    callerName: 'مزعج',
    callerAvatar: '',
    calleeId: 'user_me',
    calleeName: 'أنا',
    calleeAvatar: '',
    callType: 'audio',
    status: 'ringing',
    direction: 'incoming',
    durationSeconds: 0,
    encryptionFingerprint: '12345-67890',
    createdAtMs: 500
  };

  const result = filterBlockedIncomingCall(blockedCall, set);
  assert.equal(result.allowed, null);
  assert.equal(result.blockedCallToDecline?.id, 'call_1');

  const safeCall = { ...blockedCall, id: 'call_2', callerId: 'user_friend' };
  const allowedResult = filterBlockedIncomingCall(safeCall, set);
  assert.equal(allowedResult.allowed?.id, 'call_2');
  assert.equal(allowedResult.blockedCallToDecline, null);
});

test('filterBlockedStatuses hides stories posted by blocked users', () => {
  const set = buildBlockedUidSet(sampleBlocked);
  const statuses: StatusItem[] = [
    {
      id: 'st1',
      authorId: 'user_bad',
      authorName: 'مزعج',
      authorAvatar: '',
      type: 'text',
      content: 'حالة',
      backgroundColor: '#000',
      viewerIds: ['user_me'],
      viewedByIds: [],
      viewCount: 0,
      viewedByMe: false,
      createdAtMs: 100,
      expiresAtMs: 999999
    },
    {
      id: 'st2',
      authorId: 'user_friend',
      authorName: 'صديق',
      authorAvatar: '',
      type: 'text',
      content: 'أهلاً',
      backgroundColor: '#111',
      viewerIds: ['user_me'],
      viewedByIds: [],
      viewCount: 0,
      viewedByMe: false,
      createdAtMs: 100,
      expiresAtMs: 999999
    }
  ];

  const visible = filterBlockedStatuses(statuses, set);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'st2');
});

test('sanitizeChatsForBlockedUsers clears unread count, online state, and blocked previews', () => {
  const set = buildBlockedUidSet(sampleBlocked);
  const directChat: ChatRoom = {
    id: 'direct_1',
    type: 'direct',
    title: 'مستخدم مزعج',
    description: '',
    avatarUrl: '',
    peerUid: 'user_bad',
    isOnline: true,
    isTyping: true,
    memberIds: ['user_me', 'user_bad'],
    pinned: false,
    archived: false,
    muted: false,
    favorite: false,
    unreadCount: 5,
    disappearingSeconds: 0,
    lastMessagePreview: 'رسالة مزعجة',
    lastMessageType: 'text',
    lastMessageSenderId: 'user_bad',
    lastMessageStatus: 'sent',
    lastMessageAtMs: 1000,
    roomSeed: 'direct_1'
  };

  assert.equal(getDirectChatBlockedPeerUid(directChat, 'user_me', set), 'user_bad');
  const [sanitized] = sanitizeChatsForBlockedUsers([directChat], 'user_me', set);
  assert.equal(sanitized.unreadCount, 0);
  assert.equal(sanitized.isOnline, false);
  assert.equal(sanitized.isTyping, false);
  assert.equal(sanitized.lastMessagePreview, 'جهة اتصال محظورة');
});

test('sanitizeBlockedContactInput validates IDs, blocks self-blocking, and truncates safely', () => {
  assert.throws(() =>
    sanitizeBlockedContactInput('user_me', {
      uid: 'user_me',
      displayName: 'أنا',
      wasilId: '@me',
      avatarUrl: ''
    })
  );

  const sanitized = sanitizeBlockedContactInput('user_me', {
    uid: 'user_other',
    displayName: '  ' + 'أ'.repeat(120),
    wasilId: '@other_user',
    avatarUrl: 'https://example.com/a.png'
  });

  assert.equal(sanitized.uid, 'user_me');
  assert.equal(sanitized.blockedUid, 'user_other');
  assert.equal(sanitized.displayName.length, 80);
  assert.equal(sanitized.wasilId, '@other_user');
});
