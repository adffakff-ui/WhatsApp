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
  extractChatSharedAssets,
  buildDirectChatId,
  isRemoteFirebaseUid,
  MAX_STATUS_VIDEO_SECONDS,
  validateStatusVideoDuration,
  formatMediaSeconds,
  buildChannelInviteCode,
  sortStatusesWithPinned,
  resolveMessageReceiptStatus,
  getMessageReceiptDetails,
  mergePollVotesMap,
  filterExpiredDisappearingMessages,
  splitTextByHighlight,
  searchMessagesInChat,
  searchAllChatsMessages,
  normalizeWasilId,
  validateWasilId,
  suggestWasilIdFromName,
  groupStoriesByUser,
  stepStoryViewerPosition,
  getMessageSearchableText,
  SWIPE_REPLY_TRIGGER_PX,
  SWIPE_REPLY_MAX_PX,
  computeSwipeReplyOffset,
  isSwipeReplyThresholdMet,
  formatReplyPreviewText,
  buildQuickReplySuggestions
} from './chatLogic';
import {
  filterStickersByCategory,
  getStickerById,
  isLottieSticker,
  STICKER_CATALOG,
  STICKER_CATEGORIES
} from './stickers';
import {
  cloneLottieData,
  getLottieAnimationById,
  isValidLottieData
} from './lottieStickers';
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

test('buildDirectChatId is symmetric/commutative and matches Firestore ID rules', () => {
  const ab = buildDirectChatId('uid_alpha_123', 'uid_beta_456');
  const ba = buildDirectChatId('uid_beta_456', 'uid_alpha_123');
  assert.equal(ab, ba);
  assert.ok(/^[a-zA-Z0-9_-]{1,128}$/.test(ab));
});

test('isRemoteFirebaseUid distinguishes real UIDs from local demo/contact prefixes', () => {
  assert.equal(isRemoteFirebaseUid('ic9rp0CjQ7WX0BB2lZwJBDNMHX22'), true);
  assert.equal(isRemoteFirebaseUid('demo_local_user'), false);
  assert.equal(isRemoteFirebaseUid('peer_sara'), false);
  assert.equal(isRemoteFirebaseUid('contact_123'), false);
  assert.equal(isRemoteFirebaseUid('gcontact_abc'), false);
  assert.equal(isRemoteFirebaseUid(''), false);
});

test('3-minute status video validation, formatting, channel invite codes, and pinned sorting', () => {
  assert.equal(MAX_STATUS_VIDEO_SECONDS, 180);
  assert.equal(validateStatusVideoDuration(12).valid, true);
  assert.equal(validateStatusVideoDuration(180).valid, true);
  assert.equal(validateStatusVideoDuration(181).valid, false);
  assert.equal(validateStatusVideoDuration(0).valid, false);
  assert.equal(validateStatusVideoDuration(-5).valid, false);

  assert.equal(formatMediaSeconds(0), '00:00');
  assert.equal(formatMediaSeconds(75), '01:15');
  assert.equal(formatMediaSeconds(180), '03:00');

  const code = buildChannelInviteCode('comm_tech_2026');
  assert.ok(code.startsWith('WSL-'));
  assert.equal(code.length, 12);
  assert.equal(code, buildChannelInviteCode('comm_tech_2026'));

  const now = 1_700_000_000_000;
  const s1: StatusItem = {
    id: 'st_old',
    authorId: 'u1',
    authorName: 'أكرم',
    authorAvatar: '',
    type: 'text',
    content: 'أولى',
    backgroundColor: '#005C4B',
    viewerIds: ['u1'],
    viewedByIds: [],
    viewCount: 0,
    viewedByMe: false,
    createdAtMs: now - 5000,
    expiresAtMs: now + STATUS_TTL_MS
  };
  const s2: StatusItem = {
    ...s1,
    id: 'st_new',
    content: 'أحدث',
    createdAtMs: now - 1000
  };
  const sorted = sortStatusesWithPinned([s2, s1], ['st_old'], now);
  assert.deepEqual(sorted.map((s) => s.id), ['st_old', 'st_new']);
  assert.equal(sorted[0].pinned, true);
  assert.equal(sorted[1].pinned, false);
});

