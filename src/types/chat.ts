export type ThemeMode = 'light' | 'dark';
export type OmarThemeId = 'emerald' | 'burgundy' | 'blue' | 'gold' | 'pink';
export type ChatWallpaperId = 'pattern' | 'mint' | 'slate' | 'sand' | 'velvet';
export type BubbleStyleId = 'classic' | 'modern' | 'rounded';
export type FontSizePref = 'sm' | 'md' | 'lg';

export type NavTab =
  | 'chats'
  | 'status'
  | 'communities'
  | 'calls'
  | 'starred'
  | 'archived'
  | 'omar'
  | 'settings';
export type ChatFilter = 'all' | 'unread' | 'favorites' | 'groups' | 'locked';
export type RightPanelMode = 'none' | 'info' | 'search' | 'encryption';
export type MessageType = 'text' | 'image' | 'voice' | 'file' | 'poll' | 'system';
export type VisibilityScope = 'everyone' | 'contacts' | 'nobody';
export type CallQualityPreset = 'ultra' | 'balanced' | 'saver';

export interface OmarSettings {
  omarTheme: OmarThemeId;
  wallpaper: ChatWallpaperId;
  bubbleStyle: BubbleStyleId;
  fontSize: FontSizePref;
  freezeLastSeen: boolean;
  hideViewStatus: boolean;
  antiDeleteMessages: boolean;
  antiDeleteStatuses: boolean;
  hideReadTicks: boolean;
  hideTypingIndicator: boolean;
  autoReplyEnabled: boolean;
  autoReplyMessage: string;
  quickTemplates: string[];
  lockedChatIds: string[];
  chatLockPin: string;
  appLockOnLaunch?: boolean;
  autoLockTimeoutMinutes?: number;
  lockMethod?: 'pin' | 'biometric';
  biometricCredentialId?: string;
  biometricEnrolledAtMs?: number;
  biometricDeviceLabel?: string;
  dndMode: boolean;
  showStoriesTray: boolean;
  preferredLanguage?: string;
}

export interface PrivacySettings {
  readReceipts: boolean;
  lastSeenMode: VisibilityScope;
  profilePhotoVisibility: VisibilityScope;
  bioVisibility: VisibilityScope;
}

export interface UserProfile {
  uid: string;
  wasilId?: string;
  displayName: string;
  about: string;
  avatarUrl: string;
  email?: string;
  phone?: string;
  publicKeyJwk: string;
  safetyCode: string;
  isOnline: boolean;
  lastSeenMs: number;
}

export interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface MessagePayload {
  text: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  fileDataUrl?: string;
  fileName?: string;
  fileSizeLabel?: string;
  voiceDurationSec?: number;
  voiceWaveform?: number[];
  pollQuestion?: string;
  pollOptions?: PollOption[];
  replyToText?: string;
  replyToSender?: string;
  stickerId?: string;
  stickerLabel?: string;
  stickerCategory?: string;
  stickerKind?: 'static' | 'lottie';
  lottieId?: string;
  lottieData?: Record<string, unknown>;
  decryptionFailed?: boolean;
  forwarded?: boolean;
  edited?: boolean;
}

export interface DecryptedMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  payload: MessagePayload;
  ciphertext: string;
  iv: string;
  algorithm: 'AES-GCM-256';
  replyToId?: string;
  deliveredToIds?: string[];
  readByIds?: string[];
  pollVotes?: Record<string, string>;
  reactions: Record<string, string[]>; // emoji -> array of uids
  reactionsCount: number;
  starredBy: string[];
  isDeleted: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAtMs: number;
}

export interface ChatRoom {
  id: string;
  type: 'direct' | 'group' | 'community';
  title: string;
  description: string;
  avatarUrl: string;
  peerUid?: string;
  peerAbout?: string;
  peerPublicKeyJwk?: string;
  isOnline?: boolean;
  isTyping?: boolean;
  typingMemberNames?: string[];
  memberIds: string[];
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  favorite: boolean;
  unreadCount: number;
  disappearingSeconds: number;
  wallpaper?: string;
  clearedAtMs?: number;
  adminOnlyPost?: boolean;
  inviteCode?: string;
  lastMessagePreview: string;
  lastMessageType: MessageType;
  lastMessageSenderId: string;
  lastMessageStatus: 'sent' | 'delivered' | 'read';
  lastMessageDeliveredToIds?: string[];
  lastMessageReadByIds?: string[];
  lastMessageAtMs: number;
  roomSeed: string;
  createdBy?: string;
}

export interface StatusItem {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  type: 'text' | 'image' | 'video';
  content: string;
  backgroundColor: string;
  fontStyle?: 'display' | 'sans' | 'mono';
  mediaUrl?: string;
  posterUrl?: string;
  durationSec?: number;
  pinned?: boolean;
  viewerIds: string[];
  viewedByIds: string[];
  viewCount: number;
  viewedByMe: boolean;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'declined' | 'missed';
  direction: 'outgoing' | 'incoming';
  durationSeconds: number;
  encryptionFingerprint: string;
  offerSdp?: string;
  answerSdp?: string;
  createdAtMs: number;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  payload: MessagePayload;
  sendAtMs: number;
  status: 'pending' | 'sent' | 'cancelled';
  createdAtMs: number;
}

export interface DeviceSession {
  deviceId: string;
  uid: string;
  deviceName: string;
  platform: string;
  isOnline: boolean;
  lastActiveAtMs: number;
  createdAtMs: number;
}

export interface BlockedContact {
  uid: string;
  blockedUid: string;
  displayName: string;
  wasilId: string;
  avatarUrl: string;
  createdAtMs: number;
  updatedAtMs: number;
}

