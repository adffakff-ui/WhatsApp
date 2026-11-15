import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAndSortChats,
  formatCallDuration,
  applyPollVote,
  validateProfileInput,
  formatWhatsAppTime,
  validateAvatarUrl,
  getVisibilityLabel,
  STATUS_TTL_MS,
  isStatusExpired,
  filterActiveStatuses,
  formatRemainingStatusTime,
  extractContactsFromChats,
  resolveStatusViewerIds,
  extractChatSharedAssets
} from './chatLogic';
import type { ChatRoom, DecryptedMessage, PollOption, StatusItem } from '../types/chat';

const sampleChats: ChatRoom[] = [
  {
    id: 'c1',
    type: 'direct',
    title: 'سارة المنصور',
    description: '',
    avatarUrl: '',
    memberIds: ['me', 'sara'],
    pinned: false,
    archived: false,
    muted: false,
    favorite: true,
    unreadCount: 2,
    disappearingSeconds: 0,
    lastMessagePreview: 'تم إرسال الملف المشفر',
    lastMessageType: 'text',
    lastMessageSenderId: 'sara',
    lastMessageStatus: 'read',
    lastMessageAtMs: 2000,
    roomSeed: 'seed1'
  },
  {
    id: 'c2',
    type: 'group',
    title: 'فريق التطوير',
    description: '',
    avatarUrl: '',
    memberIds: ['me', 'omar', 'layla'],
    pinned: true,
    archived: false,
    muted: false,
    favorite: false,
    unreadCount: 0,
    disappearingSeconds: 86400,
    lastMessagePreview: 'اجتماع المزامنة الساعة ٥',
    lastMessageType: 'text',
    lastMessageSenderId: 'me',
    lastMessageStatus: 'read',
    lastMessageAtMs: 1000,
    roomSeed: 'seed2'
  },
  {
    id: 'c3',
    type: 'direct',
    title: 'محادثة مؤرشفة',
    description: '',
    avatarUrl: '',
    memberIds: ['me', 'arch'],
    pinned: false,
    archived: true,
    muted: true,
    favorite: false,
    unreadCount: 0,
    disappearingSeconds: 0,
    lastMessagePreview: 'شكراً لك',
    lastMessageType: 'text',
    lastMessageSenderId: 'me',
    lastMessageStatus: 'read',
    lastMessageAtMs: 3000,
    roomSeed: 'seed3'
  }
];

test('filterAndSortChats prioritizes pinned chats and handles filters', () => {
  const active = filterAndSortChats(sampleChats, 'all', '', false);
  assert.deepEqual(active.map((c) => c.id), ['c2', 'c1']);

  const unread = filterAndSortChats(sampleChats, 'unread', '', false);
  assert.deepEqual(unread.map((c) => c.id), ['c1']);

  const groups = filterAndSortChats(sampleChats, 'groups', '', false);
  assert.deepEqual(groups.map((c) => c.id), ['c2']);

  const archived = filterAndSortChats(sampleChats, 'all', '', true);
  assert.deepEqual(archived.map((c) => c.id), ['c3']);

  const searched = filterAndSortChats(sampleChats, 'all', 'سارة', false);
  assert.deepEqual(searched.map((c) => c.id), ['c1']);
});

test('applyPollVote switches votes cleanly and toggles off on repeat click', () => {
  const initial: PollOption[] = [
    { id: 'o1', text: 'نعم', voterIds: ['u1'] },
    { id: 'o2', text: 'لا', voterIds: [] }
  ];

  const switched = applyPollVote(initial, 'o2', 'u1');
  assert.deepEqual(switched[0].voterIds, []);
  assert.deepEqual(switched[1].voterIds, ['u1']);

  const toggledOff = applyPollVote(switched, 'o2', 'u1');
  assert.deepEqual(toggledOff[1].voterIds, []);
});

test('formatCallDuration and validateProfileInput adhere to schema boundaries', () => {
  assert.equal(formatCallDuration(65), '01:05');
  assert.equal(formatCallDuration(3661), '01:01:01');

  assert.equal(validateProfileInput('أحمد', 'متاح').valid, true);
  assert.equal(validateProfileInput('   ', 'متاح').valid, false);
  assert.equal(validateProfileInput('أحمد', 'x'.repeat(201)).valid, false);
});

test('formatWhatsAppTime detects yesterday relative to nowMs', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0).getTime();
  const yesterday = new Date(2026, 10, 14, 15, 30, 0).getTime();
  assert.equal(formatWhatsAppTime(yesterday, now), 'أمس');
});