test('resolveMessageReceiptStatus accurately resolves single check, double gray checks, and double blue checks', () => {
  // Only sender in arrays -> sent (single gray check)
  assert.equal(resolveMessageReceiptStatus('me', ['me'], ['me']), 'sent');
  assert.equal(resolveMessageReceiptStatus('me', [], []), 'sent');

  // Peer delivered but not read -> delivered (double gray checks)
  assert.equal(resolveMessageReceiptStatus('me', ['me', 'peer_1'], ['me']), 'delivered');

  // Peer read -> read (double blue checks)
  assert.equal(resolveMessageReceiptStatus('me', ['me', 'peer_1'], ['me', 'peer_1']), 'read');

  // Group chat: at least one peer delivered vs read
  assert.equal(resolveMessageReceiptStatus('me', ['me', 'u2'], ['me']), 'delivered');
  assert.equal(resolveMessageReceiptStatus('me', ['me', 'u2', 'u3'], ['me', 'u3']), 'read');

  // Fallback for legacy records without receipt arrays
  assert.equal(resolveMessageReceiptStatus('me', undefined, undefined, 'sent'), 'sent');
  assert.equal(resolveMessageReceiptStatus('me', undefined, undefined, 'read'), 'read');
});

test('getMessageReceiptDetails derives sent, delivered, and read directly from deliveredToIds and readByIds', () => {
  // Sent only
  const sentDetails = getMessageReceiptDetails({
    senderId: 'me',
    deliveredToIds: ['me'],
    readByIds: ['me'],
    status: 'sent'
  });
  assert.equal(sentDetails.status, 'sent');
  assert.equal(sentDetails.label, 'مرسلة');
  assert.deepEqual(sentDetails.deliveredPeerIds, []);
  assert.deepEqual(sentDetails.readPeerIds, []);

  // Delivered even if cached status field lagged behind
  const deliveredDetails = getMessageReceiptDetails({
    senderId: 'me',
    deliveredToIds: ['me', 'peer_1'],
    readByIds: ['me'],
    status: 'sent'
  });
  assert.equal(deliveredDetails.status, 'delivered');
  assert.equal(deliveredDetails.label, 'مستلمة');
  assert.deepEqual(deliveredDetails.deliveredPeerIds, ['peer_1']);
  assert.deepEqual(deliveredDetails.deliveredOnlyPeerIds, ['peer_1']);
  assert.deepEqual(deliveredDetails.readPeerIds, []);

  // Read overrides delivered & implies delivery even if deliveredToIds omitted peer
  const readDetails = getMessageReceiptDetails(
    {
      senderId: 'me',
      deliveredToIds: ['me', 'peer_2'],
      readByIds: ['me', 'peer_1'],
      status: 'delivered'
    },
    true
  );
  assert.equal(readDetails.status, 'read');
  assert.equal(readDetails.label, 'مقروءة');
  assert.deepEqual(readDetails.readPeerIds, ['peer_1']);
  assert.deepEqual(readDetails.deliveredOnlyPeerIds, ['peer_2']);
  assert.ok(readDetails.deliveredPeerIds.includes('peer_1'));
  assert.ok(readDetails.deliveredPeerIds.includes('peer_2'));
  assert.equal(readDetails.description, 'مقروءة لدى 1');

  // Sending and failed preserve client transport states
  assert.equal(
    getMessageReceiptDetails({
      senderId: 'me',
      deliveredToIds: ['me'],
      readByIds: ['me'],
      status: 'sending'
    }).status,
    'sending'
  );
  assert.equal(
    getMessageReceiptDetails({
      senderId: 'me',
      deliveredToIds: ['me'],
      readByIds: ['me'],
      status: 'failed'
    }).status,
    'failed'
  );
});

test('mergePollVotesMap maps uid->optionId accurately and handles empty votes', () => {
  const options: PollOption[] = [
    { id: 'opt_1', text: 'نعم', voterIds: [] },
    { id: 'opt_2', text: 'لا', voterIds: [] }
  ];
  const merged = mergePollVotesMap(options, { u1: 'opt_1', u2: 'opt_2', u3: 'opt_1' });
  assert.deepEqual(merged[0].voterIds, ['u1', 'u3']);
  assert.deepEqual(merged[1].voterIds, ['u2']);
});

