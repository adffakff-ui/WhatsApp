export type ThemeMode = 'light' | 'dark';
export type NavTab = 'chats' | 'status' | 'communities' | 'calls' | 'starred' | 'archived' | 'settings';
export type ChatFilter = 'all' | 'unread' | 'favorites' | 'groups';
export type RightPanelMode = 'none' | 'info' | 'search' | 'encryption';
export type MessageType = 'text' | 'image' | 'voice' | 'file' | 'poll' | 'system';
export type VisibilityScope = 'everyone' | 'contacts' | 'nobody';

export interface PrivacySettings {
  readReceipts: boolean;
  lastSeenMode: VisibilityScope;
  profilePhotoVisibility: VisibilityScope;
  bioVisibility: VisibilityScope;
}

export interface UserProfile {
  uid: string;
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
  fileName?: string;
  fileSizeLabel?: string;
  voiceDurationSec?: number;
  voiceWaveform?: number[];
  pollQuestion?: string;
  pollOptions?: PollOption[];
  replyToText?: string;
  replyToSender?: string;
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
  reactions: Record<string, string[]>; // emoji -> array of uids
  reactionsCount: number;
  starredBy: string[];
  isDeleted: boolean;
  status: 'sent' | 'delivered' | 'read';
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
  memberIds: string[];
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  favorite: boolean;
  unreadCount: number;
  disappearingSeconds: number;
  lastMessagePreview: string;
  lastMessageType: MessageType;
  lastMessageSenderId: string;
  lastMessageStatus: 'sent' | 'delivered' | 'read';
  lastMessageAtMs: number;
  roomSeed: string;
}

export interface StatusItem {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  type: 'text' | 'image';
  content: string;
  backgroundColor: string;
  fontStyle?: 'display' | 'sans' | 'mono';
  mediaUrl?: string;
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
