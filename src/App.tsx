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
  KeyRound,
  Clock
} from 'lucide-react';
import { auth, googleProvider } from './lib/firebase';
import { uploadBackupToGoogleDrive, restoreBackupFromGoogleDrive } from './services/googleDriveBackup';
import { BUNDLED_ASSETS } from './data/assets';
import { mapFirebaseAuthErrorToArabic, parseWasilBackupJson } from './lib/authHelpers';
import { verifyBiometricCredential } from './lib/webauthn';
import {
  archivePreviousIdentityKey,
  computeSafetyNumber,
  deriveRoomKeyFromSeed,
  encryptPayload,
  generateIdentityKeyPair,
  mergeArchivedIdentityKeys,
  readStoredIdentityKeysForUid,
  saveStoredIdentityKeysForUid,
  setActiveCryptoUid,
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
  sortStatusesWithPinned
} from './lib/chatLogic';
import { deleteMediaBlob } from './lib/mediaStorage';
import { DEFAULT_OMAR_SETTINGS } from './lib/omarConfig';
import { normalizeAutoLockMinutes, shouldTriggerAutoLock } from './lib/autoLock';
import { normalizeChatWallpaper } from './lib/chatWallpaper';
import {
  buildBlockedUidSet,
  filterBlockedIncomingCall,
  filterBlockedMessages,
  filterBlockedStatuses,
  getDirectChatBlockedPeerUid,
  getDirectChatPeerUid,
  isUidBlocked,
  sanitizeChatsForBlockedUsers
} from './lib/blockedContacts';
import {
  detectClientDeviceInfo,
  getOrCreateLocalDeviceId
} from './lib/deviceSession';
import {
  backupUserDataToFirestore,
  blockUserInFirestore,
  claimCustomWasilId,
  createChatInFirestore,
  createMultiChatMessageSyncController,
  declineIncomingCallInFirestore,
  deleteChatInFirestore,
  deleteStatusFromFirestore,
  editEncryptedMessageInFirestore,
  fetchPublicProfileByUid,
  lookupUserByWasilIdOrUid,
  finalizeCallRecordInFirestore,
  inviteMemberToGroupInFirestore,
  markChatMessagesDeliveredInFirestore,
  markChatMessagesReadInFirestore,
  markStatusViewedInFirestore,
  publishStatusToFirestore,
  registerOrHeartbeatDeviceInFirestore,
  removeDeviceSessionInFirestore,
  removeMemberFromGroupInFirestore,
  restoreUserDataFromFirestore,
  saveChatPrefToFirestore,
  sendEncryptedMessageToFirestore,
  setUserPresenceInFirestore,
  softDeleteMessageInFirestore,
  subscribeBlockedUsersFromFirestore,
  subscribeCallsFromFirestore,
  subscribeIncomingCallsFromFirestore,
  subscribeOwnPrivateInfoFromFirestore,
  subscribeOwnPublicProfileFromFirestore,
  subscribeStatusesFromFirestore,
  subscribeUserChatsFromFirestore,
  subscribeUserDevicesFromFirestore,
  syncPublicKeyToAllUserChats,
  syncUserProfileToFirestore,
  togglePinStatusInFirestore,
  toggleStarMessageInFirestore,
  unblockUserInFirestore,
  updateChatTypingInFirestore,
  updateGroupSettingsInFirestore,
  updateMessageReactionsInFirestore,
  updatePrivacySettingsInFirestore,
  updateProfileInFirestore,
  updateThemePrefInFirestore,
  votePollInFirestore,
  scheduleMessageInFirestore,
  deleteScheduledMessageFromFirestore,
  subscribeScheduledMessagesFromFirestore,
  type MultiChatMessageSyncController
} from './services/firestoreSync';
import { AuthScreen, type OnboardingCompletionPayload } from './components/AuthScreen';
import { NavRail } from './components/NavRail';
import { ChatListPane } from './components/ChatListPane';
import { ChatWindow } from './components/ChatWindow';
import { ChatWallpaperModal } from './components/ChatWallpaperModal';
import { RightDrawer } from './components/RightDrawer';
import { StatusView, type PublishStatusPayload } from './components/StatusView';
import { CallsView } from './components/CallsView';
import { CallOverlay } from './components/CallOverlay';
import { SettingsView } from './components/SettingsView';
import { NewChatModal } from './components/NewChatModal';
import { GoogleContactsPickerModal, type RawGoogleContact } from './components/GoogleContactsPickerModal';
import { CommunitiesView, type SuggestedChannelItem } from './components/CommunitiesView';
import { StarredView } from './components/StarredView';
import { ScheduledMessagesModal } from './components/ScheduledMessagesModal';
import { OmarAddonsView } from './components/OmarAddonsView';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { OfflineIndicator } from './components/PWAInstallButton';
import { getNextChatId } from './lib/hotkeys';
import { Avatar } from './components/Avatar';
import type {
  BlockedContact,
  CallRecord,
  ChatFilter,
  ChatRoom,
  DecryptedMessage,
  DeviceSession,
  MessagePayload,
  MessageType,
  NavTab,
  OmarSettings,
  PrivacySettings,
  RightPanelMode,
  StatusItem,
  ThemeMode,
  UserProfile,
  ScheduledMessage
} from './types/chat';