test('filterExpiredDisappearingMessages filters old messages when disappearingSeconds > 0', () => {
  const now = 1_700_000_000_000;
  const baseMsg: DecryptedMessage = {
    id: 'm1',
    chatId: 'c1',
    senderId: 'me',
    senderName: 'أحمد',
    type: 'text',
    payload: { text: 'مرحبا' },
    ciphertext: 'c',
    iv: 'iv',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    status: 'sent',
    createdAtMs: now - 90_000_000 // 25 hours ago
  };
  const recentMsg: DecryptedMessage = {
    ...baseMsg,
    id: 'm2',
    createdAtMs: now - 3600_000 // 1 hour ago
  };

  assert.equal(filterExpiredDisappearingMessages([baseMsg, recentMsg], 0, now).length, 2);
  const filtered = filterExpiredDisappearingMessages([baseMsg, recentMsg], 86400, now);
  assert.deepEqual(filtered.map((m) => m.id), ['m2']);
});

test('splitTextByHighlight splits matching text segments including normalized Arabic alef/yeh', () => {
  const parts = splitTextByHighlight('مرحبا أحمد، هذا اختبار أمني', 'احمد');
  assert.deepEqual(parts, [
    { text: 'مرحبا ', match: false },
    { text: 'أحمد', match: true },
    { text: '، هذا اختبار أمني', match: false }
  ]);

  assert.deepEqual(splitTextByHighlight('نص عادي', ''), [{ text: 'نص عادي', match: false }]);
});

test('searchMessagesInChat and searchAllChatsMessages search message payloads, filenames, polls, and exclude locked/deleted', () => {
  const baseChat: ChatRoom = {
    id: 'c_open',
    type: 'direct',
    title: 'سارة المنصور',
    description: '',
    avatarUrl: '',
    memberIds: ['me', 'sara'],
    pinned: false,
    archived: false,
    muted: false,
    favorite: false,
    unreadCount: 0,
    disappearingSeconds: 0,
    lastMessagePreview: 'أهلا',
    lastMessageType: 'text',
    lastMessageSenderId: 'me',
    lastMessageStatus: 'read',
    lastMessageAtMs: 5000,
    roomSeed: 'c_open'
  };
  const lockedChat: ChatRoom = { ...baseChat, id: 'c_locked', title: 'محادثة خاصة' };

  const mkMsg = (
    id: string,
    chatId: string,
    text: string,
    createdAtMs: number,
    overrides: Partial<DecryptedMessage> = {}
  ): DecryptedMessage => ({
    id,
    chatId,
    senderId: 'me',
    senderName: 'أنا',
    type: 'text',
    payload: { text },
    ciphertext: 'c',
    iv: 'i',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    status: 'read',
    createdAtMs,
    ...overrides
  });

  const messagesMap: Record<string, DecryptedMessage[]> = {
    c_open: [
      mkMsg('m1', 'c_open', 'موعد المراجعة غداً https://example.com', 1000),
      mkMsg('m2', 'c_open', 'مستند مهم', 2000, {
        type: 'file',
        payload: { text: 'مرفق', fileName: 'Wasil-Whitepaper.pdf' }
      }),
      mkMsg('m3', 'c_open', 'تم الحذف', 3000, { isDeleted: true }),
      mkMsg('m4', 'c_open', 'استطلاع المراجعة', 4000, {
        type: 'poll',
        payload: {
          text: 'متى نجتمع من أجل المراجعة؟',
          pollQuestion: 'متى نجتمع من أجل المراجعة؟',
          pollOptions: [{ id: 'o1', text: 'الخميس صباحاً', voterIds: [] }]
        }
      })
    ],
    c_locked: [mkMsg('m5', 'c_locked', 'كلمة سرية: المراجعة', 5000)]
  };

  assert.deepEqual(
    searchMessagesInChat(messagesMap.c_open, 'whitepaper').map((m) => m.id),
    ['m2']
  );
  assert.deepEqual(
    searchMessagesInChat(messagesMap.c_open, 'الخميس').map((m) => m.id),
    ['m4']
  );
  assert.deepEqual(
    searchMessagesInChat(messagesMap.c_open, '', 'link').map((m) => m.id),
    ['m1']
  );

  const globalResults = searchAllChatsMessages(
    messagesMap,
    [baseChat, lockedChat],
    'المراجعة',
    ['c_locked']
  );
  assert.deepEqual(
    globalResults.map((r) => r.message.id),
    ['m4', 'm1']
  );
});

