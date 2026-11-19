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
export const MAX_STATUS_VIDEO_SECONDS = 180; // 3 minutes max video clip duration

export function validateStatusVideoDuration(durationSeconds: number): {
  valid: boolean;
  clampedSeconds: number;
  error?: string;
} {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return {
      valid: false,
      clampedSeconds: 0,
      error: 'تعذر قراءة مدة مقطع الفيديو المختار.'
    };
  }
  const rounded = Math.ceil(durationSeconds);
  if (rounded > MAX_STATUS_VIDEO_SECONDS) {
    return {
      valid: false,
      clampedSeconds: MAX_STATUS_VIDEO_SECONDS,
      error: `الحد الأقصى لحالة الفيديو هو 3 دقائق (180 ثانية). مدة المقطع المختار: ${formatMediaSeconds(rounded)}.`
    };
  }
  return {
    valid: true,
    clampedSeconds: Math.max(1, Math.min(MAX_STATUS_VIDEO_SECONDS, rounded))
  };
}

export function formatMediaSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function buildChannelInviteCode(roomId: string): string {
  const clean = roomId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `WSL-${clean.slice(-8) || 'CHAN2026'}`;
}

export function filterAndSortChats(
  chats: ChatRoom[],
  filter: ChatFilter,
  searchQuery: string,
  showArchived: boolean,
  lockedChatIds: string[] = []
): ChatRoom[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return chats
    .filter((chat) => {
      if (showArchived ? !chat.archived : chat.archived) return false;
      const isLocked = lockedChatIds.includes(chat.id);
      if (filter === 'locked') {
        if (!isLocked) return false;
      } else if (isLocked && !normalizedQuery) {
        // Locked chats stay neatly tucked in the Locked tab unless searched
        return false;
      }
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
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return b.createdAtMs - a.createdAtMs;
    });
}

export function sortStatusesWithPinned(
  statuses: StatusItem[],
  pinnedIds: string[],
  nowMs = Date.now()
): StatusItem[] {
  const pinnedSet = new Set(pinnedIds);
  return statuses
    .filter((st) => !isStatusExpired(st, nowMs))
    .map((st) => ({
      ...st,
      pinned: Boolean(st.pinned) || pinnedSet.has(st.id)
    }))
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return b.createdAtMs - a.createdAtMs;
    });
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

/**
 * Generates a deterministic Firestore-safe direct P2P chat document ID
 * matching firestore.rules `isValidId` (^[a-zA-Z0-9_\-]+$, max 128 chars).
 */
export function buildDirectChatId(uidA: string, uidB: string): string {
  const safeA = uidA.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 56) || 'u1';
  const safeB = uidB.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 56) || 'u2';
  const sorted = [safeA, safeB].sort();
  return `direct_${sorted[0]}_${sorted[1]}`.slice(0, 128);
}

export function isRemoteFirebaseUid(uid?: string | null): boolean {
  if (!uid || uid === 'local_user') return false;
  return (
    !uid.startsWith('demo_') &&
    !uid.startsWith('contact_') &&
    !uid.startsWith('peer_') &&
    !uid.startsWith('gcontact_')
  );
}

/**
 * Resolves message tick status from Firestore receipt arrays:
 * - 'read' (2 blue ticks) if at least one peer other than senderId has read it.
 * - 'delivered' (2 gray ticks) if at least one peer has received it on their device.
 * - 'sent' (1 gray tick) if stored on server but not yet received by any peer.
 */
export function resolveMessageReceiptStatus(
  senderId: string,
  deliveredToIds?: string[],
  readByIds?: string[],
  fallbackStatus: 'sent' | 'delivered' | 'read' = 'sent'
): 'sent' | 'delivered' | 'read' {
  const hasReceiptTracking = Array.isArray(deliveredToIds) || Array.isArray(readByIds);
  if (!hasReceiptTracking) {
    return fallbackStatus;
  }
  const hasPeerRead = Array.isArray(readByIds) && readByIds.some((id) => Boolean(id) && id !== senderId);
  if (hasPeerRead) return 'read';

  const hasPeerDelivered =
    Array.isArray(deliveredToIds) && deliveredToIds.some((id) => Boolean(id) && id !== senderId);
  if (hasPeerDelivered) return 'delivered';

  return 'sent';
}

export function mergePollVotesMap(
  options: PollOption[],
  pollVotes?: Record<string, string>
): PollOption[] {
  if (!pollVotes) return options;
  return options.map((opt) => {
    const mappedVoters = Object.entries(pollVotes)
      .filter(([, selectedOptId]) => selectedOptId === opt.id)
      .map(([uid]) => uid);
    return {
      ...opt,
      voterIds: Array.from(new Set(mappedVoters))
    };
  });
}

export function filterExpiredDisappearingMessages(
  messages: DecryptedMessage[],
  disappearingSeconds: number,
  nowMs = Date.now()
): DecryptedMessage[] {
  if (!disappearingSeconds || disappearingSeconds <= 0) return messages;
  const maxAgeMs = disappearingSeconds * 1000;
  return messages.filter((msg) => nowMs - msg.createdAtMs < maxAgeMs);
}

export type MessageSearchFilter = 'all' | 'text' | 'link' | 'file' | 'poll';

export interface MessageSearchResult {
  message: DecryptedMessage;
  chatId: string;
  chatTitle: string;
  chatAvatar: string;
  isGroup: boolean;
  snippet: string;
}

