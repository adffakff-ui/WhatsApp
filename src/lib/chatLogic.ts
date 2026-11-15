import type {
  ChatFilter,
  ChatRoom,
  DecryptedMessage,
  PollOption,
  StatusItem,
  UserProfile
} from '../types/chat';

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_STATUS_MEDIA_BYTES = 262144;

export function filterAndSortChats(
  chats: ChatRoom[],
  filter: ChatFilter,
  searchQuery: string,
  showArchived: boolean
): ChatRoom[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return chats
    .filter((chat) => {
      if (showArchived ? !chat.archived : chat.archived) return false;
      if (filter === 'unread' && chat.unreadCount === 0) return false;
      if (filter === 'favorites' && !chat.favorite) return false;
      if (filter === 'groups' && chat.type === 'direct') return false;

      if (normalizedQuery) {
        const matchesTitle = chat.title.toLowerCase().includes(normalizedQuery);
        const matchesPreview = chat.lastMessagePreview.toLowerCase().includes(normalizedQuery);
        if (!matchesTitle && !matchesPreview) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastMessageAtMs - a.lastMessageAtMs;
    });
}

export function formatWhatsAppTime(timestampMs: number, nowMs = Date.now()): string {
  const date = new Date(timestampMs);
  const now = new Date(nowMs);

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return 'أمس';
  }

  return date.toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'numeric',
    year: '2-digit'
  });
}

export function formatCallDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function applyPollVote(
  options: PollOption[],
  optionId: string,
  voterId: string
): PollOption[] {
  return options.map((opt) => {
    const hasVoted = opt.voterIds.includes(voterId);
    if (opt.id === optionId) {
      return {
        ...opt,
        voterIds: hasVoted
          ? opt.voterIds.filter((id) => id !== voterId)
          : [...opt.voterIds, voterId]
      };
    }
    return {
      ...opt,
      voterIds: opt.voterIds.filter((id) => id !== voterId)
    };
  });
}

export function validateProfileInput(displayName: string, about: string): {
  valid: boolean;
  error?: string;
} {
  const cleanName = displayName.trim();
  const cleanAbout = about.trim();
  if (cleanName.length < 1 || cleanName.length > 80) {
    return { valid: false, error: 'يجب أن يتراوح الاسم بين ١ و ٨٠ حرفاً.' };
  }
  if (cleanAbout.length > 200) {
    return { valid: false, error: 'يجب ألا تتجاوز النبذة التعريفية ٢٠٠ حرف.' };
  }
  return { valid: true };
}

export function validateAvatarUrl(avatarUrl: string): boolean {
  return avatarUrl.length <= 65536;
}

export function getVisibilityLabel(scope: 'everyone' | 'contacts' | 'nobody'): string {
  if (scope === 'everyone') return 'الجميع';
  if (scope === 'contacts') return 'جهات الاتصال فقط';
  return 'لا أحد';
}

export function formatDisappearingLabel(seconds: number): string {
  if (seconds <= 0) return 'إيقاف';
  if (seconds === 86400) return '24 ساعة';
  if (seconds === 604800) return '7 أيام';
  if (seconds === 7776000) return '90 يوماً';
  return `${Math.round(seconds / 3600)} ساعة`;
}

export function isStatusExpired(
  status: Pick<StatusItem, 'createdAtMs' | 'expiresAtMs'>,
  nowMs = Date.now()
): boolean {
  const effectiveExpiry =
    typeof status.expiresAtMs === 'number' && status.expiresAtMs > 0
      ? status.expiresAtMs
      : status.createdAtMs + STATUS_TTL_MS;
  return nowMs >= effectiveExpiry;
}

export function filterActiveStatuses(
  statuses: StatusItem[],
  nowMs = Date.now()
): StatusItem[] {
  return statuses
    .filter((st) => !isStatusExpired(st, nowMs))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function formatRemainingStatusTime(
  expiresAtMs: number,
  nowMs = Date.now()
): string {
  const diffMs = Math.max(0, expiresAtMs - nowMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 1) return 'ينتهي قريباً';
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 1) {
    return `يتبقى ${hours} ساعة`;
  }
  return `يتبقى ${totalMinutes} دقيقة`;
}

