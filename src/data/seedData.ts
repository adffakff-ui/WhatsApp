import { BUNDLED_ASSETS } from './assets';
import { deriveRoomKeyFromSeed, encryptPayload } from '../lib/crypto';
import type {
  CallRecord,
  ChatRoom,
  DecryptedMessage,
  MessagePayload,
  MessageType,
  StatusItem,
  UserProfile
} from '../types/chat';

export const DEMO_CONTACTS: UserProfile[] = [
  {
    uid: 'contact_sara',
    displayName: 'سارة المنصور',
    about: 'مصممة منتجات رقمية · الخصوصية أولاً',
    avatarUrl: BUNDLED_ASSETS.avatarSara,
    publicKeyJwk: '{"kty":"EC","crv":"P-256","x":"demoSaraX","y":"demoSaraY"}',
    safetyCode: '48291 09384 71625 50192 83746 19283 47561 90283 61728 39405 18273 64590',
    isOnline: true,
    lastSeenMs: Date.now()
  },
  {
    uid: 'contact_omar',
    displayName: 'أكرم الفاروق',
    about: 'مهندس برمجيات ونظم موزعة',
    avatarUrl: BUNDLED_ASSETS.avatarOmar,
    publicKeyJwk: '{"kty":"EC","crv":"P-256","x":"demoOmarX","y":"demoOmarY"}',
    safetyCode: '71920 38475 61920 83746 51920 38471 62534 90817 26354 81920 37465 91827',
    isOnline: true,
    lastSeenMs: Date.now() - 120000
  },
  {
    uid: 'contact_layla',
    displayName: 'ليلى الحربي',
    about: 'مديرة إبداعية · السفر والتصوير',
    avatarUrl: BUNDLED_ASSETS.avatarLayla,
    publicKeyJwk: '{"kty":"EC","crv":"P-256","x":"demoLaylaX","y":"demoLaylaY"}',
    safetyCode: '91827 36455 10293 84756 12093 48576 19203 48576 91029 38475 61728 39401',
    isOnline: false,
    lastSeenMs: Date.now() - 1800000
  }
];