const STORAGE_KEYS = {
  KEYS: 'wasil_identity_keys_v1',
  THEME: 'wasil_theme_v1',
  OMAR: 'wasil_omar_settings_v1',
  CHATS: 'wasil_chats_v1',
  MESSAGES: 'wasil_messages_v1',
  STATUSES: 'wasil_statuses_v1',
  PINNED_STATUSES: 'wasil_pinned_statuses_v1',
  CALLS: 'wasil_calls_v1',
  PROFILE: 'wasil_profile_v1',
  PRIVACY: 'wasil_privacy_v1',
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
  const [autoLockedNotice, setAutoLockedNotice] = useState<string | null>(null);
  const lastActivityMsRef = useRef<number>(Date.now());
  const [biometricLaunchBusy, setBiometricLaunchBusy] = useState(false);
  const [biometricLaunchError, setBiometricLaunchError] = useState<string | null>(null);
  const [usePinFallbackForChat, setUsePinFallbackForChat] = useState(false);
  const [biometricChatBusy, setBiometricChatBusy] = useState(false);
  const [biometricChatError, setBiometricChatError] = useState<string | null>(null);
  const holdEntryForProfileStep = useRef(false);
  const pendingOnboardingRef = useRef<OnboardingCompletionPayload | null>(null);
  const deliveredSummaryAckedRef = useRef<Set<string>>(new Set());
  const deliveredMsgAckedRef = useRef<Set<string>>(new Set());
  const readMsgAckedRef = useRef<Set<string>>(new Set());
  const lastTypingSentRef = useRef<{ chatId: string; active: boolean } | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const [identityKeys, setIdentityKeys] = useState<IdentityKeys | null>(() => {
    const savedProfile = readJsonStorage<UserProfile>(STORAGE_KEYS.PROFILE);
    const savedUid = savedProfile && isRemoteFirebaseUid(savedProfile.uid) ? savedProfile.uid : null;
    if (savedUid) {
      setActiveCryptoUid(savedUid);
      return readStoredIdentityKeysForUid(savedUid) || readJsonStorage<IdentityKeys>(STORAGE_KEYS.KEYS);
    }
    return readJsonStorage<IdentityKeys>(STORAGE_KEYS.KEYS);
  });
  const [linkedDevices, setLinkedDevices] = useState<DeviceSession[]>([]);
  const localDeviceMeta = useMemo(
    () => ({
      deviceId: getOrCreateLocalDeviceId(),
      ...detectClientDeviceInfo()
    }),
    []
  );
  const identityKeysRef = useRef<IdentityKeys | null>(identityKeys);
  const msgSyncControllerRef = useRef<MultiChatMessageSyncController | null>(null);
  const deviceRegisteredRef = useRef(false);
  const remoteRevokeHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    identityKeysRef.current = identityKeys;
  }, [identityKeys]);

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const saved = readJsonStorage<UserProfile>(STORAGE_KEYS.PROFILE);
    const validSaved = saved && isRemoteFirebaseUid(saved.uid) ? saved : null;
    return (
      validSaved || {
        uid: '',
        displayName: 'مستخدم تواصل',
        about: 'متاح · رسائلي مشفرة تماماً',
        avatarUrl: '',
        publicKeyJwk: '',
        safetyCode: '48291 09384 71625 50192 83746 19283 47561 90283 61728 39405 18273 64590',
        isOnline: true,
        lastSeenMs: Date.now()
      }
    );
  });

  const uid = currentUser?.uid || 'guest';
  const userKeys = useMemo(() => ({
    CHATS: `${uid}_wasil_chats_v1`,
    MESSAGES: `${uid}_wasil_messages_v1`,
    STATUSES: `${uid}_wasil_statuses_v1`,
    PINNED_STATUSES: `${uid}_wasil_pinned_statuses_v1`,
    CALLS: `${uid}_wasil_calls_v1`,
    PROFILE: `${uid}_wasil_profile_v1`,
    PRIVACY: `${uid}_wasil_privacy_v1`,
    BLOCKED: `${uid}_wasil_blocked_v1`,
    ENTERED: `${uid}_wasil_entered_v1`
  }), [uid]);

  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(() => {
    return (
      (isRemoteFirebaseUid(uid) ? readJsonStorage<PrivacySettings>(userKeys.PRIVACY) : null) ||
      readJsonStorage<PrivacySettings>(STORAGE_KEYS.PRIVACY) ||
      DEFAULT_PRIVACY
    );
  });

  const [chats, setChats] = useState<ChatRoom[]>(() =>
    isRemoteFirebaseUid(uid) ? readJsonStorage<ChatRoom[]>(userKeys.CHATS) || [] : []
  );

  const [messagesMap, setMessagesMap] = useState<Record<string, DecryptedMessage[]>>(() =>
    isRemoteFirebaseUid(uid)
      ? readJsonStorage<Record<string, DecryptedMessage[]>>(userKeys.MESSAGES) || {}
      : {}
  );

  const [statuses, setStatuses] = useState<StatusItem[]>(() =>
    isRemoteFirebaseUid(uid)
      ? filterActiveStatuses(readJsonStorage<StatusItem[]>(userKeys.STATUSES) || [])
      : []
  );
  const [pinnedStatusIds, setPinnedStatusIds] = useState<string[]>(() =>
    isRemoteFirebaseUid(uid) ? readJsonStorage<string[]>(userKeys.PINNED_STATUSES) || [] : []
  );

  const [calls, setCalls] = useState<CallRecord[]>(() =>
    isRemoteFirebaseUid(uid) ? readJsonStorage<CallRecord[]>(userKeys.CALLS) || [] : []
  );

  const [blockedContacts, setBlockedContacts] = useState<BlockedContact[]>(() =>
    isRemoteFirebaseUid(uid) ? readJsonStorage<BlockedContact[]>(userKeys.BLOCKED) || [] : []
  );

  const blockedUidSet = useMemo(() => buildBlockedUidSet(blockedContacts), [blockedContacts]);
  const blockedUidSetRef = useRef<Set<string>>(blockedUidSet);
  useEffect(() => {
    blockedUidSetRef.current = blockedUidSet;
  }, [blockedUidSet]);

  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const dispatchingScheduledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser || !isCloudSynced) return;
    const unsub = subscribeScheduledMessagesFromFirestore(currentUser.uid, (msgs) => {
      setScheduledMessages(msgs);
    });
    return () => unsub();
  }, [currentUser, isCloudSynced]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const due = scheduledMessages.filter((m) => m.status === 'pending' && m.sendAtMs <= now);
      for (const msg of due) {
        if (dispatchingScheduledRef.current.has(msg.id)) continue;
        dispatchingScheduledRef.current.add(msg.id);
        try {
          const targetChat = chats.find((c) => c.id === msg.chatId);
          if (!targetChat) continue;
          await sendMessageToTargetChat(targetChat, msg.type, msg.payload);
          if (isCloudSynced) {
            await deleteScheduledMessageFromFirestore(msg.id);
          }
          setScheduledMessages((prev) =>
            prev.map((item) => (item.id === msg.id ? { ...item, status: 'sent' } : item))
          );
          showToast(`تم إرسال الرسالة المجدولة تلقائياً`);
        } catch (err) {
          console.error('Failed to dispatch scheduled message:', err);
        } finally {
          dispatchingScheduledRef.current.delete(msg.id);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [scheduledMessages, chats, isCloudSynced]);

  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [initialStoryAuthorId, setInitialStoryAuthorId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
  const [inspectMessageId, setInspectMessageId] = useState<string | null>(null);
  const [newChatModalMode, setNewChatModalMode] = useState<'direct' | 'group' | 'community' | null>(null);
  const [newChatInitialQuery, setNewChatInitialQuery] = useState('');
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [googleContacts, setGoogleContacts] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem('wasil_google_contacts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [rawGoogleContacts, setRawGoogleContacts] = useState<RawGoogleContact[]>([]);
  const [showGoogleContactsPicker, setShowGoogleContactsPicker] = useState(false);

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
  const [showScheduledListModal, setShowScheduledListModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [wallpaperPickerChatId, setWallpaperPickerChatId] = useState<string | null>(null);
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
      showToast('جاري جلب جهات الاتصال من Google...');
      const res = await fetch(
        'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos&pageSize=1000',
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
      if (connections.length === 0) {
        showToast('لم يتم العثور على أي جهات اتصال في حساب Google الخاص بك.');
        return;
      }
      const parsed: RawGoogleContact[] = connections.map((c: any, index: number) => {
        const name = c.names?.[0]?.displayName || c.emailAddresses?.[0]?.value || 'جهة اتصال Google';
        const email = c.emailAddresses?.[0]?.value || '';
        const phone = c.phoneNumbers?.[0]?.value || '';
        const photo = c.photos?.[0]?.url || '';
        return {
          id: c.resourceName || `raw_gc_${index}_${name}`,
          displayName: name,
          email,
          phone,
          photo
        };
      });
      setRawGoogleContacts(parsed);
      setShowGoogleContactsPicker(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر استيراد جهات الاتصال.');
    }
  };

  const handleConfirmImportGoogleContacts = (selected: UserProfile[]) => {
    setGoogleContacts((prev) => {
      const existingKeys = new Set(
        prev.map((c) => (c.displayName + (c.phone || '') + (c.email || '')).toLowerCase())
      );
      const filteredNew = selected.filter(
        (c) => !existingKeys.has((c.displayName + (c.phone || '') + (c.email || '')).toLowerCase())
      );
      const updated = [...prev, ...filteredNew];
      try {
        localStorage.setItem('wasil_google_contacts', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showToast(`تم استيراد ${selected.length} جهة اتصال محددة بنجاح من Google`);
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

  // Track user interaction timestamps for Auto-Lock
  useEffect(() => {
    if (!isEntered || appLockedOnLaunch) return;
    lastActivityMsRef.current = Date.now();
    let lastRecorded = lastActivityMsRef.current;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRecorded >= 1000) {
        lastRecorded = now;
        lastActivityMsRef.current = now;
      }
    };

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
      'mousemove'
    ];
    for (const evt of events) {
      window.addEventListener(evt, recordActivity, { passive: true });
    }
    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, recordActivity);
      }
    };
  }, [isEntered, appLockedOnLaunch, omarSettings.autoLockTimeoutMinutes]);

  // Monitor inactivity and trigger Auto-Lock automatically
  useEffect(() => {
    const timeoutMinutes = normalizeAutoLockMinutes(omarSettings.autoLockTimeoutMinutes);
    if (timeoutMinutes <= 0 || !isEntered || appLockedOnLaunch) return;

    const hasOngoingCall = Boolean(
      activeCall && (activeCall.status === 'connected' || activeCall.status === 'ringing')
    );

    const checkAndLock = () => {
      if (
        shouldTriggerAutoLock({
          timeoutMinutes,
          lastActivityMs: lastActivityMsRef.current,
          nowMs: Date.now(),
          isEntered,
          isAlreadyLocked: appLockedOnLaunch,
          hasActiveCall: hasOngoingCall
        })
      ) {
        setUnlockedSessionChatIds([]);
        if (selectedChatId && omarSettings.lockedChatIds.includes(selectedChatId)) {
          setSelectedChatId(null);
          setMobileChatOpen(false);
        }
        setAutoLockedNotice(
          `تم القفل التلقائي للمحادثات بعد ${
            timeoutMinutes === 1 ? 'دقيقة واحدة' : `${timeoutMinutes} دقائق`
          } من عدم النشاط لحماية النسخة المشفرة.`
        );
        setLaunchPinInput('');
        setLaunchPinError(null);
        setUsePinFallbackOnLaunch(false);
        setBiometricLaunchError(null);
        setAppLockedOnLaunch(true);
      }
    };

    const intervalId = window.setInterval(checkAndLock, 5000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    omarSettings.autoLockTimeoutMinutes,
    omarSettings.lockedChatIds,
    isEntered,
    appLockedOnLaunch,
    activeCall,
    selectedChatId
  ]);

  // Ensure local ECDH identity keys exist (scoped per Firebase UID when signed in)
  useEffect(() => {
    let active = true;
    async function bootstrapCrypto() {
      const savedProfile = readJsonStorage<UserProfile>(STORAGE_KEYS.PROFILE);
      const savedUid = savedProfile && isRemoteFirebaseUid(savedProfile.uid) ? savedProfile.uid : null;
      if (savedUid) {
        setActiveCryptoUid(savedUid);
      }
      let keys =
        (savedUid ? readStoredIdentityKeysForUid(savedUid) : null) ||
        readJsonStorage<IdentityKeys>(STORAGE_KEYS.KEYS);
      if (!keys) {
        keys = await generateIdentityKeyPair();
        localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(keys));
      }
      if (savedUid) {
        saveStoredIdentityKeysForUid(keys, savedUid);
      }
      if (!active) return;
      identityKeysRef.current = keys;
      setIdentityKeys(keys);
      setCurrentUser((prev) => ({
        ...prev,
        publicKeyJwk: keys!.publicKeyJwk,
        safetyCode: keys!.safetyCode
      }));
    }
    void bootstrapCrypto();
    return () => {
      active = false;
    };
  }, []);

  // One-time cleanup of any legacy demo/guest localStorage keys on mount
  useEffect(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('wasil_demo_') || k.startsWith('local_user_') || k.startsWith('guest_wasil_')) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // Ignore storage access restriction
    }
  }, []);

  // Persist user-scoped cache only for verified Firebase accounts
  useEffect(() => {
    if (isRemoteFirebaseUid(currentUser.uid)) {
      localStorage.setItem(userKeys.CHATS, JSON.stringify(chats));
    }
  }, [chats, currentUser.uid, userKeys.CHATS]);

  useEffect(() => {
    if (isRemoteFirebaseUid(currentUser.uid)) {
      localStorage.setItem(userKeys.MESSAGES, JSON.stringify(messagesMap));
    }
  }, [messagesMap, currentUser.uid, userKeys.MESSAGES]);

  useEffect(() => {
    if (isRemoteFirebaseUid(currentUser.uid)) {
      localStorage.setItem(userKeys.PINNED_STATUSES, JSON.stringify(pinnedStatusIds));
    }
  }, [pinnedStatusIds, currentUser.uid, userKeys.PINNED_STATUSES]);

  useEffect(() => {
    if (isRemoteFirebaseUid(currentUser.uid)) {
      localStorage.setItem(userKeys.STATUSES, JSON.stringify(statuses));
      localStorage.setItem(userKeys.CALLS, JSON.stringify(calls));
      localStorage.setItem(userKeys.BLOCKED, JSON.stringify(blockedContacts));
      localStorage.setItem(userKeys.PROFILE, JSON.stringify(currentUser));
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(currentUser));
      localStorage.setItem(userKeys.PRIVACY, JSON.stringify(privacySettings));
    }
  }, [statuses, calls, blockedContacts, currentUser, privacySettings, userKeys]);

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

  // Real Firebase Auth + Multi-Device Firestore Subscriptions
  useEffect(() => {
    let unsubChats: (() => void) | null = null;
    let unsubStatuses: (() => void) | null = null;
    let unsubCalls: (() => void) | null = null;
    let unsubIncomingCalls: (() => void) | null = null;
    let unsubOwnPublic: (() => void) | null = null;
    let unsubOwnPrivate: (() => void) | null = null;
    let unsubDevices: (() => void) | null = null;
    let unsubBlocked: (() => void) | null = null;

    const cleanupDataSubscriptions = () => {
      unsubChats?.();
      unsubChats = null;
      unsubStatuses?.();
      unsubStatuses = null;
      unsubCalls?.();
      unsubCalls = null;
      unsubIncomingCalls?.();
      unsubIncomingCalls = null;
      unsubOwnPublic?.();
      unsubOwnPublic = null;
      unsubOwnPrivate?.();
      unsubOwnPrivate = null;
      unsubDevices?.();
      unsubDevices = null;
      unsubBlocked?.();
      unsubBlocked = null;
    };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      cleanupDataSubscriptions();

      if (!fbUser) {
        msgSyncControllerRef.current?.dispose();
        msgSyncControllerRef.current = null;
        deviceRegisteredRef.current = false;
        setActiveCryptoUid(null);
        identityKeysRef.current = null;
        setIdentityKeys(null);
        localStorage.removeItem(STORAGE_KEYS.ENTERED);
        localStorage.removeItem(STORAGE_KEYS.PROFILE);
        setIsCloudSynced(false);
        setNeedsEmailVerification(false);
        setIsEntered(false);
        setChats([]);
        setMessagesMap({});
        setStatuses([]);
        setCalls([]);
        setBlockedContacts([]);
        setScheduledMessages([]);
        setLinkedDevices([]);
        setSelectedChatId(null);
        setAppLockedOnLaunch(false);
        setCurrentUser((prev) => ({
          ...prev,
          uid: '',
          wasilId: undefined,
          email: undefined,
          phone: undefined
        }));
        return;
      }

      const isPasswordProvider = fbUser.providerData.some((p) => p.providerId === 'password');
      setNeedsEmailVerification(Boolean(isPasswordProvider && !fbUser.emailVerified));

      setActiveCryptoUid(fbUser.uid);
      const savedProfile = readJsonStorage<UserProfile>(STORAGE_KEYS.PROFILE);
      const canMigrateUnscopedKeys = !savedProfile?.uid || savedProfile.uid === fbUser.uid;
      let keys =
        readStoredIdentityKeysForUid(fbUser.uid) ||
        (canMigrateUnscopedKeys ? readJsonStorage<IdentityKeys>(STORAGE_KEYS.KEYS) : null) ||
        (await generateIdentityKeyPair());
      saveStoredIdentityKeysForUid(keys, fbUser.uid);
      localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(keys));
      identityKeysRef.current = keys;
      setIdentityKeys(keys);

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

      setCurrentUser((prev) => ({
        ...profile,
        ...(prev.uid === fbUser.uid && prev.wasilId ? { wasilId: prev.wasilId } : {})
      }));
      setIsCloudSynced(true);
      if (!holdEntryForProfileStep.current) {
        localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
        setIsEntered(true);
      }

      // Subscribe immediately in parallel with profile hydration for faster multi-device sync
      unsubChats = subscribeUserChatsFromFirestore(fbUser.uid, (cloudChats) => {
        setChats(cloudChats);
        if (cloudChats.length > 0) {
          setSelectedChatId((curr) =>
            curr && cloudChats.some((c) => c.id === curr) ? curr : cloudChats[0].id
          );
        } else {
          setSelectedChatId(null);
        }
      });

      unsubStatuses = subscribeStatusesFromFirestore(fbUser.uid, (cloudStatuses) => {
        setStatuses(cloudStatuses);
      });

      unsubCalls = subscribeCallsFromFirestore(fbUser.uid, (cloudCalls) => {
        setCalls(cloudCalls);
      });

      unsubIncomingCalls = subscribeIncomingCallsFromFirestore(fbUser.uid, (incoming) => {
        const { allowed, blockedCallToDecline } = filterBlockedIncomingCall(
          incoming,
          blockedUidSetRef.current
        );
        if (blockedCallToDecline) {
          void declineIncomingCallInFirestore(blockedCallToDecline.id).catch(() => {});
        }
        if (allowed) {
          setActiveCall((curr) => (curr ? curr : allowed));
        } else {
          setActiveCall((curr) =>
            curr && curr.direction === 'incoming' && curr.status === 'ringing' ? null : curr
          );
        }
      });

      unsubBlocked = subscribeBlockedUsersFromFirestore(fbUser.uid, (list) => {
        setBlockedContacts(list);
      });

      unsubOwnPublic = subscribeOwnPublicProfileFromFirestore(fbUser.uid, (pubPatch) => {
        setCurrentUser((curr) => {
          if (curr.uid !== fbUser.uid) return curr;
          return {
            ...curr,
            ...(pubPatch.wasilId ? { wasilId: pubPatch.wasilId } : {}),
            displayName: pubPatch.displayName || curr.displayName,
            about: pubPatch.about,
            avatarUrl: pubPatch.avatarUrl,
            ...(pubPatch.publicKeyJwk ? { publicKeyJwk: pubPatch.publicKeyJwk } : {}),
            ...(pubPatch.safetyCode ? { safetyCode: pubPatch.safetyCode } : {})
          };
        });
      });

      unsubOwnPrivate = subscribeOwnPrivateInfoFromFirestore(fbUser.uid, (privPatch) => {
        setPrivacySettings(privPatch.privacy);
        setTheme(privPatch.theme);
        if (privPatch.wasilId) {
          setCurrentUser((curr) =>
            curr.uid === fbUser.uid ? { ...curr, wasilId: privPatch.wasilId } : curr
          );
        }
        if (
          privPatch.identityKeys &&
          privPatch.identityKeys.publicKeyJwk !== identityKeysRef.current?.publicKeyJwk
        ) {
          archivePreviousIdentityKey(identityKeysRef.current, fbUser.uid);
          identityKeysRef.current = privPatch.identityKeys;
          saveStoredIdentityKeysForUid(privPatch.identityKeys, fbUser.uid);
          localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(privPatch.identityKeys));
          setIdentityKeys(privPatch.identityKeys);
          setCurrentUser((curr) =>
            curr.uid === fbUser.uid
              ? {
                  ...curr,
                  publicKeyJwk: privPatch.identityKeys!.publicKeyJwk,
                  safetyCode: privPatch.identityKeys!.safetyCode
                }
              : curr
          );
          void syncPublicKeyToAllUserChats(
            fbUser.uid,
            fbUser.displayName || 'مستخدم تواصل',
            fbUser.photoURL || '',
            privPatch.identityKeys.publicKeyJwk
          );
          msgSyncControllerRef.current?.resubscribeAll();
        }
      });

      unsubDevices = subscribeUserDevicesFromFirestore(fbUser.uid, (devices) => {
        setLinkedDevices(devices);
        const hasSelf = devices.some((d) => d.deviceId === localDeviceMeta.deviceId);
        if (hasSelf) {
          deviceRegisteredRef.current = true;
        } else if (deviceRegisteredRef.current && auth.currentUser?.uid === fbUser.uid) {
          deviceRegisteredRef.current = false;
          remoteRevokeHandlerRef.current();
        }
      });

      try {
        const currentTheme: ThemeMode =
          localStorage.getItem(STORAGE_KEYS.THEME) === 'dark' ? 'dark' : 'light';
        const hydrated = await syncUserProfileToFirestore(
          fbUser,
          keys.publicKeyJwk,
          keys.safetyCode,
          profile.about,
          currentTheme,
          pendingOnboardingRef.current?.wasilId,
          keys.privateKeyJwk
        );
        if (hydrated.previousIdentityKeys && hydrated.previousIdentityKeys.length > 0) {
          mergeArchivedIdentityKeys(hydrated.previousIdentityKeys, fbUser.uid);
        }
        const resolvedKeys = hydrated.identityKeys || keys;
        saveStoredIdentityKeysForUid(resolvedKeys, fbUser.uid);
        const keysChanged = resolvedKeys.publicKeyJwk !== keys.publicKeyJwk;
        if (keysChanged) {
          archivePreviousIdentityKey(identityKeysRef.current, fbUser.uid);
          identityKeysRef.current = resolvedKeys;
          localStorage.setItem(STORAGE_KEYS.KEYS, JSON.stringify(resolvedKeys));
          setIdentityKeys(resolvedKeys);
          msgSyncControllerRef.current?.resubscribeAll();
        }
        const pending = pendingOnboardingRef.current;
        setCurrentUser((curr) => ({
          ...profile,
          publicKeyJwk: resolvedKeys.publicKeyJwk,
          safetyCode: resolvedKeys.safetyCode,
          wasilId: pending?.wasilId || hydrated.wasilId,
          displayName: pending?.displayName || hydrated.displayName,
          about: pending?.about ?? hydrated.about,
          avatarUrl: pending?.avatarUrl || hydrated.avatarUrl,
          ...(curr.uid === fbUser.uid && curr.phone ? { phone: curr.phone } : {})
        }));
        setPrivacySettings(hydrated.privacy);
        setTheme(hydrated.theme);
      } catch (syncErr) {
        console.warn('Sync profile fallback to local state:', syncErr);
      }
    });

    return () => {
      cleanupDataSubscriptions();
      unsubAuth();
    };
  }, [localDeviceMeta.deviceId]);

  // Persistent multi-chat real-time message synchronization controller (no teardown on chats state updates)
  useEffect(() => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid)) {
      msgSyncControllerRef.current?.dispose();
      msgSyncControllerRef.current = null;
      return;
    }

    const controller = createMultiChatMessageSyncController(
      currentUser.uid,
      (chatId, cloudMsgs) => {
        const visibleCloudMsgs = filterBlockedMessages(cloudMsgs, blockedUidSetRef.current);
        setMessagesMap((prev) => {
          const existingLocal = prev[chatId] || [];
          const cloudIds = new Set(visibleCloudMsgs.map((m) => m.id));
          const pendingOrFailed = existingLocal.filter(
            (m) => (m.status === 'sending' || m.status === 'failed') && !cloudIds.has(m.id)
          );
          const merged =
            pendingOrFailed.length > 0
              ? [...visibleCloudMsgs, ...pendingOrFailed].sort((a, b) => a.createdAtMs - b.createdAtMs)
              : visibleCloudMsgs;
          return { ...prev, [chatId]: merged };
        });
      }
    );
    msgSyncControllerRef.current = controller;

    return () => {
      controller.dispose();
      if (msgSyncControllerRef.current === controller) {
        msgSyncControllerRef.current = null;
      }
    };
  }, [isCloudSynced, currentUser.uid]);

  useEffect(() => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid) || !msgSyncControllerRef.current) {
      return;
    }
    const targets = chats
      .filter((c) => c.memberIds?.includes(currentUser.uid))
      .map((c) => ({
        id: c.id,
        roomSeed: c.roomSeed || c.id,
        lastMessageAtMs: c.lastMessageAtMs || 0,
        ...(c.peerUid ? { peerUid: c.peerUid } : {}),
        ...(c.peerPublicKeyJwk ? { peerPublicKeyJwk: c.peerPublicKeyJwk } : {})
      }));
    msgSyncControllerRef.current.syncTargets(targets, selectedChatId);
  }, [isCloudSynced, currentUser.uid, selectedChatId, chats]);

  // Real-time multi-device online/lastSeen presence synchronization + periodic device heartbeat
  useEffect(() => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid)) return;

    const pushPresence = (online: boolean) => {
      if (omarSettings.freezeLastSeen) {
        void registerOrHeartbeatDeviceInFirestore(currentUser.uid, {
          ...localDeviceMeta,
          isOnline: online
        });
        return;
      }
      void setUserPresenceInFirestore(currentUser.uid, online, localDeviceMeta);
    };

    pushPresence(document.visibilityState === 'visible');

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        pushPresence(true);
      }
    }, 120_000);

    const handleVisibility = () => {
      pushPresence(document.visibilityState === 'visible');
    };
    const handlePageHide = () => {
      pushPresence(false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isCloudSynced, currentUser.uid, omarSettings.freezeLastSeen, localDeviceMeta]);

  // Acknowledge delivery on incoming cloud chat summaries and synced messages even before opening each chat
  useEffect(() => {
    if (!isCloudSynced || !currentUser.uid) return;
    for (const c of chats) {
      if (getDirectChatBlockedPeerUid(c, currentUser.uid, blockedUidSet) !== null) continue;
      if (!c.memberIds?.includes(currentUser.uid)) continue;

      const syncedMsgs = messagesMap[c.id] || [];
      const undeliveredMsgIds = syncedMsgs
        .filter(
          (m) =>
            m.senderId !== currentUser.uid &&
            !blockedUidSet.has(m.senderId) &&
            !m.deliveredToIds?.includes(currentUser.uid) &&
            !deliveredMsgAckedRef.current.has(m.id)
        )
        .map((m) => m.id);

      const summaryKey = `${c.id}:${c.lastMessageAtMs}`;
      const needSummaryDelivered =
        Boolean(c.lastMessageSenderId) &&
        c.lastMessageSenderId !== currentUser.uid &&
        !blockedUidSet.has(c.lastMessageSenderId) &&
        !c.lastMessageDeliveredToIds?.includes(currentUser.uid) &&
        !deliveredSummaryAckedRef.current.has(summaryKey);

      if (undeliveredMsgIds.length === 0 && !needSummaryDelivered) continue;

      undeliveredMsgIds.forEach((id) => deliveredMsgAckedRef.current.add(id));
      if (needSummaryDelivered) {
        deliveredSummaryAckedRef.current.add(summaryKey);
      }
      void markChatMessagesDeliveredInFirestore(
        c.id,
        currentUser.uid,
        undeliveredMsgIds,
        needSummaryDelivered
      );
    }
  }, [isCloudSynced, chats, messagesMap, currentUser.uid, blockedUidSet]);

  // Immediately terminate any incoming ringing call if the caller becomes blocked
  useEffect(() => {
    if (!activeCall || activeCall.direction !== 'incoming') return;
    if (blockedUidSet.has(activeCall.callerId)) {
      const blockedId = activeCall.id;
      setActiveCall(null);
      if (isCloudSynced && activeCall.status === 'ringing') {
        void declineIncomingCallInFirestore(blockedId).catch(() => {});
      }
    }
  }, [activeCall, blockedUidSet, isCloudSynced]);

  // Cleanup pending typing timeout on unmount
  useEffect(() => {
    return () => {
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
      void updateProfile(cred.user, { displayName }).catch(() => {});
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
    pendingOnboardingRef.current = payload;
    const normalizedWasilId = payload.wasilId.trim().toLowerCase();
    const updatedUser: UserProfile = {
      ...currentUser,
      wasilId: normalizedWasilId,
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

    // Enter workspace immediately so UI never stalls on slow/offline Firestore writes
    localStorage.setItem(STORAGE_KEYS.ENTERED, 'true');
    setIsEntered(true);
    showToast(`أهلاً بك ${payload.displayName} (${normalizedWasilId}) في تواصل!`);

    if (auth.currentUser) {
      void updateProfile(auth.currentUser, {
        displayName: payload.displayName
      }).catch(() => {});
    }

    const targetUid = auth.currentUser?.uid || updatedUser.uid;
    if (isRemoteFirebaseUid(targetUid)) {
      void (async () => {
        let finalWasilId = normalizedWasilId;
        try {
          finalWasilId = await claimCustomWasilId(
            targetUid,
            payload.displayName,
            normalizedWasilId,
            currentUser.wasilId
          );
          if (finalWasilId !== normalizedWasilId) {
            setCurrentUser((prev) => ({ ...prev, wasilId: finalWasilId }));
          }
        } catch (err) {
          showToast(
            err instanceof Error
              ? err.message
              : 'تعذر حجز هذا المعرّف في السحابة، يمكنك تعديله لاحقاً من الإعدادات.'
          );
        }

        try {
          await updateProfileInFirestore(
            targetUid,
            { ...updatedUser, uid: targetUid, wasilId: finalWasilId },
            {
              displayName: payload.displayName,
              wasilId: finalWasilId,
              about: payload.about,
              avatarUrl: payload.avatarUrl
            }
          );
        } catch {
          // Offline cache handles queued persistence when connection stabilizes
        }
      })();
    }
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

  const executeSignOut = (
    toastMsg = 'تم تسجيل الخروج بنجاح',
    removeDeviceSession = true
  ) => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    holdEntryForProfileStep.current = false;
    pendingOnboardingRef.current = null;
    deviceRegisteredRef.current = false;

    const activeUid = currentUser.uid;

    // Immediately reset local state and close modals/spinners
    deliveredSummaryAckedRef.current.clear();
    deliveredMsgAckedRef.current.clear();
    readMsgAckedRef.current.clear();
    msgSyncControllerRef.current?.dispose();
    msgSyncControllerRef.current = null;
    setActiveCryptoUid(null);
    identityKeysRef.current = null;
    setIdentityKeys(null);
    localStorage.removeItem(STORAGE_KEYS.ENTERED);
    setChats([]);
    setMessagesMap({});
    setStatuses([]);
    setCalls([]);
    setBlockedContacts([]);
    setLinkedDevices([]);
    setSelectedChatId(null);
    setActiveCall(null);
    setShowSignOutConfirm(false);
    setAppLockedOnLaunch(false);
    setUnlockedSessionChatIds([]);
    setMobileChatOpen(false);
    setRightPanelMode('none');
    setWallpaperPickerChatId(null);
    setActiveTab('chats');
    setHighlightedJump(null);
    setIsCloudSynced(false);
    setIsEntered(false);
    setIsSigningOut(false);
    showToast(toastMsg);

    // Run network cleanup (this device only) and auth sign out without blocking UI
    setTimeout(() => {
      void (async () => {
        try {
          if (isRemoteFirebaseUid(activeUid)) {
            if (lastTypingSentRef.current?.active) {
              await updateChatTypingInFirestore(
                lastTypingSentRef.current.chatId,
                activeUid,
                false
              ).catch(() => {});
              lastTypingSentRef.current = null;
            }
            if (removeDeviceSession) {
              await removeDeviceSessionInFirestore(activeUid, localDeviceMeta.deviceId).catch(
                () => {}
              );
            }
          }
          await signOut(auth).catch(() => {});
        } catch (err) {
          console.warn('Background sign out cleanup error:', err);
        }
      })();
    }, 10);
  };

  const handleSignOut = () => {
    executeSignOut('تم تسجيل الخروج بنجاح', true);
  };

  useEffect(() => {
    remoteRevokeHandlerRef.current = () => {
      executeSignOut('تم إنهاء جلسة هذا الجهاز من جهاز آخر', false);
    };
  });

  const handleRevokeOtherDevice = async (deviceId: string) => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid)) return;
    await removeDeviceSessionInFirestore(currentUser.uid, deviceId);
    setLinkedDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
    showToast('تم فصل الجهاز وإنهاء جلسته السحابية');
  };

  const handleToggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (isCloudSynced) {
      void updateThemePrefInFirestore(currentUser.uid, next);
    }
  };

  const contactsList = useMemo(
    () => [...extractContactsFromChats(chats, [], currentUser.uid), ...googleContacts],
    [chats, currentUser.uid, googleContacts]
  );

  const displayChats = useMemo(
    () => sanitizeChatsForBlockedUsers(chats, currentUser.uid, blockedUidSet),
    [chats, currentUser.uid, blockedUidSet]
  );

  const visibleChats = useMemo(
    () =>
      filterAndSortChats(
        displayChats,
        chatFilter,
        searchQuery,
        showArchived,
        omarSettings.lockedChatIds
      ),
    [displayChats, chatFilter, searchQuery, showArchived, omarSettings.lockedChatIds]
  );

  const totalUnread = useMemo(
    () => displayChats.reduce((sum, c) => sum + (c.archived ? 0 : c.unreadCount), 0),
    [displayChats]
  );

  const archivedCount = useMemo(
    () => displayChats.filter((c) => c.archived).length,
    [displayChats]
  );

  const sortedStatuses = useMemo(
    () => sortStatusesWithPinned(filterBlockedStatuses(statuses, blockedUidSet), pinnedStatusIds),
    [statuses, blockedUidSet, pinnedStatusIds]
  );

  const selectedChat = useMemo(
    () => displayChats.find((c) => c.id === selectedChatId) || null,
    [displayChats, selectedChatId]
  );

  const selectedChatPeerBlocked = useMemo(
    () =>
      selectedChat
        ? getDirectChatBlockedPeerUid(selectedChat, currentUser.uid, blockedUidSet) !== null
        : false,
    [selectedChat, currentUser.uid, blockedUidSet]
  );

  const activeMessages = useMemo(() => {
    if (!selectedChatId) return [];
    const clearedAtMs = selectedChat?.clearedAtMs || 0;
    const msgs = filterBlockedMessages(messagesMap[selectedChatId] || [], blockedUidSet);
    return clearedAtMs > 0 ? msgs.filter((m) => m.createdAtMs > clearedAtMs) : msgs;
  }, [messagesMap, selectedChatId, selectedChat?.clearedAtMs, blockedUidSet]);

  // Acknowledge delivery & read receipts for the active cloud chat
  useEffect(() => {
    if (!isCloudSynced || !selectedChatId || !selectedChat) return;
    if (!selectedChat.memberIds?.includes(currentUser.uid)) return;
    if (selectedChatPeerBlocked) return;

    const flushReceipts = () => {
      const undeliveredIds = activeMessages
        .filter(
          (m) =>
            m.senderId !== currentUser.uid &&
            !blockedUidSet.has(m.senderId) &&
            !m.deliveredToIds?.includes(currentUser.uid) &&
            !deliveredMsgAckedRef.current.has(m.id)
        )
        .map((m) => m.id);

      const needLastDelivered =
        Boolean(selectedChat.lastMessageSenderId) &&
        selectedChat.lastMessageSenderId !== currentUser.uid &&
        !blockedUidSet.has(selectedChat.lastMessageSenderId) &&
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
              !blockedUidSet.has(m.senderId) &&
              !m.readByIds?.includes(currentUser.uid) &&
              !readMsgAckedRef.current.has(m.id)
          )
          .map((m) => m.id);

        const needLastRead =
          Boolean(selectedChat.lastMessageSenderId) &&
          selectedChat.lastMessageSenderId !== currentUser.uid &&
          !blockedUidSet.has(selectedChat.lastMessageSenderId) &&
          !selectedChat.lastMessageReadByIds?.includes(currentUser.uid);

        if (unreadIds.length > 0 || needLastRead) {
          unreadIds.forEach((id) => readMsgAckedRef.current.add(id));
          void markChatMessagesReadInFirestore(
            selectedChatId,
            currentUser.uid,
            unreadIds,
            needLastRead
          );
          if (selectedChat.unreadCount > 0) {
            void saveChatPrefToFirestore(currentUser.uid, selectedChatId, {
              pinned: selectedChat.pinned,
              archived: selectedChat.archived,
              muted: selectedChat.muted,
              favorite: selectedChat.favorite,
              unreadCount: 0,
              disappearingSeconds: selectedChat.disappearingSeconds,
              wallpaper: selectedChat.wallpaper || '',
              clearedAtMs: selectedChat.clearedAtMs || 0
            }).catch(() => {});
          }
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
    selectedChatPeerBlocked,
    blockedUidSet,
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
        const peer = contactsList.find((c) => c.uid === selectedChat.peerUid);
        if (peer && peer.publicKeyJwk && currentUser.publicKeyJwk) {
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
  }, [selectedChat?.id, selectedChat?.peerUid, contactsList, currentUser.publicKeyJwk, currentUser.safetyCode]);

  const persistChatPrefsIfCloud = (nextChat: ChatRoom) => {
    if (!isCloudSynced) return;
    void saveChatPrefToFirestore(currentUser.uid, nextChat.id, {
      pinned: nextChat.pinned,
      archived: nextChat.archived,
      muted: nextChat.muted,
      favorite: nextChat.favorite,
      unreadCount: nextChat.unreadCount,
      disappearingSeconds: nextChat.disappearingSeconds,
      wallpaper: nextChat.wallpaper || '',
      clearedAtMs: nextChat.clearedAtMs || 0
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

  const handleClearChatMessages = (chatId: string) => {
    setMessagesMap((prev) => {
      const next = { ...prev, [chatId]: [] };
      try {
        localStorage.setItem(userKeys.MESSAGES, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const handleClearOldMedia = (daysOld: number) => {
    const thresholdMs = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    setMessagesMap((prev) => {
      const next: Record<string, DecryptedMessage[]> = {};
      for (const [chatId, msgs] of Object.entries(prev)) {
        next[chatId] = msgs.map((m) => {
          const payload = m.payload || {};
          if (
            m.createdAtMs < thresholdMs &&
            (payload.mediaUrl || (payload.mediaUrls && payload.mediaUrls.length > 0) || payload.fileDataUrl)
          ) {
            return {
              ...m,
              payload: {
                ...payload,
                mediaUrl: undefined,
                mediaUrls: undefined,
                fileDataUrl: undefined,
                text: payload.text ? `${payload.text} [تم تنظيف الوسائط القديمة]` : '[تم تنظيف الوسائط القديمة]'
              }
            };
          }
          return m;
        });
      }
      try {
        localStorage.setItem(userKeys.MESSAGES, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
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
        lastActivityMsRef.current = Date.now();
        setAutoLockedNotice(null);
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

  const handleBlockContact = async (target: UserProfile) => {
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لإدارة قائمة الحظر');
      return;
    }
    try {
      const saved = await blockUserInFirestore(currentUser.uid, target);
      setBlockedContacts((prev) => [
        saved,
        ...prev.filter((item) => item.blockedUid !== saved.blockedUid)
      ]);
      if (activeCall && activeCall.callerId === saved.blockedUid) {
        const callToDecline = activeCall;
        setActiveCall(null);
        if (callToDecline.status === 'ringing') {
          void declineIncomingCallInFirestore(callToDecline.id).catch(() => {});
        }
      }
      showToast(`تم حظر ${saved.displayName} نهائياً — تم منع رسائله ومكالماته`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر حظر جهة الاتصال حالياً.');
      throw err;
    }
  };

  const handleUnblockContact = async (blockedUid: string) => {
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لإدارة قائمة الحظر');
      return;
    }
    try {
      await unblockUserInFirestore(currentUser.uid, blockedUid);
      setBlockedContacts((prev) => prev.filter((item) => item.blockedUid !== blockedUid));
      msgSyncControllerRef.current?.resubscribeAll();
      showToast('تم إلغاء حظر جهة الاتصال');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر إلغاء الحظر حالياً.');
      throw err;
    }
  };

  const handleToggleBlockForChat = async (chat: ChatRoom) => {
    if (chat.type !== 'direct') return;
    const peerUid = getDirectChatPeerUid(chat, currentUser.uid);
    if (!peerUid) {
      showToast('تعذر تحديد معرف جهة الاتصال.');
      return;
    }
    if (isUidBlocked(blockedUidSet, peerUid)) {
      await handleUnblockContact(peerUid);
      return;
    }
    const existingContact = contactsList.find((c) => c.uid === peerUid);
    let resolvedProfile: UserProfile | null = existingContact || null;
    if (!resolvedProfile) {
      resolvedProfile = await fetchPublicProfileByUid(peerUid).catch(() => null);
    }
    await handleBlockContact(
      resolvedProfile || {
        uid: peerUid,
        displayName: chat.title,
        about: chat.peerAbout || '',
        avatarUrl: chat.avatarUrl,
        publicKeyJwk: chat.peerPublicKeyJwk || '',
        safetyCode: '',
        isOnline: false,
        lastSeenMs: Date.now()
      }
    );
  };

  const sendMessageToTargetChat = async (
    targetChat: ChatRoom,
    type: MessageType,
    payload: MessagePayload,
    replyToId?: string,
    existingFailedMsgId?: string
  ) => {
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لإرسال الرسائل');
      return;
    }
    if (getDirectChatBlockedPeerUid(targetChat, currentUser.uid, blockedUidSet) !== null) {
      showToast('جهة الاتصال محظورة — قم بإلغاء الحظر أولاً لإرسال الرسائل');
      return;
    }

    const msgId =
      existingFailedMsgId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const roomKeyHint =
      targetChat.peerUid || targetChat.peerPublicKeyJwk
        ? { peerUid: targetChat.peerUid, peerPublicKeyJwk: targetChat.peerPublicKeyJwk }
        : undefined;
    const key = await deriveRoomKeyFromSeed(targetChat.roomSeed, roomKeyHint);
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
      status: 'sending',
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
              lastMessagePreview: payload.stickerLabel
                ? `ملصق: ${payload.stickerLabel}`
                : payload.text,
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
        msgId,
        roomKeyHint
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
  };

  const handleSendMessage = async (
    type: MessageType,
    payload: MessagePayload,
    replyToId?: string
  ) => {
    if (!selectedChat) return;
    await sendMessageToTargetChat(selectedChat, type, payload, replyToId);
  };

  const handleScheduleMessage = async (chatId: string, sendAtMs: number, text: string) => {
    if (!text.trim()) return;
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لجدولة الرسائل');
      return;
    }

    const msgId = 'sch_' + Math.random().toString(36).substring(2, 11);
    const payload: MessagePayload = { text: text.trim() };
    const newScheduled: ScheduledMessage = {
      id: msgId,
      chatId,
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      type: 'text',
      payload,
      sendAtMs,
      status: 'pending',
      createdAtMs: Date.now()
    };

    setScheduledMessages((prev) => [...prev, newScheduled]);
    try {
      await scheduleMessageInFirestore(newScheduled);
      showToast('تم جدولة الرسالة بنجاح');
    } catch (err) {
      console.error('Failed to schedule message in Firestore:', err);
      setScheduledMessages((prev) => prev.filter((m) => m.id !== msgId));
      showToast('تعذر حفظ الجدولة في السحابة');
    }
  };

  const handleCancelScheduledMessage = async (msgId: string) => {
    if (isCloudSynced) {
      try {
        await deleteScheduledMessageFromFirestore(msgId);
      } catch (err) {
        console.error('Failed to cancel scheduled message in Firestore:', err);
      }
    }
    setScheduledMessages((prev) => prev.filter((m) => m.id !== msgId));
    showToast('تم إلغاء جدولة الرسالة');
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

    const roomKeyHint =
      selectedChat.peerUid || selectedChat.peerPublicKeyJwk
        ? { peerUid: selectedChat.peerUid, peerPublicKeyJwk: selectedChat.peerPublicKeyJwk }
        : undefined;
    const key = await deriveRoomKeyFromSeed(selectedChat.roomSeed, roomKeyHint);
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
          isLastMessage,
          selectedChat.peerUid || selectedChat.peerPublicKeyJwk
            ? { peerUid: selectedChat.peerUid, peerPublicKeyJwk: selectedChat.peerPublicKeyJwk }
            : undefined
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

  const handleSetChatWallpaper = async (chatId: string, wallpaper: string) => {
    const normalized = normalizeChatWallpaper(wallpaper);
    const target = chats.find((c) => c.id === chatId);
    if (!target) return;

    const prevWallpaper = target.wallpaper || '';
    const nextChat: ChatRoom = {
      ...target,
      wallpaper: normalized
    };

    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, wallpaper: normalized } : c))
    );

    if (isCloudSynced && isRemoteFirebaseUid(currentUser.uid)) {
      try {
        await saveChatPrefToFirestore(currentUser.uid, chatId, {
          pinned: nextChat.pinned,
          archived: nextChat.archived,
          muted: nextChat.muted,
          favorite: nextChat.favorite,
          unreadCount: nextChat.unreadCount,
          disappearingSeconds: nextChat.disappearingSeconds,
          wallpaper: normalized,
          clearedAtMs: nextChat.clearedAtMs || 0
        });
        showToast(
          normalized
            ? 'تم حفظ خلفية المحادثة في Firestore بنجاح'
            : 'تمت استعادة الخلفية الافتراضية للمحادثة'
        );
      } catch {
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, wallpaper: prevWallpaper } : c))
        );
        showToast('تعذر حفظ خلفية المحادثة في السحابة');
      }
    } else {
      showToast(
        normalized
          ? 'تم تحديث خلفية المحادثة'
          : 'تمت استعادة الخلفية الافتراضية للمحادثة'
      );
    }
  };

  const handleClearChat = (chatId: string) => {
    const existingMsgs = messagesMap[chatId] || [];
    const maxExistingMsgMs = existingMsgs.reduce(
      (max, m) => (m.createdAtMs > max ? m.createdAtMs : max),
      0
    );
    const clearedAtMs = Math.max(Date.now(), maxExistingMsgMs);

    setMessagesMap((prev) => ({ ...prev, [chatId]: [] }));
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const nextChat: ChatRoom = {
          ...c,
          clearedAtMs,
          unreadCount: 0,
          lastMessageSenderId: '',
          lastMessagePreview: 'تم مسح الدردشة'
        };
        persistChatPrefsIfCloud(nextChat);
        return nextChat;
      })
    );
    showToast('تم مسح محتوى المحادثة');
  };

  const cleanupTransientStateForDeletedChats = (idsSet: Set<string>) => {
    for (const chatId of idsSet) {
      const msgs = messagesMap[chatId] || [];
      for (const m of msgs) {
        deliveredMsgAckedRef.current.delete(m.id);
        readMsgAckedRef.current.delete(m.id);
      }
    }
    if (highlightedJump && idsSet.has(highlightedJump.chatId)) {
      setHighlightedJump(null);
    }
    if (wallpaperPickerChatId && idsSet.has(wallpaperPickerChatId)) {
      setWallpaperPickerChatId(null);
    }
    if (selectedChatId && idsSet.has(selectedChatId)) {
      setSelectedChatId(null);
      setMobileChatOpen(false);
      setRightPanelMode('none');
      setInspectMessageId(null);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    const targetChat = chats.find((c) => c.id === chatId);
    const isCreator = targetChat?.createdBy === currentUser.uid;
    const idsSet = new Set([chatId]);

    setChats((prev) => prev.filter((c) => c.id !== chatId));
    setMessagesMap((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
    cleanupTransientStateForDeletedChats(idsSet);

    if (isCloudSynced && isRemoteFirebaseUid(currentUser.uid)) {
      await deleteChatInFirestore(chatId, currentUser.uid, isCreator);
    }

    showToast('تم حذف المحادثة بنجاح');
  };

  const handleDeleteMultipleChats = async (chatIds: string[]) => {
    if (chatIds.length === 0) return;
    const idsSet = new Set(chatIds);
    const targetsSnapshot = chats.filter((c) => idsSet.has(c.id));

    setChats((prev) => prev.filter((c) => !idsSet.has(c.id)));
    setMessagesMap((prev) => {
      const next = { ...prev };
      chatIds.forEach((id) => delete next[id]);
      return next;
    });
    cleanupTransientStateForDeletedChats(idsSet);

    if (isCloudSynced && isRemoteFirebaseUid(currentUser.uid)) {
      await Promise.all(
        chatIds.map((chatId) => {
          const targetChat = targetsSnapshot.find((c) => c.id === chatId);
          const isCreator = targetChat?.createdBy === currentUser.uid;
          return deleteChatInFirestore(chatId, currentUser.uid, isCreator);
        })
      );
    }

    showToast(`تم حذف ${chatIds.length} محادثة بنجاح`);
  };

  const handleStartCallForChat = async (chat: ChatRoom, callType: 'audio' | 'video') => {
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لإجراء المكالمات');
      return;
    }
    if (!chat.peerUid || !isRemoteFirebaseUid(chat.peerUid)) {
      showToast('المكالمات المباشرة متاحة فقط مع جهات اتصال مسجلة عبر Firebase');
      return;
    }
    if (isUidBlocked(blockedUidSet, chat.peerUid)) {
      showToast('لا يمكنك الاتصال بجهة اتصال محظورة. ألغِ الحظر من الإعدادات أولاً.');
      return;
    }

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
      calleeId: chat.peerUid,
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
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      const msg = 'يجب تسجيل الدخول عبر Firebase لبدء محادثة جديدة';
      showToast(msg);
      throw new Error(msg);
    }

    const existingByPeer = peerUid
      ? chats.find((c) => c.type === 'direct' && (c.peerUid === peerUid || c.memberIds.includes(peerUid)))
      : undefined;
    if (existingByPeer) {
      setSearchQuery('');
      setShowArchived(false);
      setChatFilter('all');
      setSelectedChatId(existingByPeer.id);
      setMobileChatOpen(true);
      setActiveTab('chats');
      return;
    }

    if (!peerUid || !isRemoteFirebaseUid(peerUid)) {
      const msg = 'يجب البحث عن مستخدم مسجّل عبر معرّف تواصل (Wasil ID) لبدء محادثة';
      showToast(msg);
      throw new Error(msg);
    }
    if (isUidBlocked(blockedUidSet, peerUid)) {
      const msg = 'هذه الجهة محظورة حالياً — قم بإلغاء الحظر من الإعدادات أولاً';
      showToast(msg);
      throw new Error(msg);
    }

    const deterministicId = buildDirectChatId(currentUser.uid, peerUid);
    let peerProfile: UserProfile | null = null;
    try {
      peerProfile = await fetchPublicProfileByUid(peerUid);
    } catch {
      peerProfile = null;
    }
    const invited = peerProfile ? [peerProfile] : [];
    const resolvedTitle = peerProfile?.displayName || name;
    await createChatInFirestore(
      deterministicId,
      'direct',
      resolvedTitle,
      peerProfile?.about || 'محادثة مشفرة بين الطرفين P2P',
      peerProfile?.avatarUrl || '',
      currentUser,
      `تم بدء قناة مراسلة مشفرة مع ${resolvedTitle} 🔒`,
      invited
    );
    setSearchQuery('');
    setShowArchived(false);
    setChatFilter('all');
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
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      const msg = 'يجب تسجيل الدخول عبر Firebase لإنشاء مجموعة أو قناة جديدة';
      showToast(msg);
      throw new Error(msg);
    }

    const chatId = `${roomType === 'community' ? 'comm' : 'group'}_${Date.now()}`;
    const inviteCode = buildChannelInviteCode(chatId);
    const knownMap = new Map(contactsList.map((c) => [c.uid, c]));
    const missingUids = memberUids.filter((id) => !knownMap.has(id) && isRemoteFirebaseUid(id));
    if (missingUids.length > 0) {
      const fetched = await Promise.all(
        missingUids.map((uidToFetch) => fetchPublicProfileByUid(uidToFetch).catch(() => null))
      );
      fetched.forEach((p) => {
        if (p) knownMap.set(p.uid, p);
      });
    }
    const invitedContacts = memberUids
      .map((id) => knownMap.get(id))
      .filter((c): c is UserProfile => Boolean(c));
    const welcomeText =
      roomType === 'community'
        ? `تم إنشاء قناة "${title}" ${adminOnlyPost ? '(بث المشرفين فقط)' : ''} بتشفير تام 🔒`
        : `تم إنشاء المجموعة "${title}" بتشفير تام بين الأعضاء 🔒`;

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
  };

  const handleJoinSuggestedChannel = async (channel: SuggestedChannelItem) => {
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لمتابعة القنوات');
      return;
    }

    const existing = chats.find((c) => c.id === channel.id);
    if (existing) {
      setSelectedChatId(existing.id);
      setMobileChatOpen(true);
      setActiveTab('chats');
      return;
    }

    const inviteCode = buildChannelInviteCode(channel.id);
    const welcomeText = `مرحباً بك في ${channel.title} · ${channel.description}`;

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
  };

  const handleUpdateGroupSettings = async (
    chatId: string,
    title: string,
    description: string,
    avatarUrl: string,
    adminOnlyPost?: boolean
  ) => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid)) return;
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
    await updateGroupSettingsInFirestore(chatId, title, description, avatarUrl, adminOnlyPost);
  };

  const handleInviteMemberToGroup = async (chatId: string, contact: UserProfile) => {
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لدعوة أعضاء');
      return;
    }
    const target = chats.find((c) => c.id === chatId);
    if (!target || target.memberIds.includes(contact.uid)) return;
    const nextMembers = Array.from(new Set([...target.memberIds, contact.uid])).slice(0, 50);

    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, memberIds: nextMembers } : c))
    );

    await inviteMemberToGroupInFirestore(chatId, contact, nextMembers);
    await sendEncryptedMessageToFirestore(
      chatId,
      target.roomSeed,
      currentUser,
      'text',
      { text: `تمت دعوة ${contact.displayName} إلى المجموعة بتشفير تام 🔐` },
      nextMembers
    );
  };

  const handleRemoveMemberFromGroup = async (chatId: string, memberUid: string) => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid)) return;
    const target = chats.find((c) => c.id === chatId);
    if (!target || memberUid === currentUser.uid) return;
    const nextMembers = target.memberIds.filter((id) => id !== memberUid);
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, memberIds: nextMembers } : c))
    );
    await removeMemberFromGroupInFirestore(chatId, memberUid, nextMembers);
  };

  const handlePublishStatus = async (payload: PublishStatusPayload) => {
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      const errMsg = 'يجب تسجيل الدخول عبر Firebase لنشر القصص والحالات';
      showToast(errMsg);
      throw new Error(errMsg);
    }
    const created = await publishStatusToFirestore(currentUser, payload);
    setStatuses((prev) =>
      filterActiveStatuses([created, ...prev.filter((s) => s.id !== created.id)])
    );
    showToast('تم نشر القصة بنجاح (تختفي بعد ٢٤ ساعة)');
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
    if (!isCloudSynced || !auth.currentUser || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase للرد على الحالة');
      return;
    }

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

    if (!isRemoteFirebaseUid(authorId)) {
      showToast('تعذر فتح محادثة مع صاحب هذه الحالة');
      return;
    }

    await handleCreateDirectChat(authorName, authorId);
    const directId = buildDirectChatId(currentUser.uid, authorId);
    const knownPeer =
      contactsList.find((c) => c.uid === authorId) ||
      (await fetchPublicProfileByUid(authorId).catch(() => null));
    const targetRoom: ChatRoom = {
      id: directId,
      type: 'direct',
      title: knownPeer?.displayName || authorName,
      description: 'محادثة مشفرة',
      avatarUrl: knownPeer?.avatarUrl || '',
      peerUid: authorId,
      ...(knownPeer?.publicKeyJwk ? { peerPublicKeyJwk: knownPeer.publicKeyJwk } : {}),
      isOnline: Boolean(knownPeer?.isOnline),
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
      lastMessageStatus: 'sent',
      lastMessageAtMs: Date.now(),
      roomSeed: directId
    };
    showToast(`تم فتح المحادثة مع ${knownPeer?.displayName || authorName}`);
    void sendMessageToTargetChat(targetRoom, 'text', {
      text: replyText,
      replyToSender: authorName,
      replyToText: statusPreview
    });
  };

  const handleSaveProfile = async (displayName: string, about: string, avatarUrl: string) => {
    const updated = { ...currentUser, displayName, about, avatarUrl };
    setCurrentUser(updated);
    if (isCloudSynced && isRemoteFirebaseUid(currentUser.uid)) {
      await updateProfileInFirestore(currentUser.uid, updated, { displayName, about, avatarUrl });
    }
  };

  const handleUpdateWasilId = async (newWasilId: string) => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('يجب تسجيل الدخول عبر Firebase لتحديث المعرّف الخاص');
      return;
    }
    const claimed = await claimCustomWasilId(
      currentUser.uid,
      currentUser.displayName,
      newWasilId,
      currentUser.wasilId
    );
    setCurrentUser((prev) => ({ ...prev, wasilId: claimed }));
    showToast(`تم حجز وتحديث معرّفك الخاص (${claimed}) بنجاح`);
  };

  const handleBackupUserData = async () => {
    const backupPayload = {
      version: 1,
      exportedAtMs: Date.now(),
      profile: currentUser,
      privacySettings,
      omarSettings,
      chats,
      messages: messagesMap,
      statuses,
      calls
    };
    if (isCloudSynced && isRemoteFirebaseUid(currentUser.uid)) {
      await backupUserDataToFirestore(currentUser.uid, backupPayload);
      showToast('تم حفظ النسخة الاحتياطية في السحابة بنجاح');
    } else {
      showToast('قم بتسجيل الدخول أولاً لحفظ النسخة الاحتياطية في السحابة');
    }
  };

  const handleRestoreUserData = async () => {
    if (!isCloudSynced || !isRemoteFirebaseUid(currentUser.uid)) {
      showToast('قم بتسجيل الدخول أولاً للاستعادة من السحابة');
      return;
    }
    const restored = await restoreUserDataFromFirestore(currentUser.uid);
    if (!restored) {
      showToast('لا توجد نسخة احتياطية محفوظة في السحابة لهذا الحساب');
      return;
    }
    if (restored.omarSettings) {
      setOmarSettings((prev) => ({ ...prev, ...restored.omarSettings }));
    }
    if (restored.privacySettings) {
      setPrivacySettings((prev) => ({ ...prev, ...restored.privacySettings }));
    }
    if (restored.profile) {
      setCurrentUser((prev) => ({ ...prev, ...restored.profile }));
    }
    if (Array.isArray(restored.chats)) {
      setChats(restored.chats);
      if (restored.chats.length > 0) setSelectedChatId(restored.chats[0].id);
    }
    if (restored.messages && typeof restored.messages === 'object') {
      setMessagesMap(restored.messages);
    }
    if (Array.isArray(restored.statuses)) {
      setStatuses(filterActiveStatuses(restored.statuses));
    }
    if (Array.isArray(restored.calls)) {
      setCalls(restored.calls);
    }
    showToast('تمت استعادة بياناتك من النسخة الاحتياطية السحابية بنجاح');
  };

  const handleGoogleDriveBackup = async () => {
    try {
      let accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          accessToken = credential.accessToken;
          localStorage.setItem('google_access_token', accessToken);
        } else {
          throw new Error('تعذر الحصول على صلاحيات Google Drive.');
        }
      }
      const backupPayload = {
        version: 1,
        exportedAtMs: Date.now(),
        profile: currentUser,
        privacySettings,
        omarSettings,
        chats,
        messages: messagesMap,
        statuses,
        calls
      };
      await uploadBackupToGoogleDrive(backupPayload, accessToken);
      showToast('تم رفع النسخة الاحتياطية المشفرة بـ AES إلى Google Drive بنجاح');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل النسخ الاحتياطي إلى Google Drive');
    }
  };

  const handleGoogleDriveRestore = async () => {
    try {
      let accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          accessToken = credential.accessToken;
          localStorage.setItem('google_access_token', accessToken);
        } else {
          throw new Error('تعذر الحصول على صلاحيات Google Drive.');
        }
      }
      const restored = (await restoreBackupFromGoogleDrive(accessToken)) as any;
      if (!restored) {
        showToast('لم يتم العثور على نسخة احتياطية في Google Drive');
        return;
      }
      if (restored.omarSettings) {
        setOmarSettings((prev) => ({ ...prev, ...restored.omarSettings }));
      }
      if (restored.privacySettings) {
        setPrivacySettings((prev) => ({ ...prev, ...restored.privacySettings }));
      }
      if (restored.profile) {
        setCurrentUser((prev) => ({ ...prev, ...restored.profile }));
      }
      if (Array.isArray(restored.chats)) {
        setChats(restored.chats);
        if (restored.chats.length > 0) setSelectedChatId(restored.chats[0].id);
      }
      if (restored.messages && typeof restored.messages === 'object') {
        setMessagesMap(restored.messages);
      }
      if (Array.isArray(restored.statuses)) {
        setStatuses(filterActiveStatuses(restored.statuses));
      }
      if (Array.isArray(restored.calls)) {
        setCalls(restored.calls);
      }
      showToast('تمت استعادة النسخة الاحتياطية المشفرة من Google Drive بنجاح');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل الاستعادة من Google Drive');
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
            {autoLockedNotice && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-2xl bg-amber-500/12 border border-amber-500/30 px-3 py-2.5 text-right text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed"
              >
                <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{autoLockedNotice}</span>
              </div>
            )}
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
                lastActivityMsRef.current = Date.now();
                setAutoLockedNotice(null);
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
            {autoLockedNotice && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-2xl bg-amber-500/12 border border-amber-500/30 px-3 py-2.5 text-right text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed"
              >
                <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{autoLockedNotice}</span>
              </div>
            )}
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
                onOpenNewChat={(prefillQuery) => {
                  setNewChatInitialQuery(typeof prefillQuery === 'string' ? prefillQuery : '');
                  setNewChatModalMode('direct');
                }}
                onOpenNewGroup={() => {
                  setNewChatInitialQuery('');
                  setNewChatModalMode('group');
                }}
                onOpenNewChannel={() => {
                  setNewChatInitialQuery('');
                  setNewChatModalMode('community');
                }}
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
                allChats={displayChats}
                messagesMap={messagesMap}
                unlockedChatIds={unlockedSessionChatIds}
                onJumpToMessage={handleJumpToMessage}
                onLockAppNow={handleLockAppNow}
                onSignOut={handleRequestSignOut}
                onOpenScheduledMessages={() => setShowScheduledListModal(true)}
                scheduledCount={scheduledMessages.filter((m) => m.status === 'pending').length}
                onDeleteChat={handleDeleteChat}
                onDeleteMultipleChats={handleDeleteMultipleChats}
              />
            </div>

            <div
              className={`${
                mobileChatOpen ? 'flex' : 'hidden md:flex'
              } flex-1 min-w-0 h-full`}
            >
              <ChatWindow
                chat={selectedChat}
                chats={displayChats}
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
                onDeleteChat={handleDeleteChat}
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
                onScheduleMessage={handleScheduleMessage}
                onOpenScheduledMessages={() => setShowScheduledListModal(true)}
                onChangePreferredLanguage={(lang) =>
                  handleUpdateOmarSettings({ preferredLanguage: lang })
                }
                onOpenWallpaperPicker={() => {
                  if (selectedChat) setWallpaperPickerChatId(selectedChat.id);
                }}
                isPeerBlocked={selectedChatPeerBlocked}
                onBlockPeer={
                  selectedChat && selectedChat.type === 'direct'
                    ? () => handleToggleBlockForChat(selectedChat)
                    : undefined
                }
                onUnblockPeer={
                  selectedChat && selectedChat.type === 'direct'
                    ? () => handleToggleBlockForChat(selectedChat)
                    : undefined
                }
                contacts={contactsList}
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
                globalWallpaper={omarSettings.wallpaper}
                onOpenWallpaperPicker={(id) => setWallpaperPickerChatId(id)}
                onResetChatWallpaper={(id) => void handleSetChatWallpaper(id, '')}
                isPeerBlocked={selectedChatPeerBlocked}
                onToggleBlockPeer={
                  selectedChat && selectedChat.type === 'direct'
                    ? () => handleToggleBlockForChat(selectedChat)
                    : undefined
                }
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
            chats={displayChats.filter(
              (c) => getDirectChatBlockedPeerUid(c, currentUser.uid, blockedUidSet) === null
            )}
            onStartCall={(chat, type) => void handleStartCallForChat(chat, type)}
          />
        )}

        {activeTab === 'starred' && (
          <StarredView
            messagesMap={messagesMap}
            chats={displayChats}
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
            chats={displayChats}
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
            linkedDevices={linkedDevices}
            currentDeviceId={localDeviceMeta.deviceId}
            onRevokeDevice={handleRevokeOtherDevice}
            omarSettings={omarSettings}
            onUpdateOmarSettings={handleUpdateOmarSettings}
            onLockAppNow={handleLockAppNow}
            onShowToast={showToast}
            onToggleTheme={handleToggleTheme}
            onSaveProfile={handleSaveProfile}
            onUpdateWasilId={handleUpdateWasilId}
            onUpdatePrivacy={handleUpdatePrivacy}
            onSignOut={handleRequestSignOut}
            isSigningOut={isSigningOut}
            onGoogleSignIn={handleGoogleSignIn}
            onOpenOmarAddons={() => setActiveTab('omar')}
            onBackupData={handleBackupUserData}
            onRestoreData={handleRestoreUserData}
            onGoogleDriveBackup={handleGoogleDriveBackup}
            onGoogleDriveRestore={handleGoogleDriveRestore}
            contacts={contactsList}
            blockedContacts={blockedContacts}
            onBlockContact={handleBlockContact}
            onUnblockContact={handleUnblockContact}
            onLookupUser={lookupUserByWasilIdOrUid}
            onImportGoogleContacts={handleImportGoogleContacts}
            chats={chats}
            messagesMap={messagesMap}
            onClearOldMedia={handleClearOldMedia}
            onClearChatMessages={handleClearChatMessages}
          />
        )}
      </div>

      {/* New Chat / Group Modal */}
      <NewChatModal
        mode={newChatModalMode}
        initialDirectQuery={newChatInitialQuery}
        myUid={currentUser.uid}
        currentUser={currentUser}
        isCloudSynced={isCloudSynced}
        contacts={contactsList}
        onClose={() => {
          setNewChatModalMode(null);
          setNewChatInitialQuery('');
        }}
        onCreateDirectChat={handleCreateDirectChat}
        onCreateGroupChat={handleCreateGroupChat}
        onLookupPeerByUid={lookupUserByWasilIdOrUid}
        onImportGoogleContacts={handleImportGoogleContacts}
      />

      {/* Smart Google Contacts Picker Modal */}
      <GoogleContactsPickerModal
        isOpen={showGoogleContactsPicker}
        rawContacts={rawGoogleContacts}
        onClose={() => setShowGoogleContactsPicker(false)}
        onConfirmImport={handleConfirmImportGoogleContacts}
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
                {currentUser.displayName} ({currentUser.email || currentUser.phone || currentUser.wasilId || 'حساب تواصل'})
              </p>
              <p className="text-[11px] text-[#667781] dark:text-[#8696A0] mt-1">
                {isCloudSynced
                  ? 'المزامنة السحابية مفعّلة: ستبقى محادثاتك ورسائلك محفوظة في Firebase عند العودة.'
                  : 'سيتم إغلاق الجلسة الحالية والعودة إلى شاشة تسجيل الدخول.'}
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

      {/* Scheduled Messages Management Modal */}
      {showScheduledListModal && (
        <ScheduledMessagesModal
          scheduledMessages={scheduledMessages.filter((m) => m.status === 'pending')}
          chats={chats}
          onCancelSchedule={handleCancelScheduledMessage}
          onClose={() => setShowScheduledListModal(false)}
        />
      )}

      {/* Per-Chat Wallpaper Customization Modal */}
      {wallpaperPickerChatId && (() => {
        const wallpaperTarget = chats.find((c) => c.id === wallpaperPickerChatId);
        if (!wallpaperTarget) return null;
        return (
          <ChatWallpaperModal
            chat={wallpaperTarget}
            omarSettings={omarSettings}
            onClose={() => setWallpaperPickerChatId(null)}
            onSaveWallpaper={handleSetChatWallpaper}
          />
        );
      })()}

      {/* Active WebRTC Call Modal */}
      {activeCall && (
        <CallOverlay
          activeCall={activeCall}
          myUid={currentUser.uid}
          isCloudSynced={isCloudSynced}
          onCallAccepted={(callId) =>
            setActiveCall((curr) =>
              curr && curr.id === callId ? { ...curr, status: 'connected' } : curr
            )
          }
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
