import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth';
import {
  Lock,
  Megaphone,
  SendHorizontal,
  X,
  Check,
  MailCheck,
  LogOut,
  Fingerprint,
  ScanFace,
  KeyRound
} from 'lucide-react';
import { auth, googleProvider } from './lib/firebase';
import { BUNDLED_ASSETS } from './data/assets';
import { mapFirebaseAuthErrorToArabic, parseWasilBackupJson } from './lib/authHelpers';
import { verifyBiometricCredential } from './lib/webauthn';
import {
  computeSafetyNumber,
  deriveRoomKeyFromSeed,
  encryptPayload,
  generateIdentityKeyPair,
  type IdentityKeys
} from './lib/crypto';
import {
  applyPollVote,
  buildChannelInviteCode,
  buildDirectChatId,
  extractContactsFromChats,
  filterActiveStatuses,
  filterAndSortChats,
  isRemoteFirebaseUid,
  isStatusExpired,
  sortStatusesWithPinned,
  STATUS_TTL_MS
} from './lib/chatLogic';
import { deleteMediaBlob } from './lib/mediaStorage';
import { DEFAULT_OMAR_SETTINGS } from './lib/omarConfig';
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
  editEncryptedMessageInFirestore,
  fetchPublicProfileByUid,
  finalizeCallRecordInFirestore,
  inviteMemberToGroupInFirestore,
  markChatMessagesDeliveredInFirestore,
  markChatMessagesReadInFirestore,
  markStatusViewedInFirestore,
  publishStatusToFirestore,
  removeMemberFromGroupInFirestore,
  saveChatPrefToFirestore,
  sendEncryptedMessageToFirestore,
  setUserPresenceInFirestore,
  softDeleteMessageInFirestore,
  subscribeCallsFromFirestore,
  subscribeChatMessagesFromFirestore,
  subscribeIncomingCallsFromFirestore,
  subscribeStatusesFromFirestore,
  subscribeUserChatsFromFirestore,
  syncUserProfileToFirestore,
  togglePinStatusInFirestore,
  toggleStarMessageInFirestore,
  updateChatTypingInFirestore,
  updateGroupSettingsInFirestore,
  updateMessageReactionsInFirestore,
  updatePrivacySettingsInFirestore,
  updateProfileInFirestore,
  updateThemePrefInFirestore,
  votePollInFirestore
} from './services/firestoreSync';
import { AuthScreen, type OnboardingCompletionPayload } from './components/AuthScreen';
import { NavRail } from './components/NavRail';
import { ChatListPane } from './components/ChatListPane';
import { ChatWindow } from './components/ChatWindow';
import { RightDrawer } from './components/RightDrawer';
import { StatusView, type PublishStatusPayload } from './components/StatusView';
import { CallsView } from './components/CallsView';
import { CallOverlay } from './components/CallOverlay';
import { SettingsView } from './components/SettingsView';
import { NewChatModal } from './components/NewChatModal';
import { CommunitiesView, type SuggestedChannelItem } from './components/CommunitiesView';
import { StarredView } from './components/StarredView';
import { OmarAddonsView } from './components/OmarAddonsView';
import { OfflineIndicator } from './components/PWAInstallButton';
import { Avatar } from './components/Avatar';
import type {
  CallRecord,
  ChatFilter,
  ChatRoom,
  DecryptedMessage,
  MessagePayload,
  MessageType,
  NavTab,
  OmarSettings,
  PrivacySettings,
  RightPanelMode,
  StatusItem,
  ThemeMode,
  UserProfile
} from './types/chat';