test('normalizeWasilId, validateWasilId, and suggestWasilIdFromName enforce clean unique handles', () => {
  assert.equal(normalizeWasilId('  @Akram_99 '), '@akram_99');
  assert.equal(normalizeWasilId('sara.dev-2026'), '@sara_dev_2026');
  assert.equal(normalizeWasilId('@@@'), '');

  assert.deepEqual(validateWasilId('@akram_99'), {
    valid: true,
    normalized: '@akram_99'
  });
  assert.deepEqual(validateWasilId('akram_99'), {
    valid: true,
    normalized: '@akram_99'
  });
  assert.equal(validateWasilId('ab').valid, false);
  assert.equal(validateWasilId('user$bad').valid, false);
  assert.equal(validateWasilId('a'.repeat(29)).valid, false);

  const suggestedFromAscii = suggestWasilIdFromName('Sara Dev', 'abc123');
  assert.equal(suggestedFromAscii, '@sara_dev_abc1');

  const suggestedFromArabic = suggestWasilIdFromName('أكرم حسن', '99xyz');
  assert.equal(suggestedFromArabic, '@wasil_99xy');
});

test('filterAndSortChats folds Arabic hamza/alef and searches description & peerAbout', () => {
  const arabicChats: ChatRoom[] = [
    {
      ...sampleChats[0],
      id: 'c_ahmad',
      title: 'أحمد العتيبي',
      peerAbout: 'مهندس برمجيات سحابية',
      lastMessagePreview: 'إرسال التقرير النهائي'
    },
    {
      ...sampleChats[1],
      id: 'c_group_desc',
      title: 'مجموعة التصميم',
      description: 'مناقشة واجهات المستخدم وتجربة الاستخدام',
      lastMessagePreview: 'أهلاً بكم'
    }
  ];

  assert.deepEqual(
    filterAndSortChats(arabicChats, 'all', 'احمد', false).map((c) => c.id),
    ['c_ahmad']
  );
  assert.deepEqual(
    filterAndSortChats(arabicChats, 'all', 'ارسال', false).map((c) => c.id),
    ['c_ahmad']
  );
  assert.deepEqual(
    filterAndSortChats(arabicChats, 'all', 'برمجيات', false).map((c) => c.id),
    ['c_ahmad']
  );
  assert.deepEqual(
    filterAndSortChats(arabicChats, 'all', 'واجهات', false).map((c) => c.id),
    ['c_group_desc']
  );
});

test('searchAllChatsMessages excludes messages created at or before clearedAtMs', () => {
  const clearedChat: ChatRoom = {
    ...sampleChats[0],
    id: 'c_cleared',
    clearedAtMs: 2500
  };
  const makeMsg = (id: string, text: string, createdAtMs: number): DecryptedMessage => ({
    id,
    chatId: 'c_cleared',
    senderId: 'me',
    senderName: 'أنا',
    type: 'text',
    payload: { text },
    ciphertext: 'c',
    iv: 'iv',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    status: 'read',
    createdAtMs
  });

  const results = searchAllChatsMessages(
    {
      c_cleared: [
        makeMsg('m_old', 'رسالة قديمة مشروع', 2000),
        makeMsg('m_boundary', 'رسالة حدية مشروع', 2500),
        makeMsg('m_new', 'رسالة جديدة مشروع', 3000)
      ]
    },
    [clearedChat],
    'مشروع'
  );

  assert.deepEqual(
    results.map((r) => r.message.id),
    ['m_new']
  );
});