export function createInitialChats(myUid: string): ChatRoom[] {
  const now = Date.now();
  return [
    {
      id: 'chat_sara',
      type: 'direct',
      title: 'سارة المنصور',
      description: 'مصممة منتجات رقمية · الخصوصية أولاً',
      avatarUrl: BUNDLED_ASSETS.avatarSara,
      peerUid: 'contact_sara',
      peerAbout: 'مصممة منتجات رقمية · الخصوصية أولاً',
      isOnline: true,
      memberIds: [myUid, 'contact_sara'],
      pinned: true,
      archived: false,
      muted: false,
      favorite: true,
      unreadCount: 0,
      disappearingSeconds: 0,
      lastMessagePreview: 'هل جربت المكالمة المرئية المشفرة الجديدة؟',
      lastMessageType: 'text',
      lastMessageSenderId: 'contact_sara',
      lastMessageStatus: 'delivered',
      lastMessageAtMs: now - 180000,
      roomSeed: 'chat_sara_seed_v1'
    },
    {
      id: 'chat_tech_group',
      type: 'group',
      title: 'مجموعة هندسة المستقبل',
      description: 'نقاشات التطوير، التشفير، ومزامنة Firebase الفورية',
      avatarUrl: BUNDLED_ASSETS.avatarTechGroup,
      isOnline: true,
      memberIds: [myUid, 'contact_sara', 'contact_omar', 'contact_layla'],
      pinned: true,
      archived: false,
      muted: false,
      favorite: false,
      unreadCount: 0,
      disappearingSeconds: 604800,
      adminOnlyPost: false,
      inviteCode: 'WSL-ENG2026',
      lastMessagePreview: 'استطلاع: ما موعد المراجعة التقنية القادم؟',
      lastMessageType: 'poll',
      lastMessageSenderId: 'contact_omar',
      lastMessageStatus: 'read',
      lastMessageAtMs: now - 900000,
      roomSeed: 'chat_tech_group_seed_v1'
    },
    {
      id: 'chat_omar',
      type: 'direct',
      title: 'أكرم الفاروق',
      description: 'مهندس برمجيات ونظم موزعة',
      avatarUrl: BUNDLED_ASSETS.avatarOmar,
      peerUid: 'contact_omar',
      peerAbout: 'مهندس برمجيات ونظم موزعة',
      isOnline: true,
      memberIds: [myUid, 'contact_omar'],
      pinned: false,
      archived: false,
      muted: false,
      favorite: true,
      unreadCount: 0,
      disappearingSeconds: 0,
      lastMessagePreview: 'تم تفعيل المزامنة عبر Firestore بنجاح ✓',
      lastMessageType: 'text',
      lastMessageSenderId: myUid,
      lastMessageStatus: 'read',
      lastMessageAtMs: now - 3600000,
      roomSeed: 'chat_omar_seed_v1'
    },
    {
      id: 'chat_layla',
      type: 'direct',
      title: 'ليلى الحربي',
      description: 'مديرة إبداعية · السفر والتصوير',
      avatarUrl: BUNDLED_ASSETS.avatarLayla,
      peerUid: 'contact_layla',
      peerAbout: 'مديرة إبداعية · السفر والتصوير',
      isOnline: false,
      memberIds: [myUid, 'contact_layla'],
      pinned: false,
      archived: false,
      muted: false,
      favorite: false,
      unreadCount: 1,
      disappearingSeconds: 0,
      lastMessagePreview: 'بانتظار اتصالك عند عودتك أونلاين',
      lastMessageType: 'text',
      lastMessageSenderId: myUid,
      lastMessageStatus: 'sent',
      lastMessageAtMs: now - 86400000,
      roomSeed: 'chat_layla_seed_v1'
    },
    {
      id: 'chat_community_security',
      type: 'community',
      title: 'مجتمع الخصوصية والأمن الرقمي',
      description: 'تحديثات التشفير، معايير WebRTC، وأفضل ممارسات الحماية.',
      avatarUrl: BUNDLED_ASSETS.avatarTechGroup,
      memberIds: [myUid, 'contact_sara', 'contact_omar'],
      pinned: false,
      archived: false,
      muted: true,
      favorite: false,
      unreadCount: 0,
      disappearingSeconds: 0,
      adminOnlyPost: true,
      inviteCode: 'WSL-SEC2026',
      lastMessagePreview: 'تحديث بروتوكول AES-GCM-256 متاح الآن للجميع',
      lastMessageType: 'text',
      lastMessageSenderId: 'contact_omar',
      lastMessageStatus: 'read',
      lastMessageAtMs: now - 172800000,
      roomSeed: 'chat_community_security_seed_v1'
    }
  ];
}

async function buildEncryptedSeedMessage(
  id: string,
  chatId: string,
  roomSeed: string,
  senderId: string,
  senderName: string,
  type: MessageType,
  payload: MessagePayload,
  createdAtMs: number,
  options?: {
    replyToId?: string;
    reactions?: Record<string, string[]>;
    starredBy?: string[];
    status?: 'sent' | 'delivered' | 'read';
  }
): Promise<DecryptedMessage> {
  const key = await deriveRoomKeyFromSeed(roomSeed);
  const envelope = await encryptPayload(JSON.stringify(payload), key);
  const reactions = options?.reactions || {};
  const reactionsCount = Object.values(reactions).reduce((acc, arr) => acc + arr.length, 0);

  return {
    id,
    chatId,
    senderId,
    senderName,
    type,
    payload,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    algorithm: envelope.algorithm,
    replyToId: options?.replyToId,
    reactions,
    reactionsCount,
    starredBy: options?.starredBy || [],
    isDeleted: false,
    status: options?.status || 'read',
    createdAtMs
  };
}