export function extractContactsFromChats(
  chats: ChatRoom[],
  knownContacts: UserProfile[],
  myUid: string
): UserProfile[] {
  const contactMap = new Map<string, UserProfile>();
  for (const c of knownContacts) {
    if (c.uid && c.uid !== myUid) {
      contactMap.set(c.uid, c);
    }
  }
  for (const chat of chats) {
    if (chat.type === 'direct' && chat.peerUid && chat.peerUid !== myUid && !contactMap.has(chat.peerUid)) {
      contactMap.set(chat.peerUid, {
        uid: chat.peerUid,
        displayName: chat.title,
        about: chat.peerAbout || chat.description || '',
        avatarUrl: chat.avatarUrl,
        publicKeyJwk: chat.peerPublicKeyJwk || '',
        safetyCode: '',
        isOnline: Boolean(chat.isOnline),
        lastSeenMs: chat.lastMessageAtMs
      });
    }
  }
  return Array.from(contactMap.values());
}

export function resolveStatusViewerIds(
  myUid: string,
  allContactUids: string[],
  selectedContactUids?: string[]
): string[] {
  const targets = selectedContactUids && selectedContactUids.length > 0
    ? selectedContactUids
    : allContactUids;
  return Array.from(new Set([myUid, ...targets.filter((id) => Boolean(id))])).slice(0, 50);
}

export interface SharedMediaItem {
  id: string;
  mediaUrl: string;
  caption: string;
  senderName: string;
  createdAtMs: number;
}

export interface SharedLinkItem {
  id: string;
  messageId: string;
  url: string;
  hostname: string;
  textSnippet: string;
  senderName: string;
  createdAtMs: number;
}

export interface SharedDocItem {
  id: string;
  fileName: string;
  fileSizeLabel: string;
  senderName: string;
  createdAtMs: number;
}

export interface ChatSharedAssets {
  media: SharedMediaItem[];
  links: SharedLinkItem[];
  docs: SharedDocItem[];
  totalCount: number;
}

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/gi;

export function extractChatSharedAssets(messages: DecryptedMessage[]): ChatSharedAssets {
  const media: SharedMediaItem[] = [];
  const links: SharedLinkItem[] = [];
  const docs: SharedDocItem[] = [];

  const activeMessages = [...messages]
    .filter((msg) => !msg.isDeleted)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  for (const msg of activeMessages) {
    if (msg.type === 'image' && msg.payload.mediaUrl) {
      media.push({
        id: msg.id,
        mediaUrl: msg.payload.mediaUrl,
        caption: msg.payload.text || '',
        senderName: msg.senderName,
        createdAtMs: msg.createdAtMs
      });
    }

    if (msg.type === 'file') {
      docs.push({
        id: msg.id,
        fileName: msg.payload.fileName || msg.payload.text || 'مستند مشترك',
        fileSizeLabel: msg.payload.fileSizeLabel || 'ملف مشفر',
        senderName: msg.senderName,
        createdAtMs: msg.createdAtMs
      });
    }

    const text = msg.payload.text || '';
    if (text) {
      const matches = text.match(URL_REGEX) || [];
      matches.forEach((rawUrl, idx) => {
        const cleanUrl = rawUrl.replace(/[.,!?;:)'"\]،؛؟]+$/, '');
        try {
          const parsed = new URL(cleanUrl);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            links.push({
              id: `${msg.id}_link_${idx}`,
              messageId: msg.id,
              url: cleanUrl,
              hostname: parsed.hostname.replace(/^www\./, ''),
              textSnippet: text,
              senderName: msg.senderName,
              createdAtMs: msg.createdAtMs
            });
          }
        } catch {
          // Ignore malformed URLs
        }
      });
    }
  }

  return {
    media,
    links,
    docs,
    totalCount: media.length + links.length + docs.length
  };
}