test('groupStoriesByUser groups active 24h stories and stepStoryViewerPosition navigates across users', () => {
  const now = 1_700_000_000_000;
  const mkStory = (
    id: string,
    authorId: string,
    authorName: string,
    createdAtMs: number,
    viewedByMe: boolean,
    expiresAtMs = now + 3600_000
  ): StatusItem => ({
    id,
    authorId,
    authorName,
    authorAvatar: '',
    type: 'image',
    content: id,
    backgroundColor: '#005C4B',
    mediaUrl: 'data:image/jpeg;base64,abc',
    viewerIds: ['me', authorId],
    viewedByIds: viewedByMe ? ['me'] : [],
    viewCount: viewedByMe ? 1 : 0,
    viewedByMe,
    createdAtMs,
    expiresAtMs
  });

  const groups = groupStoriesByUser(
    [
      mkStory('sara_2', 'u_sara', 'سارة', now - 1000, false),
      mkStory('sara_1', 'u_sara', 'سارة', now - 5000, true),
      mkStory('expired_1', 'u_old', 'قديم', now - STATUS_TTL_MS - 5000, false, now - 1000),
      mkStory('omar_1', 'u_omar', 'عمر', now - 2000, true),
      mkStory('me_1', 'me', 'أنا', now - 3000, true)
    ],
    'me',
    now
  );

  // Order: self first, then unviewed contact (Sara), then viewed contact (Omar); expired omitted
  assert.deepEqual(
    groups.map((g) => g.authorId),
    ['me', 'u_sara', 'u_omar']
  );
  // Stories within Sara sorted chronologically (sara_1 older -> sara_2 newer)
  assert.deepEqual(
    groups[1].stories.map((s) => s.id),
    ['sara_1', 'sara_2']
  );
  assert.equal(groups[1].unviewedCount, 1);
  assert.equal(groups[1].firstUnviewedIndex, 1);

  // Step forward across user boundary: me(0) -> sara(firstUnviewed=1)
  assert.deepEqual(stepStoryViewerPosition(groups, 0, 0, 'next'), { userIdx: 1, storyIdx: 1 });
  // Step forward from sara(1) -> omar(0)
  assert.deepEqual(stepStoryViewerPosition(groups, 1, 1, 'next'), { userIdx: 2, storyIdx: 0 });
  // Step forward past last user returns null (exit viewer)
  assert.equal(stepStoryViewerPosition(groups, 2, 0, 'next'), null);

  // Step backward from omar(0) -> sara(last = 1)
  assert.deepEqual(stepStoryViewerPosition(groups, 2, 0, 'prev'), { userIdx: 1, storyIdx: 1 });
  // Step backward within sara: 1 -> 0
  assert.deepEqual(stepStoryViewerPosition(groups, 1, 1, 'prev'), { userIdx: 1, storyIdx: 0 });
  // Step backward from first user first story returns null
  assert.equal(stepStoryViewerPosition(groups, 0, 0, 'prev'), null);
});

test('STICKER_CATALOG provides categorized Arabic stickers and searchable message text', () => {
  assert.ok(STICKER_CATALOG.length >= 20);
  const ids = new Set(STICKER_CATALOG.map((s) => s.id));
  assert.equal(ids.size, STICKER_CATALOG.length);

  for (const cat of STICKER_CATEGORIES) {
    const items = filterStickersByCategory(cat.id);
    assert.ok(items.length > 0, `Category ${cat.id} should not be empty`);
  }

  const sample = getStickerById('stk_salam');
  assert.ok(sample);
  assert.equal(sample.label, 'السلام عليكم');

  const stickerMsg: DecryptedMessage = {
    id: 'm_stk_1',
    chatId: 'c_1',
    senderId: 'u_1',
    senderName: 'أحمد',
    type: 'text',
    payload: {
      text: 'ملصق: السلام عليكم',
      stickerId: 'stk_salam',
      stickerLabel: 'السلام عليكم',
      stickerCategory: 'greetings'
    },
    ciphertext: 'cipher',
    iv: 'iv123',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    status: 'sent',
    createdAtMs: 5000
  };
  assert.ok(getMessageSearchableText(stickerMsg).includes('السلام عليكم'));
});