/**
 * 1:1 character folding for Arabic & Latin search (preserves string length & exact slice indices).
 */
export function foldForSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

export function splitTextByHighlight(
  text: string,
  query: string
): Array<{ text: string; match: boolean }> {
  const cleanQuery = query.trim();
  if (!text || !cleanQuery) {
    return text ? [{ text, match: false }] : [];
  }

  const foldedText = foldForSearch(text);
  const foldedQuery = foldForSearch(cleanQuery);
  if (!foldedQuery) {
    return [{ text, match: false }];
  }

  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  const qLen = foldedQuery.length;

  while (cursor < text.length) {
    const idx = foldedText.indexOf(foldedQuery, cursor);
    if (idx === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), match: false });
    }
    parts.push({ text: text.slice(idx, idx + qLen), match: true });
    cursor = idx + qLen;
  }

  return parts;
}

export function getMessageSearchableText(msg: DecryptedMessage): string {
  const parts: string[] = [];
  if (msg.payload.text) parts.push(msg.payload.text);
  if (msg.payload.fileName && msg.payload.fileName !== msg.payload.text) {
    parts.push(msg.payload.fileName);
  }
  if (msg.payload.pollQuestion && msg.payload.pollQuestion !== msg.payload.text) {
    parts.push(msg.payload.pollQuestion);
  }
  if (msg.payload.pollOptions?.length) {
    for (const opt of msg.payload.pollOptions) {
      if (opt.text) parts.push(opt.text);
    }
  }
  return parts.join(' · ');
}

function matchesSearchFilterType(msg: DecryptedMessage, filterType: MessageSearchFilter): boolean {
  if (filterType === 'all') return true;
  if (filterType === 'text') return msg.type === 'text' || msg.type === 'image';
  if (filterType === 'file') return msg.type === 'file';
  if (filterType === 'poll') return msg.type === 'poll';
  if (filterType === 'link') return /https?:\/\/[^\s<>"'`]+/i.test(msg.payload.text || '');
  return true;
}

export function searchMessagesInChat(
  messages: DecryptedMessage[],
  query: string,
  filterType: MessageSearchFilter = 'all'
): DecryptedMessage[] {
  const cleanQuery = foldForSearch(query.trim());
  if (!cleanQuery && filterType === 'all') return [];

  return messages.filter((msg) => {
    if (msg.isDeleted) return false;
    if (!matchesSearchFilterType(msg, filterType)) return false;
    if (!cleanQuery) return true;
    const searchable = foldForSearch(getMessageSearchableText(msg));
    return searchable.includes(cleanQuery);
  });
}

export function searchAllChatsMessages(
  messagesMap: Record<string, DecryptedMessage[]>,
  chats: ChatRoom[],
  query: string,
  excludedChatIds: string[] = [],
  filterType: MessageSearchFilter = 'all',
  limit = 40
): MessageSearchResult[] {
  const cleanQuery = foldForSearch(query.trim());
  if (!cleanQuery && filterType === 'all') return [];

  const excludedSet = new Set(excludedChatIds);
  const results: MessageSearchResult[] = [];

  for (const chat of chats) {
    if (excludedSet.has(chat.id)) continue;
    const msgs = messagesMap[chat.id] || [];
    const matched = searchMessagesInChat(msgs, query, filterType);
    for (const message of matched) {
      const snippet = getMessageSearchableText(message) || message.payload.text || '';
      results.push({
        message,
        chatId: chat.id,
        chatTitle: chat.title,
        chatAvatar: chat.avatarUrl,
        isGroup: chat.type !== 'direct',
        snippet
      });
    }
  }

  return results
    .sort((a, b) => b.message.createdAtMs - a.message.createdAtMs)
    .slice(0, Math.max(1, limit));
}

export function normalizeWasilId(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  return cleaned ? `@${cleaned}` : '';
}

export function validateWasilId(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = raw.trim();
  const bare = (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).toLowerCase();
  if (!bare) {
    return { valid: false, normalized: '', error: 'أدخل المعرّف الخاص بك (بالأحرف الإنجليزية أو الأرقام).' };
  }
  if (!/^[a-z0-9_]+$/.test(bare)) {
    return {
      valid: false,
      normalized: normalizeWasilId(trimmed),
      error: 'يُسمح فقط بالأحرف الإنجليزية (a-z) والأرقام (0-9) والشرطة السفلية (_).'
    };
  }
  if (bare.length < 3) {
    return {
      valid: false,
      normalized: `@${bare}`,
      error: 'يجب أن يتكون المعرف من ٣ أحرف أو أرقام على الأقل بعد @.'
    };
  }
  if (bare.length > 28) {
    return {
      valid: false,
      normalized: `@${bare.slice(0, 28)}`,
      error: 'الحد الأقصى للمعرف هو ٢٨ حرفاً.'
    };
  }
  return {
    valid: true,
    normalized: `@${bare}`
  };
}

export function suggestWasilIdFromName(displayName?: string | null, suffixSeed?: string): string {
  const asciiBase = (displayName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 14);
  const safeBase = asciiBase.length >= 3 ? asciiBase : 'wasil';
  const cleanSeed = (suffixSeed || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 4);
  const suffix = cleanSeed.length >= 3 ? cleanSeed : Math.random().toString(36).slice(2, 6);
  return normalizeWasilId(`${safeBase}_${suffix}`);
}

