import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
import {
  computeSafetyNumber,
  deriveRoomKeyFromSeed,
  encryptPayload,
  generateIdentityKeyPair,
  type IdentityKeys
} from './lib/crypto';
import {
  applyPollVote,
  extractContactsFromChats,
  filterActiveStatuses,
  filterAndSortChats,
  isStatusExpired,
  STATUS_TTL_MS
} from './lib/chatLogic';
import {
  createInitialCalls,
  createInitialChats,
  createInitialMessagesMap,
  createInitialStatuses,
  DEMO_CONTACTS
} from './data/seedData';
import {
  createChatInFirestore,
  deleteStatusFromFirestore,
  finalizeCallRecordInFirestore,
  inviteMemberToGroupInFirestore,
  markStatusViewedInFirestore,
  publishStatusToFirestore,
  removeMemberFromGroupInFirestore,
  saveCallRecordToFirestore,
  sendEncryptedMessageToFirestore,
  subscribeCallsFromFirestore,
  subscribeChatMessagesFromFirestore,
  subscribeStatusesFromFirestore,
  subscribeUserChatsFromFirestore,
  syncUserProfileToFirestore,
  updateGroupSettingsInFirestore,
  updatePrivacySettingsInFirestore,
  updateProfileInFirestore,
  updateThemePrefInFirestore
} from './services/firestoreSync';
import { AuthScreen } from './components/AuthScreen';
import { NavRail } from './components/NavRail';
import { ChatListPane } from './components/ChatListPane';
import { ChatWindow } from './components/ChatWindow';
import { RightDrawer } from './components/RightDrawer';
import { StatusView, type PublishStatusPayload } from './components/StatusView';
import { CallsView } from './components/CallsView';
import { CallOverlay } from './components/CallOverlay';
import { SettingsView } from './components/SettingsView';
import { NewChatModal } from './components/NewChatModal';
import { CommunitiesView } from './components/CommunitiesView';
import { StarredView } from './components/StarredView';
import { OfflineIndicator } from './components/PWAInstallButton';
import type {
  CallRecord,
  ChatFilter,
  ChatRoom,
  DecryptedMessage,
  MessagePayload,
  MessageType,
  NavTab,
  PrivacySettings,
  RightPanelMode,
  StatusItem,
  ThemeMode,
  UserProfile
} from './types/chat';

const STORAGE_KEYS = {
  KEYS: 'wasil_identity_keys_v1',
  THEME: 'wasil_theme_v1',
  CHATS: 'wasil_demo_chats_v1',
  MESSAGES: 'wasil_demo_messages_v1',
  STATUSES: 'wasil_demo_statuses_v1',
  CALLS: 'wasil_demo_calls_v1',
  PROFILE: 'wasil_demo_profile_v1',
  PRIVACY: 'wasil_demo_privacy_v1',
  ENTERED: 'wasil_entered_v1'
};

const DEFAULT_PRIVACY: PrivacySettings = {
  readReceipts: true,
  lastSeenMode: 'everyone',
  profilePhotoVisibility: 'everyone',
  bioVisibility: 'everyone'
};

function readJsonStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [isEntered, setIsEntered] = useState<boolean>(
    () => autostart || localStorage.getItem(STORAGE_KEYS.ENTERED) === 'true'
  );
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [identityKeys, setIdentityKeys] = useState<IdentityKeys | null>(() =>
    readJsonStorage<IdentityKeys>(STORAGE_KEYS.KEYS)
  );

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const saved = readJsonStorage<UserProfile>(STORAGE_KEYS.PROFILE);
    return (
      saved || {
        uid: 'demo_user_me',
        displayName: 'أحمد العتيبي',
        about: 'متاح · رسائلي مشفرة تماماً',
        avatarUrl: '',
        publicKeyJwk: '',
        safetyCode: '48291 09384 71625 50192 83746 19283 47561 90283 61728 39405 18273 64590',
        isOnline: true,
        lastSeenMs: Date.now()
      }
    );
  });

  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(() => {
    return readJsonStorage<PrivacySettings>(STORAGE_KEYS.PRIVACY) || DEFAULT_PRIVACY;
  });

  const [chats, setChats] = useState<ChatRoom[]>(() => {
    const saved = readJsonStorage<ChatRoom[]>(STORAGE_KEYS.CHATS);
    return saved || createInitialChats('demo_user_me');
  });

  const [messagesMap, setMessagesMap] = useState<Record<string, DecryptedMessage[]>>(
    () => readJsonStorage<Record<string, DecryptedMessage[]>>(STORAGE_KEYS.MESSAGES) || {}
  );

  const [statuses, setStatuses] = useState<StatusItem[]>(() => {
    const saved = readJsonStorage<StatusItem[]>(STORAGE_KEYS.STATUSES);
    return filterActiveStatuses(saved || createInitialStatuses());
  });

  const [calls, setCalls] = useState<CallRecord[]>(() => {
    const saved = readJsonStorage<CallRecord[]>(STORAGE_KEYS.CALLS);
    return saved || createInitialCalls('demo_user_me', 'أحمد العتيبي');
  });

  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>('chat_sara');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
  const [inspectMessageId, setInspectMessageId] = useState<string | null>(null);
  const [newChatModalMode, setNewChatModalMode] = useState<'direct' | 'group' | null>(null);
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);

  // Sync HTML .dark class with theme state
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  // Ensure local ECDH identity keys & encrypted seed messages exist
  useEffect(() => {
    let active = true;
    async function bootstrapCryptoAndSeeds() {
      let keys = readJsonStorage<IdentityKeys>(STORAGE_KEYS.KEYS);
      if (!keys) {
        keys = await generateIdentityKeyPair();
        localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(keys));
      }
      if (!active) return;
      setIdentityKeys(keys);
      setCurrentUser((prev) => ({
        ...prev,
        publicKeyJwk: keys!.publicKeyJwk,
        safetyCode: keys!.safetyCode
      }));

      const savedMsgs = readJsonStorage<Record<string, DecryptedMessage[]>>(STORAGE_KEYS.MESSAGES);
      if (!savedMsgs || Object.keys(savedMsgs).length === 0) {
        const seeded = await createInitialMessagesMap('demo_user_me', 'أحمد العتيبي');
        if (active) {
          setMessagesMap(seeded);
          localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(seeded));
        }
      }
    }
    void bootstrapCryptoAndSeeds();
    return () => {
      active = false;
    };
  }, []);

  // Persist preview data locally when not cloud-synced
  useEffect(() => {
    if (!isCloudSynced) {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    }
  }, [chats, isCloudSynced]);

  useEffect(() => {
    if (!isCloudSynced && Object.keys(messagesMap).length > 0) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messagesMap));
    }
  }, [messagesMap, isCloudSynced]);

  useEffect(() => {
    if (!isCloudSynced) {
      localStorage.setItem(STORAGE_KEYS.STATUSES, JSON.stringify(statuses));
      localStorage.setItem(STORAGE_KEYS.CALLS, JSON.stringify(calls));
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(currentUser));
      localStorage.setItem(STORAGE_KEYS.PRIVACY, JSON.stringify(privacySettings));
    }
  }, [statuses, calls, currentUser, privacySettings, isCloudSynced]);

  // Periodically prune expired 24-hour statuses from state and Firestore
  useEffect(() => {
    const interval = window.setInterval(() => {
      const nowMs = Date.now();
      setStatuses((prev) => {
        const expiredOwn = prev.filter(
          (st) => isStatusExpired(st, nowMs) && st.authorId === currentUser.uid
        );
        if (isCloudSynced) {
          for (const st of expiredOwn) {
            void deleteStatusFromFirestore(st.id).catch(() => {});
          }
        }
        const next = filterActiveStatuses(prev, nowMs);
        return next.length === prev.length ? prev : next;
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [isCloudSynced, currentUser.uid]);

  // Real Firebase Auth + Firestore Subscriptions
  useEffect(() => {
    let unsubChats: (() => void) | null = null;
    let unsubStatuses: (() => void) | null = null;
    let unsubCalls: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      unsubChats?.();
      unsubStatuses?.();
      unsubCalls?.();

      if (!fbUser) {
        setIsCloudSynced(false);
        return;
      }

      const keys = identityKeys || (await generateIdentityKeyPair());
      const profile: UserProfile = {
        uid: fbUser.uid,
        displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'مستخدم تواصل',
        about: 'متاح · رسائلي مشفرة تماماً',
        avatarUrl: fbUser.photoURL || '',
        email: fbUser.email || undefined,
        publicKeyJwk: keys.publicKeyJwk,
        safetyCode: keys.safetyCode,
        isOnline: true,
        lastSeenMs: Date.now()
      };

      setCurrentUser(profile);
      setIsCloudSynced(true);
      setIsEntered(true);

      const hydrated = await syncUserProfileToFirestore(
        fbUser,
        keys.publicKeyJwk,
        keys.safetyCode,
        profile.about,
        theme
      );
      setCurrentUser({
        ...profile,
        displayName: hydrated.displayName,
        about: hydrated.about,
        avatarUrl: hydrated.avatarUrl
      });
      setPrivacySettings(hydrated.privacy);
      setTheme(hydrated.theme);

      unsubChats = subscribeUserChatsFromFirestore(fbUser.uid, (cloudChats) => {
        if (cloudChats.length > 0) {
          setChats(cloudChats);
          setSelectedChatId((curr) =>
            curr && cloudChats.some((c) => c.id === curr) ? curr : cloudChats[0].id
          );
        } else {
          // Provision starter encrypted room in Firestore for new user
          void createChatInFirestore(
            `welcome_${fbUser.uid.slice(0, 12)}`,
            'direct',
            'مفكرة تواصل المشفرة',
            'مساحتك السحابية المشفرة عبر Firebase',
            '/src/assets/images/avatar_tech_group_1794759600547.jpg',
            profile,
            'أهلاً بك! تم تفعيل المزامنة السحابية والتشفير التام بين الطرفين على حسابك 🔐'
          );
        }
      });

      unsubStatuses = subscribeStatusesFromFirestore(fbUser.uid, (cloudStatuses) => {
        setStatuses(cloudStatuses);
      });

      unsubCalls = subscribeCallsFromFirestore(fbUser.uid, (cloudCalls) => {
        if (cloudCalls.length > 0) setCalls(cloudCalls);
      });
    });

    return () => {
      unsubAuth();
      unsubChats?.();
      unsubStatuses?.();
      unsubCalls?.();
    };
  }, [identityKeys]);

  // Subscribe to messages of the currently selected Firestore chat when cloud synced
  useEffect(() => {
    if (!isCloudSynced || !selectedChatId) return;
    const unsub = subscribeChatMessagesFromFirestore(
      selectedChatId,
      selectedChatId,
      currentUser.uid,
      (cloudMsgs) => {
        setMessagesMap((prev) => ({ ...prev, [selectedChatId]: cloudMsgs }));
      }
    );
    return () => unsub();
  }, [isCloudSynced, selectedChatId, currentUser.uid]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
      setIsEntered(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google.';
      setAuthError(
        msg.includes('popup')
          ? 'تم حظر النافذة المنبثقة. يمكنك السماح بالنوافذ المنبثقة أو استخدام المعاينة التفاعلية.'
          : msg
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEnterDemo = () => {
    localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
    setIsEntered(true);
  };

  const handleSignOut = async () => {
    if (isCloudSynced) {
      await signOut(auth);
    }
    localStorage.removeItem(STORAGE_KEYS.ENTERED);
    setIsCloudSynced(false);
    setIsEntered(false);
  };

  const handleToggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (isCloudSynced) {
      void updateThemePrefInFirestore(currentUser.uid, next);
    }
  };

  const contactsList = useMemo(
    () => extractContactsFromChats(chats, DEMO_CONTACTS, currentUser.uid),
    [chats, currentUser.uid]
  );

  const visibleChats = useMemo(
    () => filterAndSortChats(chats, chatFilter, searchQuery, showArchived),
    [chats, chatFilter, searchQuery, showArchived]
  );

  const totalUnread = useMemo(
    () => chats.reduce((sum, c) => sum + (c.archived ? 0 : c.unreadCount), 0),
    [chats]
  );

  const archivedCount = useMemo(
    () => chats.filter((c) => c.archived).length,
    [chats]
  );

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  const activeMessages = useMemo(
    () => (selectedChatId ? messagesMap[selectedChatId] || [] : []),
    [messagesMap, selectedChatId]
  );

  const [activeSafetyCode, setActiveSafetyCode] = useState(currentUser.safetyCode);
  useEffect(() => {
    async function computePairCode() {
      if (!selectedChat?.peerUid) {
        setActiveSafetyCode(currentUser.safetyCode);
        return;
      }
      const peer = DEMO_CONTACTS.find((c) => c.uid === selectedChat.peerUid);
      if (peer && currentUser.publicKeyJwk) {
        const code = await computeSafetyNumber(currentUser.publicKeyJwk, peer.publicKeyJwk);
        setActiveSafetyCode(code);
      } else {
        setActiveSafetyCode(currentUser.safetyCode);
      }
    }
    void computePairCode();
  }, [selectedChat?.id, selectedChat?.peerUid, currentUser.publicKeyJwk, currentUser.safetyCode]);

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setMobileChatOpen(true);
    setRightPanelMode('none');
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
  };

  const handleSendMessage = async (
    type: MessageType,
    payload: MessagePayload,
    replyToId?: string
  ) => {
    if (!selectedChat) return;

    if (isCloudSynced) {
      await sendEncryptedMessageToFirestore(
        selectedChat.id,
        selectedChat.roomSeed,
        currentUser,
        type,
        payload,
        selectedChat.memberIds,
        replyToId
      );
      return;
    }

    const key = await deriveRoomKeyFromSeed(selectedChat.roomSeed);
    const envelope = await encryptPayload(JSON.stringify(payload), key);
    const newMsg: DecryptedMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      chatId: selectedChat.id,
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      type,
      payload,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      algorithm: envelope.algorithm,
      replyToId,
      reactions: {},
      reactionsCount: 0,
      starredBy: [],
      isDeleted: false,
      status: 'read',
      createdAtMs: Date.now()
    };

    setMessagesMap((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), newMsg]
    }));

    setChats((prev) =>
      prev.map((c) =>
        c.id === selectedChat.id
          ? {
              ...c,
              lastMessagePreview: payload.text,
              lastMessageType: type,
              lastMessageSenderId: currentUser.uid,
              lastMessageStatus: 'read',
              lastMessageAtMs: newMsg.createdAtMs
            }
          : c
      )
    );
  };

  const handleVotePoll = (messageId: string, optionId: string) => {
    if (!selectedChatId) return;
    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) => {
        if (m.id !== messageId || !m.payload.pollOptions) return m;
        return {
          ...m,
          payload: {
            ...m.payload,
            pollOptions: applyPollVote(m.payload.pollOptions, optionId, currentUser.uid)
          }
        };
      })
    }));
  };

  const handleReactMessage = (messageId: string, emoji: string) => {
    if (!selectedChatId) return;
    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) => {
        if (m.id !== messageId) return m;
        const existingUsers = m.reactions[emoji] || [];
        const hasReacted = existingUsers.includes(currentUser.uid);
        const updatedUsers = hasReacted
          ? existingUsers.filter((id) => id !== currentUser.uid)
          : [...existingUsers, currentUser.uid];
        const nextReactions = { ...m.reactions, [emoji]: updatedUsers };
        const count = Object.values(nextReactions).reduce((a, b) => a + b.length, 0);
        return { ...m, reactions: nextReactions, reactionsCount: count };
      })
    }));
  };

  const handleToggleStarMessage = (messageId: string) => {
    if (!selectedChatId) return;
    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) => {
        if (m.id !== messageId) return m;
        const starred = m.starredBy.includes(currentUser.uid);
        return {
          ...m,
          starredBy: starred
            ? m.starredBy.filter((id) => id !== currentUser.uid)
            : [...m.starredBy, currentUser.uid]
        };
      })
    }));
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!selectedChatId) return;
    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) =>
        m.id === messageId ? { ...m, isDeleted: true } : m
      )
    }));
  };

  const handleToggleChatProp = (
    chatId: string,
    prop: 'pinned' | 'archived' | 'muted' | 'favorite'
  ) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, [prop]: !c[prop] } : c))
    );
  };

  const handleSetDisappearing = (chatId: string, seconds: number) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, disappearingSeconds: seconds } : c))
    );
  };

  const handleClearChat = (chatId: string) => {
    setMessagesMap((prev) => ({ ...prev, [chatId]: [] }));
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, lastMessagePreview: 'تم مسح الدردشة' } : c))
    );
  };

  const handleStartCallForChat = async (chat: ChatRoom, callType: 'audio' | 'video') => {
    const call: CallRecord = {
      id: `call_${Date.now()}`,
      callerId: currentUser.uid,
      callerName: currentUser.displayName,
      callerAvatar: currentUser.avatarUrl,
      calleeId: chat.peerUid || chat.id,
      calleeName: chat.title,
      calleeAvatar: chat.avatarUrl,
      callType,
      status: 'ringing',
      direction: 'outgoing',
      durationSeconds: 0,
      encryptionFingerprint: activeSafetyCode.slice(0, 17).replace(/\s+/g, '-'),
      createdAtMs: Date.now()
    };
    setActiveCall(call);
    if (isCloudSynced) {
      await saveCallRecordToFirestore(call);
    }
  };

  const handleEndCall = async (durationSeconds: number) => {
    if (!activeCall) return;
    const finished: CallRecord = {
      ...activeCall,
      status: durationSeconds > 0 ? 'ended' : 'missed',
      durationSeconds
    };
    setActiveCall(null);
    setCalls((prev) => [finished, ...prev]);
    if (isCloudSynced) {
      await finalizeCallRecordInFirestore(
        finished.id,
        durationSeconds > 0 ? 'ended' : 'missed',
        durationSeconds
      );
    }
  };

  const handleCreateDirectChat = async (name: string, peerUid?: string) => {
    const contact = DEMO_CONTACTS.find((c) => c.uid === peerUid);
    const chatId = `chat_${Date.now()}`;

    if (isCloudSynced) {
      await createChatInFirestore(
        chatId,
        'direct',
        name,
        contact?.about || 'محادثة مشفرة جديدة',
        contact?.avatarUrl || '',
        currentUser,
        `تم بدء محادثة مشفرة مع ${name} 🔒`
      );
      setSelectedChatId(chatId);
      setActiveTab('chats');
      return;
    }

    const newRoom: ChatRoom = {
      id: chatId,
      type: 'direct',
      title: name,
      description: contact?.about || 'متاح',
      avatarUrl: contact?.avatarUrl || '',
      peerUid: peerUid || `peer_${Date.now()}`,
      isOnline: contact?.isOnline ?? true,
      memberIds: [currentUser.uid, peerUid || 'peer'],
      pinned: false,
      archived: false,
      muted: false,
      favorite: false,
      unreadCount: 0,
      disappearingSeconds: 0,
      lastMessagePreview: `تم بدء محادثة مشفرة مع ${name}`,
      lastMessageType: 'text',
      lastMessageSenderId: currentUser.uid,
      lastMessageStatus: 'read',
      lastMessageAtMs: Date.now(),
      roomSeed: chatId
    };

    const key = await deriveRoomKeyFromSeed(chatId);
    const welcomeText = `تم إنشاء قناة اتصال مشفرة تماماً مع ${name} 🔒`;
    const env = await encryptPayload(JSON.stringify({ text: welcomeText }), key);

    setChats((prev) => [newRoom, ...prev]);
    setMessagesMap((prev) => ({
      ...prev,
      [chatId]: [
        {
          id: `msg_init_${Date.now()}`,
          chatId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          type: 'text',
          payload: { text: welcomeText },
          ciphertext: env.ciphertext,
          iv: env.iv,
          algorithm: env.algorithm,
          reactions: {},
          reactionsCount: 0,
          starredBy: [],
          isDeleted: false,
          status: 'read',
          createdAtMs: Date.now()
        }
      ]
    }));
    setSelectedChatId(chatId);
    setMobileChatOpen(true);
    setActiveTab('chats');
  };

  const handleCreateGroupChat = async (
    title: string,
    description: string,
    memberUids: string[],
    avatarUrl = '/src/assets/images/avatar_tech_group_1794759600547.jpg'
  ) => {
    const chatId = `group_${Date.now()}`;
    const invitedContacts = contactsList.filter((c) => memberUids.includes(c.uid));

    if (isCloudSynced) {
      await createChatInFirestore(
        chatId,
        'group',
        title,
        description || 'مجموعة مشفرة تماماً',
        avatarUrl,
        currentUser,
        `تم إنشاء المجموعة "${title}" بتشفير تام بين الأعضاء 🔒`,
        invitedContacts
      );
      setSelectedChatId(chatId);
      setMobileChatOpen(true);
      setActiveTab('chats');
      return;
    }

    const newGroup: ChatRoom = {
      id: chatId,
      type: 'group',
      title,
      description: description || 'مجموعة تواصل مشفرة',
      avatarUrl,
      isOnline: true,
      memberIds: Array.from(new Set([currentUser.uid, ...memberUids])),
      pinned: false,
      archived: false,
      muted: false,
      favorite: false,
      unreadCount: 0,
      disappearingSeconds: 0,
      lastMessagePreview: `تم إنشاء مجموعة ${title}`,
      lastMessageType: 'text',
      lastMessageSenderId: currentUser.uid,
      lastMessageStatus: 'read',
      lastMessageAtMs: Date.now(),
      roomSeed: chatId
    };
    const key = await deriveRoomKeyFromSeed(chatId);
    const welcomeText = `تم إنشاء المجموعة "${title}" بتشفير تام بين الأعضاء 🔒`;
    const env = await encryptPayload(JSON.stringify({ text: welcomeText }), key);

    setChats((prev) => [newGroup, ...prev]);
    setMessagesMap((prev) => ({
      ...prev,
      [chatId]: [
        {
          id: `msg_grp_init_${Date.now()}`,
          chatId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          type: 'text',
          payload: { text: welcomeText },
          ciphertext: env.ciphertext,
          iv: env.iv,
          algorithm: env.algorithm,
          reactions: {},
          reactionsCount: 0,
          starredBy: [],
          isDeleted: false,
          status: 'read',
          createdAtMs: Date.now()
        }
      ]
    }));
    setSelectedChatId(chatId);
    setMobileChatOpen(true);
    setActiveTab('chats');
  };

  const handleUpdateGroupSettings = async (
    chatId: string,
    title: string,
    description: string,
    avatarUrl: string
  ) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title, description, avatarUrl } : c))
    );
    if (isCloudSynced) {
      await updateGroupSettingsInFirestore(chatId, title, description, avatarUrl);
    }
  };

  const handleInviteMemberToGroup = async (chatId: string, contact: UserProfile) => {
    const target = chats.find((c) => c.id === chatId);
    if (!target || target.memberIds.includes(contact.uid)) return;
    const nextMembers = Array.from(new Set([...target.memberIds, contact.uid])).slice(0, 50);

    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, memberIds: nextMembers } : c))
    );

    if (isCloudSynced) {
      await inviteMemberToGroupInFirestore(chatId, contact, nextMembers);
      await sendEncryptedMessageToFirestore(
        chatId,
        target.roomSeed,
        currentUser,
        'text',
        { text: `تمت دعوة ${contact.displayName} إلى المجموعة بتشفير تام 🔐` },
        nextMembers
      );
      return;
    }

    const key = await deriveRoomKeyFromSeed(target.roomSeed);
    const noticeText = `تمت دعوة ${contact.displayName} إلى المجموعة بتشفير تام 🔐`;
    const env = await encryptPayload(JSON.stringify({ text: noticeText }), key);
    const noticeMsg: DecryptedMessage = {
      id: `msg_inv_${Date.now()}`,
      chatId,
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      type: 'text',
      payload: { text: noticeText },
      ciphertext: env.ciphertext,
      iv: env.iv,
      algorithm: env.algorithm,
      reactions: {},
      reactionsCount: 0,
      starredBy: [],
      isDeleted: false,
      status: 'read',
      createdAtMs: Date.now()
    };
    setMessagesMap((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), noticeMsg]
    }));
  };

  const handleRemoveMemberFromGroup = async (chatId: string, memberUid: string) => {
    const target = chats.find((c) => c.id === chatId);
    if (!target || memberUid === currentUser.uid) return;
    const nextMembers = target.memberIds.filter((id) => id !== memberUid);
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, memberIds: nextMembers } : c))
    );
    if (isCloudSynced) {
      await removeMemberFromGroupInFirestore(chatId, memberUid, nextMembers);
    }
  };

  const handlePublishStatus = async (payload: PublishStatusPayload) => {
    if (isCloudSynced) {
      const created = await publishStatusToFirestore(currentUser, payload);
      setStatuses((prev) =>
        filterActiveStatuses([created, ...prev.filter((s) => s.id !== created.id)])
      );
      return;
    }
    const nowMs = Date.now();
    const newStatus: StatusItem = {
      id: `st_${nowMs}_${Math.random().toString(36).slice(2, 5)}`,
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      authorAvatar: currentUser.avatarUrl,
      type: payload.type,
      content: payload.content,
      backgroundColor: payload.backgroundColor,
      fontStyle: payload.fontStyle,
      ...(payload.mediaUrl ? { mediaUrl: payload.mediaUrl } : {}),
      viewerIds: payload.viewerIds,
      viewedByIds: [],
      viewCount: 0,
      viewedByMe: true,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + STATUS_TTL_MS
    };
    setStatuses((prev) => filterActiveStatuses([newStatus, ...prev]));
  };

  const handleMarkStatusViewed = (statusId: string) => {
    const target = statuses.find((s) => s.id === statusId);
    if (!target || target.viewedByMe) return;
    setStatuses((prev) =>
      prev.map((s) =>
        s.id === statusId && !s.viewedByMe
          ? {
              ...s,
              viewedByMe: true,
              viewedByIds: Array.from(new Set([...s.viewedByIds, currentUser.uid])),
              viewCount: s.viewCount + 1
            }
          : s
      )
    );
    if (isCloudSynced && target.authorId !== currentUser.uid) {
      void markStatusViewedInFirestore(
        statusId,
        currentUser.uid,
        target.viewedByIds,
        target.viewCount
      );
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    setStatuses((prev) => prev.filter((s) => s.id !== statusId));
    if (isCloudSynced) {
      await deleteStatusFromFirestore(statusId);
    }
  };

  const handleSaveProfile = async (displayName: string, about: string, avatarUrl: string) => {
    const updated = { ...currentUser, displayName, about, avatarUrl };
    setCurrentUser(updated);
    if (isCloudSynced) {
      await updateProfileInFirestore(currentUser.uid, updated, { displayName, about, avatarUrl });
    }
  };

  const handleUpdatePrivacy = async (nextPrivacy: PrivacySettings) => {
    setPrivacySettings(nextPrivacy);
    if (isCloudSynced) {
      await updatePrivacySettingsInFirestore(currentUser.uid, nextPrivacy);
    }
  };

  if (!isEntered) {
    return (
      <AuthScreen
        onGoogleSignIn={handleGoogleSignIn}
        onEnterDemo={handleEnterDemo}
        isSigningIn={isSigningIn}
        authError={authError}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#EAE6DF] dark:bg-[#0C1317] flex">
      <div className="w-full h-full flex overflow-hidden bg-white dark:bg-[#111B21]">
        {/* Navigation Rail */}
        <NavRail
          activeTab={showArchived ? 'archived' : activeTab}
          onSelectTab={(tab) => {
            if (tab === 'archived') {
              setActiveTab('chats');
              setShowArchived(true);
            } else {
              setShowArchived(false);
              setActiveTab(tab);
            }
          }}
          totalUnread={totalUnread}
          archivedCount={archivedCount}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          currentUser={currentUser}
          hideMobileNav={activeTab === 'chats' && mobileChatOpen}
        />

        {/* Active Workspace Pane */}
        {activeTab === 'chats' && (
          <div className="flex-1 flex h-full min-w-0">
            <div
              className={`${
                mobileChatOpen ? 'hidden md:block' : 'block'
              } w-full md:w-[340px] lg:w-[380px] shrink-0 h-full`}
            >
              <ChatListPane
                chats={visibleChats}
                selectedChatId={selectedChatId}
                onSelectChat={handleSelectChat}
                filter={chatFilter}
                onChangeFilter={setChatFilter}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                showArchived={showArchived}
                onToggleArchivedView={setShowArchived}
                archivedCount={archivedCount}
                myUid={currentUser.uid}
                onOpenNewChat={() => setNewChatModalMode('direct')}
                onOpenNewGroup={() => setNewChatModalMode('group')}
                onTogglePin={(id) => handleToggleChatProp(id, 'pinned')}
                onToggleArchive={(id) => handleToggleChatProp(id, 'archived')}
                onToggleMute={(id) => handleToggleChatProp(id, 'muted')}
                onToggleFavorite={(id) => handleToggleChatProp(id, 'favorite')}
                isCloudSynced={isCloudSynced}
              />
            </div>

            <div
              className={`${
                mobileChatOpen ? 'flex' : 'hidden md:flex'
              } flex-1 min-w-0 h-full`}
            >
              <ChatWindow
                chat={selectedChat}
                messages={activeMessages}
                myUid={currentUser.uid}
                onBackMobile={() => setMobileChatOpen(false)}
                onSendMessage={handleSendMessage}
                onVotePoll={handleVotePoll}
                onReactMessage={handleReactMessage}
                onToggleStarMessage={handleToggleStarMessage}
                onDeleteMessage={handleDeleteMessage}
                onStartCall={(type) => {
                  if (selectedChat) void handleStartCallForChat(selectedChat, type);
                }}
                onOpenRightPanel={(mode, msgId) => {
                  setInspectMessageId(msgId || null);
                  setRightPanelMode(mode);
                }}
                onClearChat={handleClearChat}
                onSetDisappearing={handleSetDisappearing}
              />

              <RightDrawer
                mode={rightPanelMode}
                chat={selectedChat}
                messages={activeMessages}
                safetyCode={activeSafetyCode}
                inspectMessageId={inspectMessageId}
                currentUser={currentUser}
                contacts={contactsList}
                onClose={() => setRightPanelMode('none')}
                onSetDisappearing={handleSetDisappearing}
                onTogglePin={(id) => handleToggleChatProp(id, 'pinned')}
                onToggleFavorite={(id) => handleToggleChatProp(id, 'favorite')}
                onToggleMute={(id) => handleToggleChatProp(id, 'muted')}
                onToggleArchive={(id) => handleToggleChatProp(id, 'archived')}
                onClearChat={handleClearChat}
                onUpdateGroupSettings={handleUpdateGroupSettings}
                onInviteMemberToGroup={handleInviteMemberToGroup}
                onRemoveMemberFromGroup={handleRemoveMemberFromGroup}
              />
            </div>
          </div>
        )}

        {activeTab === 'status' && (
          <StatusView
            statuses={statuses}
            currentUser={currentUser}
            contacts={contactsList}
            onPublishStatus={handlePublishStatus}
            onMarkViewed={handleMarkStatusViewed}
            onDeleteStatus={handleDeleteStatus}
          />
        )}

        {activeTab === 'communities' && (
          <CommunitiesView
            communities={chats.filter((c) => c.type !== 'direct')}
            onSelectCommunity={(chatId) => {
              setSelectedChatId(chatId);
              setMobileChatOpen(true);
              setActiveTab('chats');
            }}
            onCreateGroup={() => setNewChatModalMode('group')}
          />
        )}

        {activeTab === 'calls' && (
          <CallsView
            calls={calls}
            chats={chats}
            onStartCall={(chat, type) => void handleStartCallForChat(chat, type)}
          />
        )}

        {activeTab === 'starred' && (
          <StarredView
            messagesMap={messagesMap}
            chats={chats}
            myUid={currentUser.uid}
            onJumpToChat={(chatId) => {
              setSelectedChatId(chatId);
              setMobileChatOpen(true);
              setActiveTab('chats');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            currentUser={currentUser}
            privacySettings={privacySettings}
            theme={theme}
            isCloudSynced={isCloudSynced}
            onToggleTheme={handleToggleTheme}
            onSaveProfile={handleSaveProfile}
            onUpdatePrivacy={handleUpdatePrivacy}
            onSignOut={() => void handleSignOut()}
            onGoogleSignIn={handleGoogleSignIn}
          />
        )}
      </div>

      {/* New Chat / Group Modal */}
      <NewChatModal
        mode={newChatModalMode}
        contacts={contactsList}
        onClose={() => setNewChatModalMode(null)}
        onCreateDirectChat={handleCreateDirectChat}
        onCreateGroupChat={handleCreateGroupChat}
      />

      {/* Active WebRTC Call Modal */}
      {activeCall && (
        <CallOverlay
          activeCall={activeCall}
          onEndCall={(dur) => void handleEndCall(dur)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