test('validateAvatarUrl and getVisibilityLabel enforce schema limits and labels', () => {
  assert.equal(validateAvatarUrl('data:image/jpeg;base64,abc'), true);
  assert.equal(validateAvatarUrl('x'.repeat(65537)), false);
  assert.equal(getVisibilityLabel('everyone'), 'الجميع');
  assert.equal(getVisibilityLabel('contacts'), 'جهات الاتصال فقط');
  assert.equal(getVisibilityLabel('nobody'), 'لا أحد');
});

test('status 24-hour expiration, filtering, and audience resolution', () => {
  const now = 1_700_000_000_000;
  const activeStatus: StatusItem = {
    id: 'st_1',
    authorId: 'u1',
    authorName: 'أحمد',
    authorAvatar: '',
    type: 'text',
    content: 'نشط',
    backgroundColor: '#005C4B',
    viewerIds: ['u1', 'u2'],
    viewedByIds: [],
    viewCount: 0,
    viewedByMe: true,
    createdAtMs: now - 3600_000,
    expiresAtMs: now - 3600_000 + STATUS_TTL_MS
  };
  const expiredStatus: StatusItem = {
    ...activeStatus,
    id: 'st_2',
    createdAtMs: now - STATUS_TTL_MS - 1000,
    expiresAtMs: now - 1000
  };

  assert.equal(isStatusExpired(activeStatus, now), false);
  assert.equal(isStatusExpired(expiredStatus, now), true);

  const activeList = filterActiveStatuses([expiredStatus, activeStatus], now);
  assert.deepEqual(activeList.map((s) => s.id), ['st_1']);

  assert.equal(formatRemainingStatusTime(now + 3600_000 * 5, now), 'يتبقى 5 ساعة');
  assert.equal(formatRemainingStatusTime(now + 60_000 * 25, now), 'يتبقى 25 دقيقة');
  assert.equal(formatRemainingStatusTime(now + 10_000, now), 'ينتهي قريباً');

  assert.deepEqual(
    resolveStatusViewerIds('me', ['c1', 'c2', 'c3'], ['c2', 'me']),
    ['me', 'c2']
  );
  assert.deepEqual(
    resolveStatusViewerIds('me', ['c1', 'c2']),
    ['me', 'c1', 'c2']
  );

  const contacts = extractContactsFromChats(
    [
      {
        ...sampleChats[0],
        peerUid: 'peer_new',
        title: 'نورة'
      }
    ],
    [],
    'me'
  );
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].uid, 'peer_new');
});

test('extractChatSharedAssets extracts media, links, and docs, sorts newest-first, and skips deleted', () => {
  const base: Omit<DecryptedMessage, 'id' | 'type' | 'payload' | 'createdAtMs' | 'isDeleted'> = {
    chatId: 'chat_1',
    senderId: 'u1',
    senderName: 'سارة',
    ciphertext: 'cipher',
    iv: 'iv',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    status: 'read'
  };

  const msgs: DecryptedMessage[] = [
    {
      ...base,
      id: 'm_old_img',
      type: 'image',
      payload: { text: 'أول صورة', mediaUrl: '/img1.jpg' },
      createdAtMs: 1000,
      isDeleted: false
    },
    {
      ...base,
      id: 'm_deleted_img',
      type: 'image',
      payload: { text: 'صورة محذوفة', mediaUrl: '/deleted.jpg' },
      createdAtMs: 5000,
      isDeleted: true
    },
    {
      ...base,
      id: 'm_links',
      type: 'text',
      payload: { text: 'راجع https://www.firebase.google.com/docs/، وكذلك (https://web.dev/pwa/).' },
      createdAtMs: 3000,
      isDeleted: false
    },
    {
      ...base,
      id: 'm_doc',
      type: 'file',
      payload: { text: 'عقد العمل', fileName: 'contract.pdf', fileSizeLabel: '1.2 MB' },
      createdAtMs: 4000,
      isDeleted: false
    },
    {
      ...base,
      id: 'm_new_img',
      type: 'image',
      payload: { text: 'صورة أحدث', mediaUrl: '/img2.jpg' },
      createdAtMs: 6000,
      isDeleted: false
    }
  ];

  const assets = extractChatSharedAssets(msgs);
  assert.deepEqual(assets.media.map((m) => m.id), ['m_new_img', 'm_old_img']);
  assert.equal(assets.links.length, 2);
  assert.equal(assets.links[0].url, 'https://www.firebase.google.com/docs/');
  assert.equal(assets.links[0].hostname, 'firebase.google.com');
  assert.equal(assets.links[1].url, 'https://web.dev/pwa/');
  assert.equal(assets.links[1].hostname, 'web.dev');
  assert.equal(assets.docs.length, 1);
  assert.equal(assets.docs[0].fileName, 'contract.pdf');
  assert.equal(assets.docs[0].fileSizeLabel, '1.2 MB');
  assert.equal(assets.totalCount, 5);
});