export async function createInitialMessagesMap(myUid: string, myName: string): Promise<Record<string, DecryptedMessage[]>> {
  const now = Date.now();
  return {
    chat_sara: [
      await buildEncryptedSeedMessage(
        'm_sara_1',
        'chat_sara',
        'chat_sara_seed_v1',
        'contact_sara',
        'سارة المنصور',
        'text',
        { text: 'أهلاً بك في تواصل! تم تفعيل التشفير التام بين الطرفين على هذه المحادثة.' },
        now - 3600000 * 3
      ),
      await buildEncryptedSeedMessage(
        'm_sara_2',
        'chat_sara',
        'chat_sara_seed_v1',
        myUid,
        myName,
        'text',
        {
          text: 'ممتاز جداً، التصميم سريع وسلس للغاية ومزامنة الرسائل تعمل فورا!'
        },
        now - 3600000 * 2.5,
        { reactions: { '❤️': ['contact_sara'] }, starredBy: [myUid] }
      ),
      await buildEncryptedSeedMessage(
        'm_sara_doc',
        'chat_sara',
        'chat_sara_seed_v1',
        'contact_sara',
        'سارة المنصور',
        'file',
        {
          text: 'ملف مواصفات التشفير والمصادقة',
          fileName: 'Wasil-Security-Whitepaper.pdf',
          fileSizeLabel: '1.8 MB'
        },
        now - 3600000
      ),
      await buildEncryptedSeedMessage(
        'm_sara_link',
        'chat_sara',
        'chat_sara_seed_v1',
        myUid,
        myName,
        'text',
        {
          text: 'يمكنك مراجعة وثائق الأمان والمزامنة من هنا: https://firebase.google.com/docs/firestore'
        },
        now - 2400000
      ),
      await buildEncryptedSeedMessage(
        'm_sara_3',
        'chat_sara',
        'chat_sara_seed_v1',
        'contact_sara',
        'سارة المنصور',
        'image',
        {
          text: 'لقطة من رحلة العلا بالأمس، ما رأيك في الإضاءة؟',
          mediaUrl: BUNDLED_ASSETS.statusDesertSunset
        },
        now - 1800000
      ),
      await buildEncryptedSeedMessage(
        'm_sara_4',
        'chat_sara',
        'chat_sara_seed_v1',
        'contact_sara',
        'سارة المنصور',
        'text',
        {
          text: 'هل جربت المكالمة المرئية المشفرة الجديدة؟',
          replyToText: 'ممتاز جداً، التصميم سريع وسلس للغاية ومزامنة الرسائل تعمل فورا!',
          replyToSender: myName
        },
        now - 180000,
        { replyToId: 'm_sara_2' }
      )
    ],
    chat_tech_group: [
      await buildEncryptedSeedMessage(
        'm_grp_1',
        'chat_tech_group',
        'chat_tech_group_seed_v1',
        'contact_omar',
        'أكرم الفاروق',
        'text',
        { text: 'مرحباً بالجميع 👋 جميع الرسائل في هذه المجموعة مشفرة بمفتاح AES-GCM 256.' },
        now - 7200000
      ),
      await buildEncryptedSeedMessage(
        'm_grp_2',
        'chat_tech_group',
        'chat_tech_group_seed_v1',
        'contact_sara',
        'سارة المنصور',
        'file',
        {
          text: 'ملف مواصفات واجهة المستخدم النهائية',
          fileName: 'Wasil-UI-Specs-v2.pdf',
          fileSizeLabel: '2.4 MB'
        },
        now - 3600000
      ),
      await buildEncryptedSeedMessage(
        'm_grp_3',
        'chat_tech_group',
        'chat_tech_group_seed_v1',
        'contact_omar',
        'أكرم الفاروق',
        'poll',
        {
          text: 'استطلاع: ما موعد المراجعة التقنية القادم؟',
          pollQuestion: 'ما موعد المراجعة التقنية القادم؟',
          pollOptions: [
            { id: 'opt_1', text: 'الأربعاء الساعة ٤:٠٠ عصراً', voterIds: ['contact_omar', 'contact_sara'] },
            { id: 'opt_2', text: 'الخميس الساعة ١١:٠٠ صباحاً', voterIds: ['contact_layla'] },
            { id: 'opt_3', text: 'الأحد الساعة ٨:٠٠ مساءً', voterIds: [] }
          ]
        },
        now - 900000
      )
    ],
    chat_omar: [
      await buildEncryptedSeedMessage(
        'm_omar_1',
        'chat_omar',
        'chat_omar_seed_v1',
        'contact_omar',
        'أكرم الفاروق',
        'text',
        { text: 'السلام عليكم، هل قواعد الأمان في Firestore جاهزة للنشر؟' },
        now - 7200000
      ),
      await buildEncryptedSeedMessage(
        'm_omar_2',
        'chat_omar',
        'chat_omar_seed_v1',
        myUid,
        myName,
        'text',
        { text: 'تم تفعيل المزامنة عبر Firestore بنجاح ✓' },
        now - 3600000
      )
    ],
    chat_layla: [
      await buildEncryptedSeedMessage(
        'm_layla_1',
        'chat_layla',
        'chat_layla_seed_v1',
        'contact_layla',
        'ليلى الحربي',
        'voice',
        {
          text: 'رسالة صوتية',
          voiceDurationSec: 14,
          voiceWaveform: [25, 55, 40, 85, 70, 30, 60, 95, 75, 45, 55, 80, 35, 65, 90, 50, 40, 60, 30, 20]
        },
        now - 86400000 - 300000
      ),
      await buildEncryptedSeedMessage(
        'm_layla_2',
        'chat_layla',
        'chat_layla_seed_v1',
        myUid,
        myName,
        'text',
        { text: 'بانتظار اتصالك عند عودتك أونلاين' },
        now - 86400000,
        { status: 'sent' }
      )
    ],
    chat_community_security: [
      await buildEncryptedSeedMessage(
        'm_comm_1',
        'chat_community_security',
        'chat_community_security_seed_v1',
        'contact_omar',
        'أكرم الفاروق',
        'text',
        { text: 'تحديث بروتوكول AES-GCM-256 متاح الآن للجميع مع التحقق من أرقام الأمان ذات الـ ٦٠ خانة.' },
        now - 172800000
      )
    ]
  };
}