test('swipe-to-reply offset damping, threshold detection, preview formatting, and contextual quick replies', () => {
  assert.equal(computeSwipeReplyOffset(25), 0);
  assert.equal(computeSwipeReplyOffset(0), 0);
  assert.equal(computeSwipeReplyOffset(Number.NaN), 0);
  assert.equal(computeSwipeReplyOffset(-30), -30);
  assert.equal(computeSwipeReplyOffset(-SWIPE_REPLY_TRIGGER_PX), -SWIPE_REPLY_TRIGGER_PX);
  const damped = computeSwipeReplyOffset(-200);
  assert.ok(damped < -SWIPE_REPLY_TRIGGER_PX && damped >= -SWIPE_REPLY_MAX_PX);

  assert.equal(isSwipeReplyThresholdMet(-55), false);
  assert.equal(isSwipeReplyThresholdMet(-SWIPE_REPLY_TRIGGER_PX), true);
  assert.equal(isSwipeReplyThresholdMet(damped), true);

  const mkMsg = (
    type: DecryptedMessage['type'],
    payload: DecryptedMessage['payload']
  ): DecryptedMessage => ({
    id: 'm_reply_1',
    chatId: 'c_1',
    senderId: 'peer_1',
    senderName: 'سارة',
    type,
    payload,
    ciphertext: 'c',
    iv: 'iv',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    status: 'read',
    createdAtMs: 10_000
  });

  assert.equal(
    formatReplyPreviewText(mkMsg('text', { text: 'ملصق: أهلاً', stickerLabel: 'أهلاً' })),
    'ملصق: أهلاً'
  );
  assert.equal(formatReplyPreviewText(mkMsg('image', { text: '' })), 'صورة مرفقة');
  assert.equal(formatReplyPreviewText(mkMsg('image', { text: 'لقطة شاشة' })), 'صورة: لقطة شاشة');
  assert.equal(
    formatReplyPreviewText(mkMsg('file', { text: 'ملف', fileName: 'report.pdf' })),
    'ملف: report.pdf'
  );
  assert.equal(
    formatReplyPreviewText(mkMsg('poll', { text: 'تصويت', pollQuestion: 'أين نلتقي؟' })),
    'استطلاع: أين نلتقي؟'
  );

  const questionReplies = buildQuickReplySuggestions(
    mkMsg('text', { text: 'هل الوقت مناسب الساعة ٥؟' }),
    ['نعم، بالتأكيد ✅', 'سأتصل بك الآن', '   ']
  );
  assert.ok(questionReplies.includes('نعم، بالتأكيد ✅'));
  assert.ok(questionReplies.includes('سأتصل بك الآن'));
  // Deduplication check
  assert.equal(
    questionReplies.filter((x) => x === 'نعم، بالتأكيد ✅').length,
    1
  );
  assert.ok(questionReplies.length <= 8);

  const greetingReplies = buildQuickReplySuggestions(
    mkMsg('text', { text: 'السلام عليكم يا أحمد' })
  );
  assert.equal(greetingReplies[0], 'وعليكم السلام ورحمة الله');
});

test('Lottie animated stickers integrate cleanly alongside static stickers and validate safely', () => {
  const animated = filterStickersByCategory('animated');
  assert.ok(animated.length >= 6);
  const staticOnly = STICKER_CATALOG.filter((s) => !isLottieSticker(s));
  assert.ok(staticOnly.length >= 20);
  assert.equal(filterStickersByCategory('all').length, animated.length + staticOnly.length);

  for (const stk of animated) {
    assert.equal(isLottieSticker(stk), true);
    const animData = getLottieAnimationById(stk.lottieId);
    assert.ok(animData, `Missing Lottie animation data for ${stk.id}`);
    assert.equal(isValidLottieData(animData), true);

    const cloned = cloneLottieData(animData);
    cloned.nm = 'MutatedTest';
    assert.notEqual(animData.nm, 'MutatedTest');
  }

  assert.equal(isValidLottieData(null), false);
  assert.equal(isValidLottieData({ w: 100, h: 100 }), false);
  assert.equal(isValidLottieData({ fr: 30, op: 60, w: 100, h: 100, layers: [] }), false);

  const customLottieMsg: DecryptedMessage = {
    id: 'm_lot_1',
    chatId: 'c_1',
    senderId: 'peer_1',
    senderName: 'سارة',
    type: 'text',
    payload: {
      text: 'ملصق متحرك',
      lottieId: 'lottie_heart_pulse'
    },
    ciphertext: 'c',
    iv: 'iv',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    status: 'read',
    createdAtMs: 20_000
  };
  assert.equal(formatReplyPreviewText(customLottieMsg), 'ملصق متحرك');
});