const STORAGE_KEYS = {
  KEYS: 'wasil_identity_keys_v1',
  THEME: 'wasil_theme_v1',
  OMAR: 'wasil_omar_settings_v1',
  CHATS: 'wasil_demo_chats_v1',
  MESSAGES: 'wasil_demo_messages_v1',
  STATUSES: 'wasil_demo_statuses_v1',
  PINNED_STATUSES: 'wasil_pinned_statuses_v1',
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
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [omarSettings, setOmarSettings] = useState<OmarSettings>(() => {
    const saved = readJsonStorage<Partial<OmarSettings>>(STORAGE_KEYS.OMAR);
    return saved ? { ...DEFAULT_OMAR_SETTINGS, ...saved } : DEFAULT_OMAR_SETTINGS;
  });

  const [isEntered, setIsEntered] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEYS.ENTERED) === 'true'
  );
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [appLockedOnLaunch, setAppLockedOnLaunch] = useState<boolean>(() => {
    const savedOmar = readJsonStorage<Partial<OmarSettings>>(STORAGE_KEYS.OMAR);
    return (
      Boolean(savedOmar?.appLockOnLaunch) &&
      localStorage.getItem(STORAGE_KEYS.ENTERED) === 'true'
    );
  });
  const [launchPinInput, setLaunchPinInput] = useState('');
  const [launchPinError, setLaunchPinError] = useState<string | null>(null);
  const [usePinFallbackOnLaunch, setUsePinFallbackOnLaunch] = useState(false);
  const [biometricLaunchBusy, setBiometricLaunchBusy] = useState(false);
  const [biometricLaunchError, setBiometricLaunchError] = useState<string | null>(null);
  const [usePinFallbackForChat, setUsePinFallbackForChat] = useState(false);
  const [biometricChatBusy, setBiometricChatBusy] = useState(false);
  const [biometricChatError, setBiometricChatError] = useState<string | null>(null);
  const holdEntryForProfileStep = useRef(false);
  const demoReceiptTimersRef = useRef<number[]>([]);
  const deliveredSummaryAckedRef = useRef<Set<string>>(new Set());
  const deliveredMsgAckedRef = useRef<Set<string>>(new Set());
  const readMsgAckedRef = useRef<Set<string>>(new Set());
  const lastTypingSentRef = useRef<{ chatId: string; active: boolean } | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

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
  const [pinnedStatusIds, setPinnedStatusIds] = useState<string[]>(
    () => readJsonStorage<string[]>(STORAGE_KEYS.PINNED_STATUSES) || []
  );

  const [calls, setCalls] = useState<CallRecord[]>(() => {
    const saved = readJsonStorage<CallRecord[]>(STORAGE_KEYS.CALLS);
    return saved || createInitialCalls('demo_user_me', 'أحمد العتيبي');
  });

  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [initialStoryAuthorId, setInitialStoryAuthorId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>('chat_sara');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
  const [inspectMessageId, setInspectMessageId] = useState<string | null>(null);
  const [newChatModalMode, setNewChatModalMode] = useState<'direct' | 'group' | 'community' | null>(null);
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [googleContacts, setGoogleContacts] = useState<UserProfile[]>([]);

  // WhatsApp Omar Lock & Broadcast Modal states
  const [unlockedSessionChatIds, setUnlockedSessionChatIds] = useState<string[]>([]);
  const [pendingLockedChatId, setPendingLockedChatId] = useState<string | null>(null);
  const [pinModalInput, setPinModalInput] = useState('');
  const [pinModalError, setPinModalError] = useState<string | null>(null);

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastChatIds, setBroadcastChatIds] = useState<string[]>([]);
  const [broadcastText, setBroadcastText] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [highlightedJump, setHighlightedJump] = useState<{
    chatId: string;
    messageId: string;
    query: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const handleUpdateOmarSettings = (patch: Partial<OmarSettings>) => {
    setOmarSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleImportGoogleContacts = async () => {
    try {
      let accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          accessToken = credential.accessToken;
          localStorage.setItem('google_access_token', accessToken);
        } else {
          throw new Error('لم يتم الحصول على رمز الوصول من Google.');
        }
      }
      const res = await fetch(
        'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      if (!res.ok) {
        throw new Error('فشل جلب جهات الاتصال من Google People API.');
      }
      const data = await res.json();
      const connections = data.connections || [];
      const imported: UserProfile[] = connections.map((c: any, index: number) => {
        const name = c.names?.[0]?.displayName || c.emailAddresses?.[0]?.value || 'جهة اتصال Google';
        const email = c.emailAddresses?.[0]?.value || '';
        const phone = c.phoneNumbers?.[0]?.value || '';
        const photo = c.photos?.[0]?.url || '';
        const uid = `gcontact_${index}_${Math.random().toString(36).slice(2, 7)}`;
        return {
          uid,
          displayName: name,
          about: phone ? `هاتف: ${phone}` : email ? `بريد: ${email}` : 'جهة اتصال مستوردة',
          avatarUrl: photo,
          publicKeyJwk: '',
          safetyCode: '00000 00000 00000 00000',
          isOnline: true,
          lastSeenMs: Date.now()
        };
      });
      setGoogleContacts(imported);
      showToast(`تم استيراد ${imported.length} جهة اتصال بنجاح من Google Contacts`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر استيراد جهات الاتصال.');
    }
  };

  // Sync HTML .dark class and data-omar-theme attribute
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.omarTheme = omarSettings.omarTheme;
    localStorage.setItem(STORAGE_KEYS.OMAR, JSON.stringify(omarSettings));
  }, [omarSettings]);

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
    localStorage.setItem(STORAGE_KEYS.PINNED_STATUSES, JSON.stringify(pinnedStatusIds));
  }, [pinnedStatusIds]);

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
    let unsubIncomingCalls: (() => void) | null = null;

    const cleanupDataSubscriptions = () => {
      unsubChats?.();
      unsubChats = null;
      unsubStatuses?.();
      unsubStatuses = null;
      unsubCalls?.();
      unsubCalls = null;
      unsubIncomingCalls?.();
      unsubIncomingCalls = null;
    };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      cleanupDataSubscriptions();

      if (!fbUser) {
        setIsCloudSynced(false);
        setNeedsEmailVerification(false);
        return;
      }

      const isPasswordProvider = fbUser.providerData.some((p) => p.providerId === 'password');
      setNeedsEmailVerification(Boolean(isPasswordProvider && !fbUser.emailVerified));

      const keys = identityKeys || (await generateIdentityKeyPair());
      const profile: UserProfile = {
        uid: fbUser.uid,
        displayName:
          fbUser.displayName || fbUser.email?.split('@')[0] || fbUser.phoneNumber || 'مستخدم تواصل',
        about: 'متاح · رسائلي مشفرة تماماً',
        avatarUrl: fbUser.photoURL || '',
        email: fbUser.email || undefined,
        phone: fbUser.phoneNumber || undefined,
        publicKeyJwk: keys.publicKeyJwk,
        safetyCode: keys.safetyCode,
        isOnline: true,
        lastSeenMs: Date.now()
      };

      setCurrentUser(profile);
      setIsCloudSynced(true);
      if (!holdEntryForProfileStep.current) {
        localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
        setIsEntered(true);
      }
      setSelectedChatId((curr) =>
        curr && ['chat_sara', 'chat_tech_group', 'chat_omar', 'chat_layla', 'chat_community_security'].includes(curr)
          ? null
          : curr
      );

      try {
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
      } catch (syncErr) {
        console.warn('Sync profile fallback to local state:', syncErr);
      }

      unsubChats = subscribeUserChatsFromFirestore(fbUser.uid, (cloudChats) => {
        if (cloudChats.length > 0) {
          setChats(cloudChats);
          setSelectedChatId((curr) =>
            curr && cloudChats.some((c) => c.id === curr) ? curr : cloudChats[0].id
          );
        } else {
          const starterChatId = `welcome_${fbUser.uid.slice(0, 12)}`;
          setSelectedChatId(starterChatId);
          void createChatInFirestore(
            starterChatId,
            'direct',
            'مفكرة تواصل المشفرة',
            'مساحتك السحابية المشفرة عبر Firebase',
            BUNDLED_ASSETS.avatarTechGroup,
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

      unsubIncomingCalls = subscribeIncomingCallsFromFirestore(fbUser.uid, (incoming) => {
        if (incoming) {
          setActiveCall((curr) => (curr ? curr : incoming));
        }
      });
    });

    return () => {
      cleanupDataSubscriptions();
      unsubAuth();
    };
  }, [identityKeys]);

  // Subscribe to messages of the currently selected Firestore chat when cloud synced
  useEffect(() => {
    if (!isCloudSynced || !selectedChatId) return;
    const isDemoChat = [
      'chat_sara',
      'chat_tech_group',
      'chat_omar',
      'chat_layla',
      'chat_community_security'
    ].includes(selectedChatId);
    if (isDemoChat) return;

    const targetChat = chats.find((c) => c.id === selectedChatId);
    if (!targetChat || !targetChat.memberIds?.includes(currentUser.uid)) return;

    const unsub = subscribeChatMessagesFromFirestore(
      selectedChatId,
      targetChat.roomSeed || selectedChatId,
      currentUser.uid,
      (cloudMsgs) => {
        setMessagesMap((prev) => {
          const existingLocal = prev[selectedChatId] || [];
          const cloudIds = new Set(cloudMsgs.map((m) => m.id));
          const pendingOrFailed = existingLocal.filter(
            (m) => (m.status === 'sending' || m.status === 'failed') && !cloudIds.has(m.id)
          );
          const merged =
            pendingOrFailed.length > 0
              ? [...cloudMsgs, ...pendingOrFailed].sort((a, b) => a.createdAtMs - b.createdAtMs)
              : cloudMsgs;
          return { ...prev, [selectedChatId]: merged };
        });
      }
    );
    return () => unsub();
  }, [isCloudSynced, selectedChatId, currentUser.uid, chats]);

  // Real-time online/lastSeen presence synchronization
  useEffect(() => {
    if (!isCloudSynced || !currentUser.uid || currentUser.uid.startsWith('demo_')) return;

    const pushPresence = (online: boolean) => {
      if (omarSettings.freezeLastSeen) return;
      void setUserPresenceInFirestore(currentUser.uid, online);
    };

    pushPresence(document.visibilityState === 'visible');

    const handleVisibility = () => {
      pushPresence(document.visibilityState === 'visible');
    };
    const handlePageHide = () => {
      pushPresence(false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isCloudSynced, currentUser.uid, omarSettings.freezeLastSeen]);

  // Acknowledge delivery on incoming cloud chat summaries even before opening each chat
  useEffect(() => {
    if (!isCloudSynced || !currentUser.uid) return;
    for (const c of chats) {
      if (!c.lastMessageSenderId || c.lastMessageSenderId === currentUser.uid) continue;
      if (c.lastMessageDeliveredToIds?.includes(currentUser.uid)) continue;
      const summaryKey = `${c.id}:${c.lastMessageAtMs}`;
      if (deliveredSummaryAckedRef.current.has(summaryKey)) continue;
      deliveredSummaryAckedRef.current.add(summaryKey);
      void markChatMessagesDeliveredInFirestore(c.id, currentUser.uid, [], true);
    }
  }, [isCloudSynced, chats, currentUser.uid]);

  // Cleanup pending demo receipt timers on unmount
  useEffect(() => {
    return () => {
      demoReceiptTimersRef.current.forEach((t) => window.clearTimeout(t));
      demoReceiptTimersRef.current = [];
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleGoogleSignIn = async (): Promise<boolean> => {
    setIsSigningIn(true);
    setAuthError(null);
    holdEntryForProfileStep.current = false;
    try {
      await signInWithPopup(auth, googleProvider);
      localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
      setIsEntered(true);
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthErrorToArabic(err));
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailSignIn = async (email: string, password: string): Promise<boolean> => {
    setIsSigningIn(true);
    setAuthError(null);
    holdEntryForProfileStep.current = false;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
      setIsEntered(true);
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthErrorToArabic(err));
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailSignUp = async (
    displayName: string,
    email: string,
    password: string,
    deferEntryForProfileSetup = true
  ): Promise<boolean> => {
    setIsSigningIn(true);
    setAuthError(null);
    holdEntryForProfileStep.current = deferEntryForProfileSetup;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      setCurrentUser((prev) => ({
        ...prev,
        uid: cred.user.uid,
        displayName,
        email
      }));
      void sendEmailVerification(cred.user).catch(() => {});
      if (!deferEntryForProfileSetup) {
        localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
        setIsEntered(true);
      }
      return true;
    } catch (err) {
      holdEntryForProfileStep.current = false;
      setAuthError(mapFirebaseAuthErrorToArabic(err));
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleResetPassword = async (email: string): Promise<boolean> => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (err) {
      setAuthError(mapFirebaseAuthErrorToArabic(err));
      return false;
    }
  };

  const handlePhoneAuthSuccess = (phoneE164: string, uid?: string) => {
    holdEntryForProfileStep.current = true;
    setCurrentUser((prev) => ({
      ...prev,
      ...(uid ? { uid } : {}),
      phone: phoneE164
    }));
  };

  const handleCompleteOnboarding = async (payload: OnboardingCompletionPayload) => {
    holdEntryForProfileStep.current = false;
    const updatedUser: UserProfile = {
      ...currentUser,
      displayName: payload.displayName,
      about: payload.about,
      avatarUrl: payload.avatarUrl,
      ...(payload.phone ? { phone: payload.phone } : {})
    };
    setCurrentUser(updatedUser);
    handleUpdateOmarSettings({
      chatLockPin: payload.chatLockPin,
      appLockOnLaunch: payload.appLockOnLaunch
    });

    if (auth.currentUser) {
      void updateProfile(auth.currentUser, {
        displayName: payload.displayName
      }).catch(() => {});
    }

    if (isCloudSynced) {
      try {
        await updateProfileInFirestore(updatedUser.uid, updatedUser, {
          displayName: payload.displayName,
          about: payload.about,
          avatarUrl: payload.avatarUrl
        });
      } catch {
        // Fallback to local profile state when unverified
      }
    }

    localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
    setIsEntered(true);
    showToast(`أهلاً بك ${payload.displayName} في تواصل!`);
  };

  const handleRestoreBackupJson = async (rawJson: string) => {
    const parsed = parseWasilBackupJson(rawJson);
    if (parsed.omarSettings) {
      setOmarSettings((prev) => ({ ...prev, ...parsed.omarSettings }));
    }
    if (parsed.privacySettings) {
      setPrivacySettings((prev) => ({ ...prev, ...parsed.privacySettings }));
    }
    if (parsed.profile) {
      setCurrentUser((prev) => ({ ...prev, ...parsed.profile }));
    }
    if (parsed.chats && parsed.chats.length > 0) {
      setChats(parsed.chats);
      setSelectedChatId(parsed.chats[0].id);
    }
    if (parsed.messages) {
      setMessagesMap(parsed.messages);
    }
    if (parsed.statuses) {
      setStatuses(filterActiveStatuses(parsed.statuses));
    }
    if (parsed.calls) {
      setCalls(parsed.calls);
    }
    localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
    setIsEntered(true);
    showToast('تمت استعادة النسخة الاحتياطية بنجاح');
  };

  const handleResendVerificationEmail = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      showToast('تم إرسال رابط تأكيد البريد الإلكتروني بنجاح');
    } catch (err) {
      showToast(mapFirebaseAuthErrorToArabic(err));
    }
  };

  const handleRequestSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    holdEntryForProfileStep.current = false;
    try {
      if (isCloudSynced && currentUser.uid) {
        if (lastTypingSentRef.current?.active) {
          await updateChatTypingInFirestore(
            lastTypingSentRef.current.chatId,
            currentUser.uid,
            false
          ).catch(() => {});
          lastTypingSentRef.current = null;
        }
        await setUserPresenceInFirestore(currentUser.uid, false).catch(() => {});
        await signOut(auth).catch(() => {});
      }
    } finally {
      deliveredSummaryAckedRef.current.clear();
      deliveredMsgAckedRef.current.clear();
      readMsgAckedRef.current.clear();
      localStorage.removeItem(STORAGE_KEYS.ENTERED);
      setActiveCall(null);
      setShowSignOutConfirm(false);
      setAppLockedOnLaunch(false);
      setUnlockedSessionChatIds([]);
      setMobileChatOpen(false);
      setRightPanelMode('none');
      setActiveTab('chats');
      setHighlightedJump(null);
      setIsCloudSynced(false);
      setIsEntered(false);
      setIsSigningOut(false);
      showToast('تم تسجيل الخروج بنجاح');
    }
  };

  const handleToggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (isCloudSynced) {
      void updateThemePrefInFirestore(currentUser.uid, next);
    }
  };

  const contactsList = useMemo(
    () => [...extractContactsFromChats(chats, DEMO_CONTACTS, currentUser.uid), ...googleContacts],
    [chats, currentUser.uid, googleContacts]
  );

  const visibleChats = useMemo(
    () =>
      filterAndSortChats(
        chats,
        chatFilter,
        searchQuery,
        showArchived,
        omarSettings.lockedChatIds
      ),
    [chats, chatFilter, searchQuery, showArchived, omarSettings.lockedChatIds]
  );

  const totalUnread = useMemo(
    () => chats.reduce((sum, c) => sum + (c.archived ? 0 : c.unreadCount), 0),
    [chats]
  );

  const archivedCount = useMemo(
    () => chats.filter((c) => c.archived).length,
    [chats]
  );

  const sortedStatuses = useMemo(
    () => sortStatusesWithPinned(statuses, pinnedStatusIds),
    [statuses, pinnedStatusIds]
  );

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  const activeMessages = useMemo(
    () => (selectedChatId ? messagesMap[selectedChatId] || [] : []),
    [messagesMap, selectedChatId]
  );

  // Acknowledge delivery & read receipts for the active cloud chat
  useEffect(() => {
    if (!isCloudSynced || !selectedChatId || !selectedChat) return;
    if (!selectedChat.memberIds?.includes(currentUser.uid)) return;

    const flushReceipts = () => {
      const undeliveredIds = activeMessages
        .filter(
          (m) =>
            m.senderId !== currentUser.uid &&
            !m.deliveredToIds?.includes(currentUser.uid) &&
            !deliveredMsgAckedRef.current.has(m.id)
        )
        .map((m) => m.id);

      const needLastDelivered =
        Boolean(selectedChat.lastMessageSenderId) &&
        selectedChat.lastMessageSenderId !== currentUser.uid &&
        !selectedChat.lastMessageDeliveredToIds?.includes(currentUser.uid);

      if (undeliveredIds.length > 0 || needLastDelivered) {
        undeliveredIds.forEach((id) => deliveredMsgAckedRef.current.add(id));
        void markChatMessagesDeliveredInFirestore(
          selectedChatId,
          currentUser.uid,
          undeliveredIds,
          needLastDelivered
        );
      }

      const canSendReadReceipt =
        document.visibilityState === 'visible' &&
        privacySettings.readReceipts &&
        !omarSettings.hideReadTicks;

      if (canSendReadReceipt) {
        const unreadIds = activeMessages
          .filter(
            (m) =>
              m.senderId !== currentUser.uid &&
              !m.readByIds?.includes(currentUser.uid) &&
              !readMsgAckedRef.current.has(m.id)
          )
          .map((m) => m.id);

        const needLastRead =
          Boolean(selectedChat.lastMessageSenderId) &&
          selectedChat.lastMessageSenderId !== currentUser.uid &&
          !selectedChat.lastMessageReadByIds?.includes(currentUser.uid);

        if (unreadIds.length > 0 || needLastRead) {
          unreadIds.forEach((id) => readMsgAckedRef.current.add(id));
          void markChatMessagesReadInFirestore(
            selectedChatId,
            currentUser.uid,
            unreadIds,
            needLastRead
          );
        }
      }
    };

    flushReceipts();
    document.addEventListener('visibilitychange', flushReceipts);
    window.addEventListener('focus', flushReceipts);
    return () => {
      document.removeEventListener('visibilitychange', flushReceipts);
      window.removeEventListener('focus', flushReceipts);
    };
  }, [
    isCloudSynced,
    selectedChatId,
    selectedChat,
    activeMessages,
    currentUser.uid,
    privacySettings.readReceipts,
    omarSettings.hideReadTicks
  ]);

  const [activeSafetyCode, setActiveSafetyCode] = useState(currentUser.safetyCode);
  useEffect(() => {
    async function computePairCode() {
      try {
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
      } catch {
        setActiveSafetyCode(currentUser.safetyCode);
      }
    }
    void computePairCode();
  }, [selectedChat?.id, selectedChat?.peerUid, currentUser.publicKeyJwk, currentUser.safetyCode]);

  const persistChatPrefsIfCloud = (nextChat: ChatRoom) => {
    if (!isCloudSynced) return;
    void saveChatPrefToFirestore(currentUser.uid, nextChat.id, {
      pinned: nextChat.pinned,
      archived: nextChat.archived,
      muted: nextChat.muted,
      favorite: nextChat.favorite,
      unreadCount: nextChat.unreadCount,
      disappearingSeconds: nextChat.disappearingSeconds
    }).catch(() => {});
  };

  const handleSelectChat = (chatId: string) => {
    if (
      isCloudSynced &&
      lastTypingSentRef.current?.active &&
      lastTypingSentRef.current.chatId !== chatId
    ) {
      const prevTypingChat = lastTypingSentRef.current.chatId;
      lastTypingSentRef.current = null;
      void updateChatTypingInFirestore(prevTypingChat, currentUser.uid, false);
    }

    const isLocked = omarSettings.lockedChatIds.includes(chatId);
    const alreadyUnlocked = unlockedSessionChatIds.includes(chatId);
    if (isLocked && !alreadyUnlocked) {
      setPendingLockedChatId(chatId);
      setPinModalInput('');
      setPinModalError(null);
      setUsePinFallbackForChat(false);
      setBiometricChatError(null);
      return;
    }
    setSelectedChatId(chatId);
    setMobileChatOpen(true);
    setRightPanelMode('none');
    setHighlightedJump((prev) => (prev && prev.chatId === chatId ? prev : null));
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const cleared = { ...c, unreadCount: 0 };
        persistChatPrefsIfCloud(cleared);
        return cleared;
      })
    );
  };

  const handleJumpToMessage = (
    chatId: string,
    messageId: string,
    highlightQuery?: string
  ) => {
    const isLocked = omarSettings.lockedChatIds.includes(chatId);
    const alreadyUnlocked = unlockedSessionChatIds.includes(chatId);
    if (isLocked && !alreadyUnlocked) {
      setPendingLockedChatId(chatId);
      setPinModalInput('');
      setPinModalError(null);
      setUsePinFallbackForChat(false);
      setBiometricChatError(null);
      return;
    }
    setSelectedChatId(chatId);
    setActiveTab('chats');
    setMobileChatOpen(true);
    setRightPanelMode('none');
    setHighlightedJump({
      chatId,
      messageId,
      query: highlightQuery || ''
    });
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const cleared = { ...c, unreadCount: 0 };
        persistChatPrefsIfCloud(cleared);
        return cleared;
      })
    );
  };

  const handleTypingChange = (isTyping: boolean) => {
    if (!isCloudSynced || !selectedChatId || omarSettings.hideTypingIndicator) return;
    const prev = lastTypingSentRef.current;
    if (prev && prev.chatId === selectedChatId && prev.active === isTyping && !isTyping) {
      return;
    }
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    lastTypingSentRef.current = { chatId: selectedChatId, active: isTyping };
    void updateChatTypingInFirestore(selectedChatId, currentUser.uid, isTyping);

    if (isTyping) {
      const targetChatId = selectedChatId;
      typingTimeoutRef.current = window.setTimeout(() => {
        typingTimeoutRef.current = null;
        if (lastTypingSentRef.current?.chatId === targetChatId && lastTypingSentRef.current.active) {
          lastTypingSentRef.current = { chatId: targetChatId, active: false };
          void updateChatTypingInFirestore(targetChatId, currentUser.uid, false);
        }
      }, 4000);
    }
  };

  const handleLockAppNow = () => {
    setLaunchPinInput('');
    setLaunchPinError(null);
    setUsePinFallbackOnLaunch(false);
    setBiometricLaunchError(null);
    setUnlockedSessionChatIds([]);
    setAppLockedOnLaunch(true);
  };

  const handleUnlockLaunchWithBiometric = async () => {
    if (biometricLaunchBusy || !omarSettings.biometricCredentialId) return;
    setBiometricLaunchBusy(true);
    setBiometricLaunchError(null);
    try {
      const ok = await verifyBiometricCredential(omarSettings.biometricCredentialId);
      if (ok) {
        setAppLockedOnLaunch(false);
        setLaunchPinInput('');
        setLaunchPinError(null);
        setBiometricLaunchError(null);
      } else {
        setBiometricLaunchError('فشل التحقق الحيوي. حاول مجدداً أو استخدم رمز PIN.');
      }
    } catch (err) {
      setBiometricLaunchError(
        err instanceof Error ? err.message : 'تعذر التحقق الحيوي. يمكنك استخدام رمز PIN.'
      );
    } finally {
      setBiometricLaunchBusy(false);
    }
  };

  const handleUnlockChatWithBiometric = async () => {
    if (biometricChatBusy || !pendingLockedChatId || !omarSettings.biometricCredentialId) return;
    setBiometricChatBusy(true);
    setBiometricChatError(null);
    try {
      const ok = await verifyBiometricCredential(omarSettings.biometricCredentialId);
      if (ok) {
        const targetId = pendingLockedChatId;
        setUnlockedSessionChatIds((prev) => Array.from(new Set([...prev, targetId])));
        setPendingLockedChatId(null);
        setPinModalInput('');
        setPinModalError(null);
        setBiometricChatError(null);
        setSelectedChatId(targetId);
        setMobileChatOpen(true);
        setRightPanelMode('none');
        setChats((prev) => prev.map((c) => (c.id === targetId ? { ...c, unreadCount: 0 } : c)));
      } else {
        setBiometricChatError('لم يتم التحقق من البصمة. حاول مرة أخرى أو استخدم رمز PIN.');
      }
    } catch (err) {
      setBiometricChatError(
        err instanceof Error ? err.message : 'تعذر التحقق بالبصمة. يمكنك استخدام رمز PIN.'
      );
    } finally {
      setBiometricChatBusy(false);
    }
  };

  const handleVerifyChatPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingLockedChatId) return;
    if (pinModalInput.trim() !== omarSettings.chatLockPin) {
      setPinModalError('الرمز السري غير صحيح. حاول مرة أخرى.');
      return;
    }
    const targetId = pendingLockedChatId;
    setUnlockedSessionChatIds((prev) => Array.from(new Set([...prev, targetId])));
    setPendingLockedChatId(null);
    setPinModalInput('');
    setPinModalError(null);
    setBiometricChatError(null);
    setSelectedChatId(targetId);
    setMobileChatOpen(true);
    setRightPanelMode('none');
    setChats((prev) => prev.map((c) => (c.id === targetId ? { ...c, unreadCount: 0 } : c)));
  };

  const handleToggleLockChat = (chatId: string) => {
    const exists = omarSettings.lockedChatIds.includes(chatId);
    const nextLocked = exists
      ? omarSettings.lockedChatIds.filter((id) => id !== chatId)
      : [...omarSettings.lockedChatIds, chatId];
    handleUpdateOmarSettings({ lockedChatIds: nextLocked });
    if (exists) {
      setUnlockedSessionChatIds((prev) => prev.filter((id) => id !== chatId));
      showToast('تم إلغاء قفل المحادثة');
    } else {
      showToast('تم قفل المحادثة بالرمز السري');
    }
  };

  const sendMessageToTargetChat = async (
    targetChat: ChatRoom,
    type: MessageType,
    payload: MessagePayload,
    replyToId?: string,
    existingFailedMsgId?: string
  ) => {
    const msgId =
      existingFailedMsgId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const key = await deriveRoomKeyFromSeed(targetChat.roomSeed);
    const envelope = await encryptPayload(JSON.stringify(payload), key);
    const nowMs = Date.now();

    const optimisticMsg: DecryptedMessage = {
      id: msgId,
      chatId: targetChat.id,
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      type,
      payload,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      algorithm: envelope.algorithm,
      replyToId,
      deliveredToIds: [currentUser.uid],
      readByIds: [currentUser.uid],
      reactions: {},
      reactionsCount: 0,
      starredBy: [],
      isDeleted: false,
      status: isCloudSynced ? 'sending' : 'sent',
      createdAtMs: nowMs
    };

    // Instant optimistic insertion / retry update
    setMessagesMap((prev) => {
      const currList = prev[targetChat.id] || [];
      const exists = currList.some((m) => m.id === msgId);
      return {
        ...prev,
        [targetChat.id]: exists
          ? currList.map((m) => (m.id === msgId ? optimisticMsg : m))
          : [...currList, optimisticMsg]
      };
    });

    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChat.id
          ? {
              ...c,
              lastMessagePreview: payload.text,
              lastMessageType: type,
              lastMessageSenderId: currentUser.uid,
              lastMessageStatus: 'sent',
              lastMessageDeliveredToIds: [currentUser.uid],
              lastMessageReadByIds: [currentUser.uid],
              lastMessageAtMs: nowMs
            }
          : c
      )
    );

    if (isCloudSynced) {
      if (lastTypingSentRef.current?.chatId === targetChat.id && lastTypingSentRef.current.active) {
        lastTypingSentRef.current = { chatId: targetChat.id, active: false };
        void updateChatTypingInFirestore(targetChat.id, currentUser.uid, false);
      }

      try {
        await sendEncryptedMessageToFirestore(
          targetChat.id,
          targetChat.roomSeed,
          currentUser,
          type,
          payload,
          targetChat.memberIds,
          replyToId,
          msgId
        );

        setMessagesMap((prev) => ({
          ...prev,
          [targetChat.id]: (prev[targetChat.id] || []).map((m) =>
            m.id === msgId && m.status === 'sending' ? { ...m, status: 'sent' } : m
          )
        }));
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChat.id && c.lastMessageSenderId === currentUser.uid
              ? { ...c, lastMessageStatus: 'sent' }
              : c
          )
        );

        // If "blue ticks after reply" is enabled, replying flushes withheld read acks for peer messages
        if (omarSettings.hideReadTicks && privacySettings.readReceipts) {
          const pendingUnreadIds = (messagesMap[targetChat.id] || [])
            .filter(
              (m) =>
                m.senderId !== currentUser.uid &&
                !m.readByIds?.includes(currentUser.uid) &&
                !readMsgAckedRef.current.has(m.id)
            )
            .map((m) => m.id);
          if (pendingUnreadIds.length > 0) {
            pendingUnreadIds.forEach((id) => readMsgAckedRef.current.add(id));
            void markChatMessagesReadInFirestore(
              targetChat.id,
              currentUser.uid,
              pendingUnreadIds,
              false
            );
          }
        }
      } catch {
        setMessagesMap((prev) => ({
          ...prev,
          [targetChat.id]: (prev[targetChat.id] || []).map((m) =>
            m.id === msgId ? { ...m, status: 'failed' } : m
          )
        }));
        showToast('تعذر تسليم الرسالة الآن. اضغط إعادة للمحاولة.');
      }
      return;
    }

    // Demo mode realistic receipt lifecycle:
    // Offline direct peer or DND stays at 1 gray checkmark ('sent');
    // Online peer transitions 'sent' -> 'delivered' (2 gray) -> 'read' (2 blue if readReceipts enabled).
    const peerCanReceive =
      !omarSettings.dndMode && (targetChat.type !== 'direct' || targetChat.isOnline !== false);

    if (peerCanReceive) {
      const deliveredTimer = window.setTimeout(() => {
        setMessagesMap((prev) => {
          const list = prev[targetChat.id];
          if (!list || !list.some((m) => m.id === msgId)) return prev;
          return {
            ...prev,
            [targetChat.id]: list.map((m) =>
              m.id === msgId && m.status === 'sent' ? { ...m, status: 'delivered' } : m
            )
          };
        });
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChat.id &&
            c.lastMessageSenderId === currentUser.uid &&
            c.lastMessageStatus === 'sent'
              ? { ...c, lastMessageStatus: 'delivered' }
              : c
          )
        );
      }, 550);
      demoReceiptTimersRef.current.push(deliveredTimer);

      if (privacySettings.readReceipts) {
        const readTimer = window.setTimeout(() => {
          setMessagesMap((prev) => {
            const list = prev[targetChat.id];
            if (!list || !list.some((m) => m.id === msgId)) return prev;
            return {
              ...prev,
              [targetChat.id]: list.map((m) =>
                m.id === msgId && (m.status === 'sent' || m.status === 'delivered')
                  ? { ...m, status: 'read' }
                  : m
              )
            };
          });
          setChats((prev) =>
            prev.map((c) =>
              c.id === targetChat.id &&
              c.lastMessageSenderId === currentUser.uid &&
              (c.lastMessageStatus === 'sent' || c.lastMessageStatus === 'delivered')
                ? { ...c, lastMessageStatus: 'read' }
                : c
            )
          );
        }, 1550);
        demoReceiptTimersRef.current.push(readTimer);
      }
    }
  };

  const handleSendMessage = async (
    type: MessageType,
    payload: MessagePayload,
    replyToId?: string
  ) => {
    if (!selectedChat) return;
    await sendMessageToTargetChat(selectedChat, type, payload, replyToId);
  };

  const handleRetryMessage = async (msg: DecryptedMessage) => {
    const targetChat = chats.find((c) => c.id === msg.chatId);
    if (!targetChat) return;
    await sendMessageToTargetChat(targetChat, msg.type, msg.payload, msg.replyToId, msg.id);
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!selectedChat) return;
    const chatId = selectedChat.id;
    const chatMessages = messagesMap[chatId] || [];
    const targetMsg = chatMessages.find((m) => m.id === messageId);
    if (!targetMsg || targetMsg.senderId !== currentUser.uid || targetMsg.isDeleted) return;

    const trimmed = newText.trim();
    if (!trimmed || trimmed === targetMsg.payload.text) return;

    const updatedPayload: MessagePayload = {
      ...targetMsg.payload,
      text: trimmed,
      edited: true
    };

    const key = await deriveRoomKeyFromSeed(selectedChat.roomSeed);
    const localEnvelope = await encryptPayload(JSON.stringify(updatedPayload), key);

    const latestMsg = chatMessages[chatMessages.length - 1];
    const isLastMessage = Boolean(latestMsg && latestMsg.id === messageId);
    const prevChatPreview = selectedChat.lastMessagePreview;

    setMessagesMap((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).map((m) =>
        m.id === messageId
          ? {
              ...m,
              payload: updatedPayload,
              ciphertext: localEnvelope.ciphertext,
              iv: localEnvelope.iv
            }
          : m
      )
    }));

    if (isLastMessage) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId && c.lastMessageSenderId === currentUser.uid
            ? { ...c, lastMessagePreview: trimmed }
            : c
        )
      );
    }

    if (isCloudSynced) {
      try {
        await editEncryptedMessageInFirestore(
          chatId,
          messageId,
          selectedChat.roomSeed,
          updatedPayload,
          isLastMessage
        );
        showToast('تم تعديل الرسالة');
      } catch {
        setMessagesMap((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((m) =>
            m.id === messageId ? targetMsg : m
          )
        }));
        if (isLastMessage) {
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId && c.lastMessageSenderId === currentUser.uid
                ? { ...c, lastMessagePreview: prevChatPreview }
                : c
            )
          );
        }
        showToast('تعذر حفظ تعديل الرسالة سحابياً');
      }
      return;
    }

    showToast('تم تعديل الرسالة');
  };

  const handleForwardMessage = async (msg: DecryptedMessage, targetChatId: string) => {
    const targetChat = chats.find((c) => c.id === targetChatId);
    if (!targetChat) return;
    await sendMessageToTargetChat(targetChat, msg.type, {
      ...msg.payload,
      forwarded: true
    });
    showToast(`تم تحويل الرسالة إلى ${targetChat.title}`);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = broadcastText.trim();
    if (!cleaned || broadcastChatIds.length === 0) return;
    setIsSendingBroadcast(true);
    try {
      const targets = chats.filter((c) => broadcastChatIds.includes(c.id));
      for (const target of targets) {
        await sendMessageToTargetChat(target, 'text', { text: cleaned });
      }
      showToast(`تم إرسال رسالة البث إلى ${targets.length} محادثات بنجاح`);
      setBroadcastText('');
      setBroadcastChatIds([]);
      setShowBroadcastModal(false);
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const handleVotePoll = (messageId: string, optionId: string) => {
    if (!selectedChatId) return;
    const targetMsg = (messagesMap[selectedChatId] || []).find((m) => m.id === messageId);
    if (!targetMsg || !targetMsg.payload.pollOptions) return;

    const nextOptions = applyPollVote(targetMsg.payload.pollOptions, optionId, currentUser.uid);
    const nextPollVotes: Record<string, string> = {};
    for (const opt of nextOptions) {
      for (const voterId of opt.voterIds) {
        nextPollVotes[voterId] = opt.id;
      }
    }

    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) =>
        m.id === messageId
          ? {
              ...m,
              pollVotes: nextPollVotes,
              payload: {
                ...m.payload,
                pollOptions: nextOptions
              }
            }
          : m
      )
    }));

    if (isCloudSynced) {
      void votePollInFirestore(selectedChatId, messageId, nextPollVotes).catch(() => {});
    }
  };

  const handleReactMessage = (messageId: string, emoji: string) => {
    if (!selectedChatId) return;
    const targetMsg = (messagesMap[selectedChatId] || []).find((m) => m.id === messageId);
    if (!targetMsg) return;

    const existingUsers = targetMsg.reactions[emoji] || [];
    const hasReacted = existingUsers.includes(currentUser.uid);
    const updatedUsers = hasReacted
      ? existingUsers.filter((id) => id !== currentUser.uid)
      : [...existingUsers, currentUser.uid];
    const nextReactions: Record<string, string[]> = { ...targetMsg.reactions };
    if (updatedUsers.length > 0) {
      nextReactions[emoji] = updatedUsers;
    } else {
      delete nextReactions[emoji];
    }
    const computedCount = Object.values(nextReactions).reduce((a, b) => a + b.length, 0);

    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) =>
        m.id === messageId ? { ...m, reactions: nextReactions, reactionsCount: computedCount } : m
      )
    }));

    if (isCloudSynced) {
      void updateMessageReactionsInFirestore(
        selectedChatId,
        messageId,
        nextReactions,
        computedCount
      ).catch(() => {});
    }
  };

  const handleToggleStarMessage = (messageId: string) => {
    if (!selectedChatId) return;
    const targetMsg = (messagesMap[selectedChatId] || []).find((m) => m.id === messageId);
    if (!targetMsg) return;
    const isCurrentlyStarred = targetMsg.starredBy.includes(currentUser.uid);

    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          starredBy: isCurrentlyStarred
            ? m.starredBy.filter((id) => id !== currentUser.uid)
            : [...m.starredBy, currentUser.uid]
        };
      })
    }));

    if (isCloudSynced) {
      void toggleStarMessageInFirestore(
        selectedChatId,
        messageId,
        currentUser.uid,
        isCurrentlyStarred
      ).catch(() => {});
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!selectedChatId) return;
    setMessagesMap((prev) => ({
      ...prev,
      [selectedChatId]: (prev[selectedChatId] || []).map((m) =>
        m.id === messageId ? { ...m, isDeleted: true } : m
      )
    }));
    if (isCloudSynced) {
      void softDeleteMessageInFirestore(selectedChatId, messageId).catch(() => {});
    }
  };

  const handleToggleChatProp = (
    chatId: string,
    prop: 'pinned' | 'archived' | 'muted' | 'favorite'
  ) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const nextChat = { ...c, [prop]: !c[prop] };
        persistChatPrefsIfCloud(nextChat);
        return nextChat;
      })
    );
  };

  const handleSetDisappearing = (chatId: string, seconds: number) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const nextChat = { ...c, disappearingSeconds: seconds };
        persistChatPrefsIfCloud(nextChat);
        return nextChat;
      })
    );
  };

  const handleClearChat = (chatId: string) => {
    setMessagesMap((prev) => ({ ...prev, [chatId]: [] }));
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, lastMessagePreview: 'تم مسح الدردشة' } : c))
    );
  };

  const handleStartCallForChat = async (chat: ChatRoom, callType: 'audio' | 'video') => {
    const safeCallerAvatar =
      currentUser.avatarUrl.startsWith('data:') && currentUser.avatarUrl.length > 500
        ? ''
        : currentUser.avatarUrl.slice(0, 500);
    const safeCalleeAvatar =
      chat.avatarUrl.startsWith('data:') && chat.avatarUrl.length > 500
        ? ''
        : chat.avatarUrl.slice(0, 500);

    const call: CallRecord = {
      id: `call_${Date.now()}`,
      callerId: currentUser.uid,
      callerName: currentUser.displayName,
      callerAvatar: safeCallerAvatar,
      calleeId: chat.peerUid || chat.id,
      calleeName: chat.title,
      calleeAvatar: safeCalleeAvatar,
      callType,
      status: 'ringing',
      direction: 'outgoing',
      durationSeconds: 0,
      encryptionFingerprint: activeSafetyCode.slice(0, 17).replace(/\s+/g, '-'),
      createdAtMs: Date.now()
    };
    setActiveCall(call);
  };

  const handleEndCall = async (
    durationSeconds: number,
    finalStatus?: 'ended' | 'declined' | 'missed',
    skipRemoteFinalize?: boolean
  ) => {
    if (!activeCall) return;
    const resolvedStatus = finalStatus || (durationSeconds > 0 ? 'ended' : 'missed');
    const finished: CallRecord = {
      ...activeCall,
      status: resolvedStatus,
      durationSeconds
    };
    setActiveCall(null);
    setCalls((prev) => [finished, ...prev.filter((c) => c.id !== finished.id)]);
    if (isCloudSynced && !skipRemoteFinalize) {
      await finalizeCallRecordInFirestore(finished.id, resolvedStatus, durationSeconds).catch(() => {});
    }
  };

  const handleCreateDirectChat = async (name: string, peerUid?: string) => {
    const existingByPeer = peerUid
      ? chats.find((c) => c.type === 'direct' && (c.peerUid === peerUid || c.memberIds.includes(peerUid)))
      : undefined;
    if (existingByPeer) {
      setSelectedChatId(existingByPeer.id);
      setMobileChatOpen(true);
      setActiveTab('chats');
      return;
    }

    const demoContact = DEMO_CONTACTS.find((c) => c.uid === peerUid);
    const deterministicId =
      isCloudSynced && isRemoteFirebaseUid(peerUid) && peerUid
        ? buildDirectChatId(currentUser.uid, peerUid)
        : `chat_${Date.now()}`;

    if (isCloudSynced) {
      let peerProfile: UserProfile | null = null;
      if (peerUid && isRemoteFirebaseUid(peerUid)) {
        try {
          peerProfile = await fetchPublicProfileByUid(peerUid);
        } catch {
          peerProfile = null;
        }
      }
      const invited = peerProfile ? [peerProfile] : [];
      const resolvedTitle = peerProfile?.displayName || name;
      await createChatInFirestore(
        deterministicId,
        'direct',
        resolvedTitle,
        peerProfile?.about || demoContact?.about || 'محادثة مشفرة بين الطرفين P2P',
        peerProfile?.avatarUrl || demoContact?.avatarUrl || '',
        currentUser,
        `تم بدء قناة مراسلة مشفرة مع ${resolvedTitle} 🔒`,
        invited
      );
      setSelectedChatId(deterministicId);
      setMobileChatOpen(true);
      setActiveTab('chats');
      return;
    }

    const newRoom: ChatRoom = {
      id: deterministicId,
      type: 'direct',
      title: name,
      description: demoContact?.about || 'متاح',
      avatarUrl: demoContact?.avatarUrl || '',
      peerUid: peerUid || `peer_${Date.now()}`,
      isOnline: demoContact?.isOnline ?? true,
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
      roomSeed: deterministicId
    };

    const key = await deriveRoomKeyFromSeed(deterministicId);
    const welcomeText = `تم إنشاء قناة اتصال مشفرة تماماً مع ${name} 🔒`;
    const env = await encryptPayload(JSON.stringify({ text: welcomeText }), key);

    setChats((prev) => [newRoom, ...prev]);
    setMessagesMap((prev) => ({
      ...prev,
      [deterministicId]: [
        {
          id: `msg_init_${Date.now()}`,
          chatId: deterministicId,
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
    setSelectedChatId(deterministicId);
    setMobileChatOpen(true);
    setActiveTab('chats');
  };

  const handleCreateGroupChat = async (
    title: string,
    description: string,
    memberUids: string[],
    avatarUrl: string = BUNDLED_ASSETS.avatarTechGroup,
    roomType: 'group' | 'community' = 'group',
    adminOnlyPost = false
  ) => {
    const chatId = `${roomType === 'community' ? 'comm' : 'group'}_${Date.now()}`;
    const inviteCode = buildChannelInviteCode(chatId);
    const invitedContacts = contactsList.filter((c) => memberUids.includes(c.uid));
    const welcomeText =
      roomType === 'community'
        ? `تم إنشاء قناة "${title}" ${adminOnlyPost ? '(بث المشرفين فقط)' : ''} بتشفير تام 🔒`
        : `تم إنشاء المجموعة "${title}" بتشفير تام بين الأعضاء 🔒`;

    if (isCloudSynced) {
      await createChatInFirestore(
        chatId,
        roomType,
        title,
        description || (roomType === 'community' ? 'قناة تواصل ومجتمع' : 'مجموعة مشفرة تماماً'),
        avatarUrl,
        currentUser,
        welcomeText,
        invitedContacts,
        { adminOnlyPost, inviteCode }
      );
      setSelectedChatId(chatId);
      setMobileChatOpen(true);
      setActiveTab('chats');
      return;
    }

    const newGroup: ChatRoom = {
      id: chatId,
      type: roomType,
      title,
      description:
        description || (roomType === 'community' ? 'قناة إخبارية ومجتمع مشفر' : 'مجموعة تواصل مشفرة'),
      avatarUrl,
      isOnline: true,
      memberIds: Array.from(new Set([currentUser.uid, ...memberUids])),
      pinned: false,
      archived: false,
      muted: false,
      favorite: false,
      unreadCount: 0,
      disappearingSeconds: 0,
      adminOnlyPost,
      inviteCode,
      lastMessagePreview: welcomeText,
      lastMessageType: 'text',
      lastMessageSenderId: currentUser.uid,
      lastMessageStatus: 'read',
      lastMessageAtMs: Date.now(),
      roomSeed: chatId
    };
    const key = await deriveRoomKeyFromSeed(chatId);
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

  const handleJoinSuggestedChannel = async (channel: SuggestedChannelItem) => {
    const existing = chats.find((c) => c.id === channel.id);
    if (existing) {
      setSelectedChatId(existing.id);
      setMobileChatOpen(true);
      setActiveTab('chats');
      return;
    }

    const inviteCode = buildChannelInviteCode(channel.id);
    const welcomeText = `مرحباً بك في ${channel.title} · ${channel.description}`;

    if (isCloudSynced) {
      await createChatInFirestore(
        channel.id,
        'community',
        channel.title,
        channel.description,
        channel.avatarUrl,
        currentUser,
        welcomeText,
        [],
        { adminOnlyPost: true, inviteCode }
      );
      showToast(`تمت متابعة ${channel.title}`);
      return;
    }

    const room: ChatRoom = {
      id: channel.id,
      type: 'community',
      title: channel.title,
      description: channel.description,
      avatarUrl: channel.avatarUrl,
      isOnline: true,
      memberIds: [currentUser.uid],
      pinned: false,
      archived: false,
      muted: false,
      favorite: false,
      unreadCount: 1,
      disappearingSeconds: 0,
      adminOnlyPost: true,
      inviteCode,
      lastMessagePreview: welcomeText,
      lastMessageType: 'text',
      lastMessageSenderId: channel.id,
      lastMessageStatus: 'read',
      lastMessageAtMs: Date.now(),
      roomSeed: channel.id
    };
    const key = await deriveRoomKeyFromSeed(channel.id);
    const env = await encryptPayload(JSON.stringify({ text: welcomeText }), key);

    setChats((prev) => [room, ...prev]);
    setMessagesMap((prev) => ({
      ...prev,
      [channel.id]: [
        {
          id: `msg_ch_${Date.now()}`,
          chatId: channel.id,
          senderId: channel.id,
          senderName: channel.title,
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
    showToast(`تمت متابعة ${channel.title}`);
  };

  const handleUpdateGroupSettings = async (
    chatId: string,
    title: string,
    description: string,
    avatarUrl: string,
    adminOnlyPost?: boolean
  ) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title,
              description,
              avatarUrl,
              ...(typeof adminOnlyPost === 'boolean' ? { adminOnlyPost } : {})
            }
          : c
      )
    );
    if (isCloudSynced) {
      await updateGroupSettingsInFirestore(chatId, title, description, avatarUrl, adminOnlyPost);
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
      showToast('تم نشر الحالة بنجاح');
      return;
    }
    const nowMs = Date.now();
    const newStatus: StatusItem = {
      id: payload.id || `st_${nowMs}_${Math.random().toString(36).slice(2, 5)}`,
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      authorAvatar: currentUser.avatarUrl,
      type: payload.type,
      content: payload.content,
      backgroundColor: payload.backgroundColor,
      fontStyle: payload.fontStyle,
      ...(payload.mediaUrl ? { mediaUrl: payload.mediaUrl } : {}),
      ...(payload.posterUrl ? { posterUrl: payload.posterUrl } : {}),
      ...(typeof payload.durationSec === 'number' ? { durationSec: payload.durationSec } : {}),
      pinned: false,
      viewerIds: payload.viewerIds,
      viewedByIds: [],
      viewCount: 0,
      viewedByMe: true,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + STATUS_TTL_MS
    };
    setStatuses((prev) => filterActiveStatuses([newStatus, ...prev]));
    showToast('تم نشر الحالة بنجاح');
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
              viewedByIds: omarSettings.hideViewStatus
                ? s.viewedByIds
                : Array.from(new Set([...s.viewedByIds, currentUser.uid])),
              viewCount: omarSettings.hideViewStatus ? s.viewCount : s.viewCount + 1
            }
          : s
      )
    );
    if (isCloudSynced && !omarSettings.hideViewStatus && target.authorId !== currentUser.uid) {
      void markStatusViewedInFirestore(
        statusId,
        currentUser.uid,
        target.viewedByIds,
        target.viewCount
      );
    }
  };

  const handleTogglePinStatus = async (statusId: string) => {
    const target = statuses.find((s) => s.id === statusId);
    const currentlyPinned = pinnedStatusIds.includes(statusId) || Boolean(target?.pinned);
    const nextPinned = !currentlyPinned;

    setPinnedStatusIds((prev) =>
      nextPinned ? [statusId, ...prev.filter((id) => id !== statusId)] : prev.filter((id) => id !== statusId)
    );
    setStatuses((prev) =>
      prev.map((s) => (s.id === statusId ? { ...s, pinned: nextPinned } : s))
    );

    if (isCloudSynced && target?.authorId === currentUser.uid) {
      await togglePinStatusInFirestore(statusId, nextPinned).catch(() => {});
    }
    showToast(nextPinned ? 'تم تثبيت الحالة في المقدمة' : 'تم إلغاء تثبيت الحالة');
  };

  const handleDeleteStatus = async (statusId: string) => {
    const target = statuses.find((s) => s.id === statusId);
    if (target?.mediaUrl) {
      void deleteMediaBlob(target.mediaUrl);
    }
    setStatuses((prev) => prev.filter((s) => s.id !== statusId));
    setPinnedStatusIds((prev) => prev.filter((id) => id !== statusId));
    if (isCloudSynced && target?.authorId === currentUser.uid) {
      await deleteStatusFromFirestore(statusId).catch(() => {});
    }
    showToast('تم حذف الحالة');
  };

  const handleReplyToStatus = async (
    authorId: string,
    authorName: string,
    replyText: string,
    statusPreview: string
  ) => {
    const existing = chats.find(
      (c) => c.type === 'direct' && (c.peerUid === authorId || c.memberIds.includes(authorId))
    );
    if (existing) {
      setSelectedChatId(existing.id);
      setMobileChatOpen(true);
      setActiveTab('chats');
      await sendMessageToTargetChat(existing, 'text', {
        text: replyText,
        replyToSender: authorName,
        replyToText: statusPreview
      });
      showToast(`تم إرسال الرد إلى ${authorName}`);
      return;
    }

    await handleCreateDirectChat(authorName, authorId);
    const fallbackRoom: ChatRoom = {
      id: `chat_${authorId}`,
      type: 'direct',
      title: authorName,
      description: 'محادثة مشفرة',
      avatarUrl: '',
      peerUid: authorId,
      isOnline: true,
      memberIds: [currentUser.uid, authorId],
      pinned: false,
      archived: false,
      muted: false,
      favorite: false,
      unreadCount: 0,
      disappearingSeconds: 0,
      lastMessagePreview: replyText,
      lastMessageType: 'text',
      lastMessageSenderId: currentUser.uid,
      lastMessageStatus: 'read',
      lastMessageAtMs: Date.now(),
      roomSeed: `chat_${authorId}`
    };
    showToast(`تم فتح المحادثة مع ${authorName}`);
    void sendMessageToTargetChat(fallbackRoom, 'text', {
      text: replyText,
      replyToSender: authorName,
      replyToText: statusPreview
    });
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
        theme={theme}
        omarSettings={omarSettings}
        currentUser={currentUser}
        isSigningIn={isSigningIn}
        authError={authError}
        onClearAuthError={() => setAuthError(null)}
        onToggleTheme={handleToggleTheme}
        onUpdateOmarSettings={handleUpdateOmarSettings}
        onGoogleSignIn={handleGoogleSignIn}
        onEmailSignIn={handleEmailSignIn}
        onEmailSignUp={handleEmailSignUp}
        onResetPassword={handleResetPassword}
        onPhoneAuthSuccess={handlePhoneAuthSuccess}
        onCompleteOnboarding={handleCompleteOnboarding}
        onRestoreBackupJson={handleRestoreBackupJson}
      />
    );
  }

  if (appLockedOnLaunch) {
    const hasBiometricConfigured =
      omarSettings.lockMethod === 'biometric' && Boolean(omarSettings.biometricCredentialId);
    const showBiometricLaunch = hasBiometricConfigured && !usePinFallbackOnLaunch;

    return (
      <div className="min-h-[100dvh] w-screen bg-[#EAE6DF] dark:bg-[#0C1317] flex items-center justify-center p-4">
        {showBiometricLaunch ? (
          <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-3xl p-7 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-[var(--wa-accent-soft)] dark:bg-[#111B21] text-[var(--wa-accent)] flex items-center justify-center mx-auto">
              <Fingerprint className="w-8 h-8" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
                تطبيق تواصل محمي بالبصمة
              </h1>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1 leading-relaxed">
                تحقق عبر {omarSettings.biometricDeviceLabel || 'البصمة أو التعرف على الوجه'} للوصول إلى محادثاتك المشفرة
              </p>
            </div>
            {biometricLaunchError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                {biometricLaunchError}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={biometricLaunchBusy}
                aria-label="الفتح بالبصمة أو التعرف على الوجه"
                onClick={() => void handleUnlockLaunchWithBiometric()}
                className="w-full min-h-[48px] rounded-full bg-[var(--wa-accent)] text-white text-sm font-bold hover:brightness-95 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ScanFace className="w-5 h-5" aria-hidden="true" />
                <span>
                  {biometricLaunchBusy ? 'بانتظار التحقق الحيوي...' : 'الفتح بالبصمة أو الوجه'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBiometricLaunchError(null);
                  setUsePinFallbackOnLaunch(true);
                }}
                className="w-full min-h-[42px] rounded-full bg-[#F0F2F5] dark:bg-[#111B21] text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center justify-center gap-1.5 hover:brightness-95 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                <span>استخدام رمز PIN بدلاً من ذلك</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full min-h-[38px] rounded-full text-xs font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:underline cursor-pointer"
              >
                تسجيل الخروج والعودة لشاشة الدخول
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (launchPinInput.trim() === (omarSettings.chatLockPin || '1234')) {
                setAppLockedOnLaunch(false);
                setLaunchPinInput('');
                setLaunchPinError(null);
              } else {
                setLaunchPinError('رمز القفل غير صحيح. حاول مرة أخرى.');
              }
            }}
            className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-3xl p-7 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] text-center space-y-5"
          >
            <div className="w-16 h-16 rounded-full bg-[var(--wa-accent-soft)] dark:bg-[#111B21] text-[var(--wa-accent)] flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
                تطبيق تواصل مقفل
              </h1>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1">
                أدخل رمز الحماية المكون من ٤ أرقام لفتح المحادثات
              </p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              dir="ltr"
              autoFocus
              maxLength={4}
              value={launchPinInput}
              onChange={(e) => {
                setLaunchPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                setLaunchPinError(null);
              }}
              aria-label="رمز قفل التطبيق"
              className="w-full min-h-[52px] rounded-2xl bg-[#F0F2F5] dark:bg-[#111B21] px-4 py-3 text-center font-mono-code text-xl tracking-[0.6em] text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
            />
            {launchPinError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {launchPinError}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-full bg-[var(--wa-accent)] text-white text-sm font-bold hover:brightness-95 cursor-pointer"
              >
                فتح التطبيق
              </button>
              {hasBiometricConfigured && (
                <button
                  type="button"
                  onClick={() => {
                    setLaunchPinError(null);
                    setUsePinFallbackOnLaunch(false);
                  }}
                  className="w-full min-h-[42px] rounded-full bg-[#F0F2F5] dark:bg-[#111B21] text-xs font-semibold text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)] flex items-center justify-center gap-1.5 hover:brightness-95 cursor-pointer"
                >
                  <Fingerprint className="w-4 h-4" aria-hidden="true" />
                  <span>استخدام البصمة أو الوجه</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full min-h-[40px] rounded-full text-xs font-semibold text-[#54656F] dark:text-[#AEBAC1] hover:underline cursor-pointer"
              >
                تسجيل الخروج والعودة لشاشة الدخول
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full max-w-full overflow-hidden bg-[#EAE6DF] dark:bg-[#0C1317] flex">
      <div className="w-full max-w-full min-w-0 h-full flex overflow-hidden bg-white dark:bg-[#111B21]">
        {/* Navigation Rail */}
        <NavRail
          activeTab={showArchived ? 'archived' : activeTab}
          onSelectTab={(tab) => {
            setRightPanelMode('none');
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
          onSignOut={handleRequestSignOut}
        />

        {/* Active Workspace Pane */}
        {activeTab === 'chats' && (
          <div className="flex-1 flex h-full min-w-0 max-w-full overflow-hidden">
            <div
              className={`${
                mobileChatOpen ? 'hidden md:block' : 'block'
              } w-full max-w-full min-w-0 md:w-[340px] lg:w-[380px] md:shrink-0 h-full overflow-hidden`}
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
                lockedCount={omarSettings.lockedChatIds.length}
                lockedChatIds={omarSettings.lockedChatIds}
                myUid={currentUser.uid}
                currentUser={currentUser}
                statuses={sortedStatuses}
                showStoriesTray={omarSettings.showStoriesTray}
                dndMode={omarSettings.dndMode}
                onToggleDndMode={() => handleUpdateOmarSettings({ dndMode: !omarSettings.dndMode })}
                onOpenNewChat={() => setNewChatModalMode('direct')}
                onOpenNewGroup={() => setNewChatModalMode('group')}
                onOpenNewChannel={() => setNewChatModalMode('community')}
                onOpenBroadcast={() => {
                  setBroadcastChatIds(chats.slice(0, 2).map((c) => c.id));
                  setShowBroadcastModal(true);
                }}
                onOpenOmarAddons={() => {
                  setRightPanelMode('none');
                  setActiveTab('omar');
                }}
                onOpenCommunities={() => {
                  setRightPanelMode('none');
                  setActiveTab('communities');
                }}
                onOpenStarred={() => {
                  setRightPanelMode('none');
                  setActiveTab('starred');
                }}
                onOpenStatusTab={(authorId) => {
                  setRightPanelMode('none');
                  setInitialStoryAuthorId(authorId || null);
                  setActiveTab('status');
                }}
                onTogglePin={(id) => handleToggleChatProp(id, 'pinned')}
                onToggleArchive={(id) => handleToggleChatProp(id, 'archived')}
                onToggleMute={(id) => handleToggleChatProp(id, 'muted')}
                onToggleFavorite={(id) => handleToggleChatProp(id, 'favorite')}
                onToggleLockChat={handleToggleLockChat}
                isCloudSynced={isCloudSynced}
                allChats={chats}
                messagesMap={messagesMap}
                unlockedChatIds={unlockedSessionChatIds}
                onJumpToMessage={handleJumpToMessage}
                onLockAppNow={handleLockAppNow}
                onSignOut={handleRequestSignOut}
              />
            </div>

            <div
              className={`${
                mobileChatOpen ? 'flex' : 'hidden md:flex'
              } flex-1 min-w-0 h-full`}
            >
              <ChatWindow
                chat={selectedChat}
                chats={chats}
                messages={activeMessages}
                myUid={currentUser.uid}
                omarSettings={omarSettings}
                onBackMobile={() => setMobileChatOpen(false)}
                onSendMessage={handleSendMessage}
                onEditMessage={handleEditMessage}
                onRetryMessage={handleRetryMessage}
                onForwardMessage={handleForwardMessage}
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
                onToggleLockChat={handleToggleLockChat}
                onTypingChange={handleTypingChange}
                isLocked={
                  selectedChat ? omarSettings.lockedChatIds.includes(selectedChat.id) : false
                }
                highlightedMessageId={
                  highlightedJump && selectedChat && highlightedJump.chatId === selectedChat.id
                    ? highlightedJump.messageId
                    : null
                }
                externalSearchQuery={
                  highlightedJump && selectedChat && highlightedJump.chatId === selectedChat.id
                    ? highlightedJump.query
                    : ''
                }
                onClearExternalHighlight={() => setHighlightedJump(null)}
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
                onJumpToMessage={(msgId, q) => {
                  if (selectedChat) handleJumpToMessage(selectedChat.id, msgId, q);
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'status' && (
          <StatusView
            statuses={sortedStatuses}
            pinnedStatusIds={pinnedStatusIds}
            currentUser={currentUser}
            contacts={contactsList}
            hideViewStatus={omarSettings.hideViewStatus}
            initialAuthorId={initialStoryAuthorId}
            onConsumeInitialAuthor={() => setInitialStoryAuthorId(null)}
            onPublishStatus={handlePublishStatus}
            onMarkViewed={handleMarkStatusViewed}
            onTogglePinStatus={handleTogglePinStatus}
            onDeleteStatus={handleDeleteStatus}
            onReplyToStatus={(authorId, authorName, replyText, preview) =>
              void handleReplyToStatus(authorId, authorName, replyText, preview)
            }
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
            onCreateChannel={() => setNewChatModalMode('community')}
            onJoinSuggestedChannel={handleJoinSuggestedChannel}
            onTogglePin={(id) => handleToggleChatProp(id, 'pinned')}
            onToggleMute={(id) => handleToggleChatProp(id, 'muted')}
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

        {activeTab === 'omar' && (
          <OmarAddonsView
            settings={omarSettings}
            theme={theme}
            chats={chats}
            currentUser={currentUser}
            onUpdateSettings={handleUpdateOmarSettings}
            onToggleTheme={handleToggleTheme}
            onToggleLockChat={handleToggleLockChat}
            onResetDefaults={() => {
              setOmarSettings(DEFAULT_OMAR_SETTINGS);
              showToast('تمت استعادة الإعدادات الافتراضية بنجاح');
            }}
            onLockAppNow={handleLockAppNow}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            currentUser={currentUser}
            privacySettings={privacySettings}
            theme={theme}
            isCloudSynced={isCloudSynced}
            omarSettings={omarSettings}
            onUpdateOmarSettings={handleUpdateOmarSettings}
            onLockAppNow={handleLockAppNow}
            onShowToast={showToast}
            onToggleTheme={handleToggleTheme}
            onSaveProfile={handleSaveProfile}
            onUpdatePrivacy={handleUpdatePrivacy}
            onSignOut={handleRequestSignOut}
            isSigningOut={isSigningOut}
            onGoogleSignIn={handleGoogleSignIn}
            onOpenOmarAddons={() => setActiveTab('omar')}
          />
        )}
      </div>

      {/* New Chat / Group Modal */}
      <NewChatModal
        mode={newChatModalMode}
        myUid={currentUser.uid}
        isCloudSynced={isCloudSynced}
        contacts={contactsList}
        onClose={() => setNewChatModalMode(null)}
        onCreateDirectChat={handleCreateDirectChat}
        onCreateGroupChat={handleCreateGroupChat}
        onLookupPeerByUid={fetchPublicProfileByUid}
        onImportGoogleContacts={handleImportGoogleContacts}
      />

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد تسجيل الخروج"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
                تسجيل الخروج من الحساب؟
              </h3>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1.5 leading-relaxed">
                {currentUser.displayName} ({currentUser.email || currentUser.phone || 'حساب محلي غير مرتبط بالسحابة'})
              </p>
              <p className="text-[11px] text-[#667781] dark:text-[#8696A0] mt-1">
                {isCloudSynced
                  ? 'المزامنة السحابية مفعّلة: ستبقى محادثاتك ورسائلك محفوظة سحابياً عند العودة.'
                  : 'الوضع المحلي نشط: يمكنك تسجيل الدخول بحساب Google أو البريد لمزامنة محادثاتك سحابياً.'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSigningOut}
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold bg-[#F0F2F5] dark:bg-[#111B21] text-[#111B21] dark:text-[#E9EDEF] hover:brightness-95 disabled:opacity-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSigningOut}
                onClick={() => void handleSignOut()}
                className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>{isSigningOut ? 'جاري الخروج...' : 'تأكيد تسجيل الخروج'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Biometric / PIN Unlock Modal for Locked Chats */}
      {pendingLockedChatId && (() => {
        const hasBiometricChat =
          omarSettings.lockMethod === 'biometric' && Boolean(omarSettings.biometricCredentialId);
        const showBiometricChat = hasBiometricChat && !usePinFallbackForChat;

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="إدخال رمز قفل المحادثة"
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          >
            {showBiometricChat ? (
              <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--wa-accent)]/15 text-[var(--wa-accent)] flex items-center justify-center mx-auto">
                  <Fingerprint className="w-6 h-6" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    محادثة محمية بالبصمة
                  </h3>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1 leading-relaxed">
                    تحقق عبر {omarSettings.biometricDeviceLabel || 'البصمة أو الوجه'} لفتح هذه المحادثة المقفلة
                  </p>
                </div>
                {biometricChatError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {biometricChatError}
                  </p>
                )}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    disabled={biometricChatBusy}
                    aria-label="فتح المحادثة بالبصمة أو التعرف على الوجه"
                    onClick={() => void handleUnlockChatWithBiometric()}
                    className="w-full min-h-[42px] px-5 py-2 rounded-xl bg-[var(--wa-accent)] text-white text-xs font-bold hover:brightness-95 disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ScanFace className="w-4 h-4" aria-hidden="true" />
                    <span>{biometricChatBusy ? 'جاري التحقق...' : 'فتح بالبصمة أو الوجه'}</span>
                  </button>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBiometricChatError(null);
                        setUsePinFallbackForChat(true);
                      }}
                      className="flex-1 py-2 rounded-lg bg-[#F0F2F5] dark:bg-[#111B21] text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                    >
                      استخدام رمز PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingLockedChatId(null)}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleVerifyChatPin}
                className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-center"
              >
                <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    محادثة مقفلة برمز سري
                  </h3>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0] mt-1">
                    أدخل رمز القفل المكون من ٤ أرقام لفتح المحادثة (الافتراضي: 1234)
                  </p>
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={4}
                  value={pinModalInput}
                  onChange={(e) => {
                    setPinModalInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setPinModalError(null);
                  }}
                  aria-label="أدخل الرمز السري"
                  className="w-full rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] px-4 py-3 text-center font-mono-code text-lg tracking-[0.6em] text-[#111B21] dark:text-[#E9EDEF] focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                />
                {pinModalError && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {pinModalError}
                  </p>
                )}
                {hasBiometricChat && (
                  <button
                    type="button"
                    onClick={() => {
                      setPinModalError(null);
                      setUsePinFallbackForChat(false);
                    }}
                    className="w-full py-2 rounded-lg bg-[#F0F2F5] dark:bg-[#111B21] text-xs font-semibold text-[var(--wa-accent-strong)] dark:text-[var(--wa-accent)] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4" aria-hidden="true" />
                    <span>الفتح بالبصمة أو الوجه</span>
                  </button>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingLockedChatId(null)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 cursor-pointer"
                  >
                    فتح المحادثة
                  </button>
                </div>
              </form>
            )}
          </div>
        );
      })()}

      {/* Omar Broadcast Message Modal */}
      {showBroadcastModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="رسالة بث جماعية"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSendBroadcast(e)}
            className="w-full max-w-md bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-[#E9EDEF] dark:border-[#374248] overflow-hidden flex flex-col max-h-[85vh]"
          >
            <header className="px-5 py-4 bg-[var(--wa-accent-strong)] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5" aria-hidden="true" />
                <h2 className="font-display text-base font-bold">رسالة بث جماعية مشفرة</h2>
              </div>
              <button
                type="button"
                aria-label="إغلاق نافذة البث"
                onClick={() => setShowBroadcastModal(false)}
                className="p-1 rounded-full hover:bg-white/15 cursor-pointer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </header>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <p className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] mb-2">
                  اختر المحادثات المستلمة ({broadcastChatIds.length})
                </p>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {chats.map((c) => {
                    const checked = broadcastChatIds.includes(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setBroadcastChatIds((prev) =>
                              prev.includes(c.id)
                                ? prev.filter((id) => id !== c.id)
                                : [...prev, c.id]
                            )
                          }
                          className={`w-full p-2.5 rounded-xl flex items-center justify-between gap-2 text-right transition-colors cursor-pointer ${
                            checked
                              ? 'bg-[var(--wa-accent-soft)]/60 dark:bg-[#111B21]'
                              : 'bg-[#F8FAFB] dark:bg-[#182229]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar src={c.avatarUrl} name={c.title} size="sm" isGroup={c.type !== 'direct'} />
                            <span className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                              {c.title}
                            </span>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                              checked
                                ? 'bg-[var(--wa-accent)] text-white'
                                : 'border border-[#8696A0]/50'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" aria-hidden="true" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <label htmlFor="broadcast-text" className="block text-xs font-semibold text-[#54656F] dark:text-[#8696A0] mb-1">
                  نص الرسالة الجماعية
                </label>
                <textarea
                  id="broadcast-text"
                  rows={3}
                  required
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="اكتب رسالة البث لإرسالها بشكل منفرد ومشفر للمحادثات المحددة..."
                  className="w-full rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] p-3 text-sm text-[#111B21] dark:text-[#E9EDEF] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--wa-accent)]"
                />
              </div>
            </div>

            <footer className="p-4 border-t border-[#E9EDEF] dark:border-[#2A3942] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#54656F] dark:text-[#AEBAC1] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSendingBroadcast || broadcastChatIds.length === 0 || !broadcastText.trim()}
                className="px-5 py-2 rounded-lg bg-[var(--wa-accent)] text-white text-xs font-semibold flex items-center gap-1.5 hover:brightness-95 disabled:opacity-50 cursor-pointer"
              >
                <SendHorizontal className="w-3.5 h-3.5 rotate-180" aria-hidden="true" />
                <span>{isSendingBroadcast ? 'جاري الإرسال...' : 'إرسال البث'}</span>
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* Active WebRTC Call Modal */}
      {activeCall && (
        <CallOverlay
          activeCall={activeCall}
          myUid={currentUser.uid}
          isCloudSynced={isCloudSynced}
          onEndCall={(dur, finalStatus, skipRemoteFinalize) =>
            void handleEndCall(dur, finalStatus, skipRemoteFinalize)
          }
        />
      )}

      {/* Non-blocking Email Verification Banner (Top on mobile to avoid FAB collision, Bottom-Left on desktop) */}
      {needsEmailVerification && (
        <div
          role="status"
          className="fixed top-16 md:top-auto md:bottom-4 left-3 right-3 md:right-auto z-40 md:max-w-sm bg-amber-50 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-800 rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-100"
        >
          <div className="flex items-center gap-2 min-w-0">
            <MailCheck className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
            <span className="leading-snug">بريدك الإلكتروني غير مؤكد بعد لتفعيل كامل المزامنة السحابية.</span>
          </div>
          <button
            type="button"
            onClick={() => void handleResendVerificationEmail()}
            className="shrink-0 font-bold text-[var(--wa-accent-strong)] dark:text-amber-200 underline cursor-pointer"
          >
            إرسال الرابط
          </button>
        </div>
      )}

      {/* Non-blocking Toast Banner (above fullscreen StatusViewer & CallOverlay) */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] max-w-[calc(100vw-1.5rem)] truncate px-4 py-2.5 rounded-full bg-[#111B21] dark:bg-[#233138] text-white text-xs font-semibold shadow-xl border border-white/10"
        >
          {toastMessage}
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