export function createInitialStatuses(myUid = 'demo_user_me'): StatusItem[] {
  const now = Date.now();
  const ttlMs = 24 * 60 * 60 * 1000;
  return [
    {
      id: 'st_sara_1',
      authorId: 'contact_sara',
      authorName: 'سارة المنصور',
      authorAvatar: BUNDLED_ASSETS.avatarSara,
      type: 'image',
      content: 'غروب الشمس الذهبي في صحراء العلا الساحرة ✨',
      backgroundColor: '#1B2E26',
      mediaUrl: BUNDLED_ASSETS.statusDesertSunset,
      viewerIds: ['contact_sara', myUid, 'contact_omar', 'contact_layla'],
      viewedByIds: ['contact_omar'],
      viewCount: 18,
      viewedByMe: false,
      createdAtMs: now - 3600000,
      expiresAtMs: now - 3600000 + ttlMs
    },
    {
      id: 'st_omar_1',
      authorId: 'contact_omar',
      authorName: 'أكرم الفاروق',
      authorAvatar: BUNDLED_ASSETS.avatarOmar,
      type: 'text',
      content: 'الخصوصية الحقيقية تبدأ بتشفير البيانات على جهازك قبل وصولها إلى السحابة 🔐',
      backgroundColor: '#005C4B',
      fontStyle: 'display',
      viewerIds: ['contact_omar', myUid, 'contact_sara'],
      viewedByIds: [myUid],
      viewCount: 24,
      viewedByMe: true,
      createdAtMs: now - 10800000,
      expiresAtMs: now - 10800000 + ttlMs
    }
  ];
}

export function createInitialCalls(myUid: string, myName: string): CallRecord[] {
  const now = Date.now();
  return [
    {
      id: 'call_seed_1',
      callerId: 'contact_sara',
      callerName: 'سارة المنصور',
      callerAvatar: BUNDLED_ASSETS.avatarSara,
      calleeId: myUid,
      calleeName: myName,
      calleeAvatar: '',
      callType: 'video',
      status: 'ended',
      direction: 'incoming',
      durationSeconds: 342,
      encryptionFingerprint: '48291-09384-71625',
      createdAtMs: now - 7200000
    },
    {
      id: 'call_seed_2',
      callerId: myUid,
      callerName: myName,
      callerAvatar: '',
      calleeId: 'contact_omar',
      calleeName: 'أكرم الفاروق',
      calleeAvatar: BUNDLED_ASSETS.avatarOmar,
      callType: 'audio',
      status: 'ended',
      direction: 'outgoing',
      durationSeconds: 185,
      encryptionFingerprint: '71920-38475-61920',
      createdAtMs: now - 86400000
    },
    {
      id: 'call_seed_3',
      callerId: 'contact_layla',
      callerName: 'ليلى الحربي',
      callerAvatar: BUNDLED_ASSETS.avatarLayla,
      calleeId: myUid,
      calleeName: myName,
      calleeAvatar: '',
      callType: 'audio',
      status: 'missed',
      direction: 'incoming',
      durationSeconds: 0,
      encryptionFingerprint: '91827-36455-10293',
      createdAtMs: now - 172800000
    }
  ];
}
