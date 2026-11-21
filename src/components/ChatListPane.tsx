import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  MessageSquarePlus,
  Users,
  Pin,
  VolumeX,
  Check,
  CheckCheck,
  Archive,
  MoreVertical,
  Lock,
  Unlock,
  Heart,
  X,
  Plane,
  Palette,
  Megaphone,
  Plus,
  Star,
  Camera,
  Radio,
  LogOut,
  MessageSquareText,
  Clock,
  Trash2,
  CheckSquare
} from 'lucide-react';
import { Avatar } from './Avatar';
import { HighlightText } from './HighlightText';
import { NetworkLatencyBadge } from './NetworkLatencyBadge';
import { PWAInstallButton, PWAInstallGuideModal } from './PWAInstallButton';
import {
  formatWhatsAppTime,
  groupStoriesByUser,
  searchAllChatsMessages,
  type MessageSearchFilter
} from '../lib/chatLogic';
import { computeVirtualWindow } from '../lib/virtualList';
import type {
  ChatFilter,
  ChatRoom,
  DecryptedMessage,
  StatusItem,
  UserProfile
} from '../types/chat';

const CHAT_ROW_HEIGHT = 74;

interface ChatListPaneProps {
  chats: ChatRoom[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  filter: ChatFilter;
  onChangeFilter: (filter: ChatFilter) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showArchived: boolean;
  onToggleArchivedView: (show: boolean) => void;
  archivedCount: number;
  lockedCount: number;
  lockedChatIds: string[];
  myUid: string;
  currentUser: UserProfile;
  statuses: StatusItem[];
  showStoriesTray: boolean;
  dndMode: boolean;
  onToggleDndMode: () => void;
  onOpenNewChat: (prefillQuery?: string) => void;
  onOpenNewGroup: () => void;
  onOpenNewChannel?: () => void;
  onOpenBroadcast: () => void;
  onOpenOmarAddons: () => void;
  onOpenCommunities: () => void;
  onOpenStarred: () => void;
  onOpenStatusTab: (authorId?: string) => void;
  onTogglePin: (chatId: string) => void;
  onToggleArchive: (chatId: string) => void;
  onToggleMute: (chatId: string) => void;
  onToggleFavorite: (chatId: string) => void;
  onToggleLockChat: (chatId: string) => void;
  isCloudSynced: boolean;
  allChats?: ChatRoom[];
  messagesMap?: Record<string, DecryptedMessage[]>;
  unlockedChatIds?: string[];
  onJumpToMessage?: (chatId: string, messageId: string, highlightQuery?: string) => void;
  onLockAppNow?: () => void;
  onSignOut?: () => void;
  onOpenScheduledMessages?: () => void;
  scheduledCount?: number;
  onDeleteChat?: (chatId: string) => Promise<void> | void;
  onDeleteMultipleChats?: (chatIds: string[]) => Promise<void> | void;
}

export function ChatListPane({
  chats,
  selectedChatId,
  onSelectChat,
  filter,
  onChangeFilter,
  searchQuery,
  onSearchChange,
  showArchived,
  onToggleArchivedView,
  archivedCount,
  lockedCount,
  lockedChatIds,
  myUid,
  currentUser,
  statuses,
  showStoriesTray,
  dndMode,
  onToggleDndMode,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenNewChannel,
  onOpenBroadcast,
  onOpenOmarAddons,
  onOpenCommunities,
  onOpenStarred,
  onOpenStatusTab,
  onTogglePin,
  onToggleArchive,
  onToggleMute,
  onToggleFavorite,
  onToggleLockChat,
  isCloudSynced,
  allChats,
  messagesMap = {},
  unlockedChatIds = [],
  onJumpToMessage,
  onLockAppNow,
  onSignOut,
  onOpenScheduledMessages,
  scheduledCount = 0,
  onDeleteChat,
  onDeleteMultipleChats
}: ChatListPaneProps) {
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [menuOpensUp, setMenuOpensUp] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [msgFilter, setMsgFilter] = useState<MessageSearchFilter>('all');
  const [deleteTargetChat, setDeleteTargetChat] = useState<ChatRoom | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChatIdsForDeletion, setSelectedChatIdsForDeletion] = useState<Set<string>>(new Set());
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [isDeletingMulti, setIsDeletingMulti] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [filter, showArchived, searchQuery, msgFilter]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const nextTop = e.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(nextTop);
    });
  };

  const toggleChatSelection = (chatId: string) => {
    setSelectedChatIdsForDeletion((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  const hasSearchQuery = searchQuery.trim().length > 0;
  const showAdvancedFilters = searchFocused || hasSearchQuery || msgFilter !== 'all';

  const messageSearchResults = useMemo(() => {
    if (!hasSearchQuery && msgFilter === 'all') return [];
    const pool = allChats && allChats.length > 0 ? allChats : chats;
    const unlockedSet = new Set(unlockedChatIds);
    const hiddenLockedIds = lockedChatIds.filter((id) => !unlockedSet.has(id));
    return searchAllChatsMessages(messagesMap, pool, searchQuery, hiddenLockedIds, msgFilter, 40);
  }, [hasSearchQuery, msgFilter, allChats, chats, messagesMap, searchQuery, lockedChatIds, unlockedChatIds]);

  const virtualWindow = useMemo(
    () =>
      computeVirtualWindow({
        totalCount: chats.length,
        itemHeight: CHAT_ROW_HEIGHT,
        viewportHeight,
        scrollTop,
        overscan: 6
      }),
    [chats.length, viewportHeight, scrollTop]
  );

  const visibleChats = useMemo(
    () => chats.slice(virtualWindow.startIndex, virtualWindow.endIndex),
    [chats, virtualWindow.startIndex, virtualWindow.endIndex]
  );

  useEffect(() => {
    if (!menuChatId && !showHeaderMenu && !fabOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-floating-menu="chat-list"]')) return;
      setMenuChatId(null);
      setShowHeaderMenu(false);
      setFabOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuChatId(null);
        setShowHeaderMenu(false);
        setFabOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuChatId, showHeaderMenu, fabOpen]);

  const filterButtons: { id: ChatFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'unread', label: 'غير مقروءة' },
    { id: 'favorites', label: 'المفضلة' },
    { id: 'groups', label: 'المجموعات' },
    { id: 'locked', label: 'المقفلة', count: lockedCount }
  ];

  // Group active 24h stories per author for the top quick stories tray
  const storyUserGroups = useMemo(
    () => groupStoriesByUser(statuses, myUid),
    [statuses, myUid]
  );
  const myStoryGroup = storyUserGroups.find((g) => g.authorId === myUid);
  const contactStoryGroups = storyUserGroups.filter((g) => g.authorId !== myUid);

  return (
    <section
      aria-label="قائمة المحادثات"
      className="relative flex flex-col h-full w-full max-w-full min-w-0 overflow-hidden bg-white dark:bg-[#111B21] border-l border-[#E9EDEF] dark:border-[#222D34]"
    >
      {/* Top Header */}
      <header className="px-3 sm:px-4 h-16 shrink-0 flex items-center justify-between gap-1.5 sm:gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <h1 className="font-display text-lg sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
            {showArchived ? 'المؤرشفة' : 'تواصل'}
          </h1>
          <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] flex items-center gap-1 whitespace-nowrap shrink-0">
            <Lock className="w-3 h-3 text-[var(--wa-accent)]" aria-hidden="true" />
            <span>{isCloudSynced ? 'سحابي' : 'محلي'}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 relative">
          <NetworkLatencyBadge />
          {showArchived && (
            <button
              type="button"
              onClick={() => onToggleArchivedView(false)}
              className="min-h-[38px] px-2.5 sm:px-3 rounded-full text-xs font-medium text-[var(--wa-accent-strong)] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors whitespace-nowrap cursor-pointer"
            >
              العودة
            </button>
          )}

          {/* Airplane / DND Quick Toggle */}
          <button
            type="button"
            aria-label={dndMode ? 'إلغاء وضع عدم الإزعاج' : 'تفعيل وضع عدم الإزعاج'}
            title={dndMode ? 'وضع الطيران مفعّل' : 'وضع عدم الإزعاج (الطيران)'}
            onClick={onToggleDndMode}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              dndMode
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33]'
            }`}
          >
            <Plane className="w-4.5 h-4.5" aria-hidden="true" />
          </button>

          {/* Omar Add-ons & Themes Quick Shortcut */}
          <button
            type="button"
            aria-label="إضافات وثيمات أكرم"
            title="ثيمات وإضافات أكرم"
            onClick={onOpenOmarAddons}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[var(--wa-accent-strong)] hover:bg-[var(--wa-accent-soft)]/50 dark:hover:bg-[#202C33] transition-colors cursor-pointer"
          >
            <Palette className="w-4.5 h-4.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="دردشة جديدة"
            title="دردشة جديدة"
            onClick={() => onOpenNewChat()}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-5 h-5" aria-hidden="true" />
          </button>

          <div data-floating-menu="chat-list" className="relative">
            <button
              type="button"
              aria-label="القائمة الإضافية"
              aria-expanded={showHeaderMenu}
              onClick={() => {
                setShowHeaderMenu((v) => !v);
                setMenuChatId(null);
                setFabOpen(false);
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors cursor-pointer"
            >
              <MoreVertical className="w-5 h-5" aria-hidden="true" />
            </button>

            {showHeaderMenu && (
              <div
                role="menu"
                className="absolute left-0 top-12 z-30 w-52 rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-sm"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenNewGroup();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <Users className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                  <span>مجموعة جديدة</span>
                </button>
                {onOpenNewChannel && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenNewChannel();
                      setShowHeaderMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                  >
                    <Radio className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                    <span>قناة إخبارية جديدة</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenBroadcast();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <Megaphone className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                  <span>رسالة بث جماعية</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenCommunities();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <Users className="w-4 h-4 text-[#54656F] dark:text-[#AEBAC1]" aria-hidden="true" />
                  <span>المجتمعات والقنوات</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenStarred();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <Star className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span>الرسائل المميزة بنجمة</span>
                </button>
                {onOpenScheduledMessages && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenScheduledMessages();
                      setShowHeaderMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-right flex items-center justify-between hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />
                      <span>الرسائل المجدولة</span>
                    </div>
                    {scheduledCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[var(--wa-accent)] text-white text-[10px] font-bold font-mono-code">
                        {scheduledCount}
                      </span>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setIsSelectionMode((prev) => !prev);
                    setSelectedChatIdsForDeletion(new Set());
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                  <span>{isSelectionMode ? 'إلغاء وضع التحديد' : 'تحديد الدردشات لحذفها'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenOmarAddons();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[var(--wa-accent-strong)] font-semibold cursor-pointer"
                >
                  <Palette className="w-4 h-4" aria-hidden="true" />
                  <span>ثيمات وإضافات أكرم</span>
                </button>
                {onLockAppNow && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onLockAppNow();
                    }}
                    className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] font-medium cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                    <span>قفل التطبيق الآن</span>
                  </button>
                )}
                <PWAInstallButton
                  variant="menu"
                  onAction={() => setShowHeaderMenu(false)}
                  onOpenGuide={() => setShowInstallGuide(true)}
                />
                {onSignOut && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onSignOut();
                    }}
                    className="w-full px-4 py-2.5 text-right flex items-center gap-2.5 border-t border-[#F0F2F5] dark:border-[#2A3942] mt-1 pt-2.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 font-semibold cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    <span>تسجيل الخروج</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Optional DND Active Banner */}
      {dndMode && (
        <div className="px-4 py-2 bg-amber-500/12 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 shrink-0">
          <span className="flex items-center gap-1.5 font-medium">
            <Plane className="w-3.5 h-3.5" aria-hidden="true" />
            <span>وضع عدم الإزعاج مفعّل — الإشعارات مكتومة</span>
          </span>
          <button
            type="button"
            onClick={onToggleDndMode}
            className="font-bold underline cursor-pointer"
          >
            إيقاف
          </button>
        </div>
      )}

      {/* Advanced Search Bar (Chats + Deep Message Content) */}
      <div className="px-3 pt-2.5 pb-2 shrink-0 space-y-2">
        <div
          className={`relative flex items-center bg-[#F0F2F5] dark:bg-[#202C33] rounded-xl px-2.5 h-10 border transition-colors ${
            showAdvancedFilters
              ? 'border-[var(--wa-accent)]/50'
              : 'border-transparent'
          }`}
        >
          <button
            type="button"
            aria-label="تفعيل البحث المتقدم في الرسائل"
            title="بحث في المحادثات والرسائل"
            onClick={() => {
              setSearchFocused(true);
              searchInputRef.current?.focus();
            }}
            className="p-1.5 rounded-lg text-[#54656F] dark:text-[#8696A0] hover:text-[var(--wa-accent-strong)] shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث في المحادثات أو داخل الرسائل..."
            aria-label="البحث في المحادثات والرسائل"
            className="w-full bg-transparent text-sm text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#54656F] dark:placeholder:text-[#8696A0] focus:outline-none px-1.5"
          />
          {(searchQuery || msgFilter !== 'all' || searchFocused) && (
            <button
              type="button"
              aria-label="مسح البحث"
              onClick={() => {
                onSearchChange('');
                setMsgFilter('all');
                setSearchFocused(false);
              }}
              className="p-1 text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {showAdvancedFilters && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'text', label: 'نص وصور' },
                { id: 'link', label: 'روابط' },
                { id: 'file', label: 'ملفات' },
                { id: 'poll', label: 'استطلاعات' }
              ] as { id: MessageSearchFilter; label: string }[]
            ).map((opt) => {
              const active = msgFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMsgFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--wa-accent)] text-white font-semibold'
                      : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Stories Tray (Grouped by User, 24h Ephemeral Stories) */}
      {!showArchived && showStoriesTray && (
        <div className="px-3 pb-2.5 shrink-0">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
            <div className="flex flex-col items-center gap-1 shrink-0 w-14 relative">
              <div className="relative">
                <button
                  type="button"
                  aria-label={myStoryGroup ? 'عرض قصتي النشطة' : 'إضافة قصة جديدة'}
                  onClick={() => onOpenStatusTab(myStoryGroup ? myUid : undefined)}
                  className="cursor-pointer block rounded-full focus-visible:outline-2 focus-visible:outline-[var(--wa-accent)]"
                >
                  <div
                    className={`p-0.5 rounded-full border-2 ${
                      myStoryGroup
                        ? 'border-[var(--wa-accent)]'
                        : 'border-dashed border-[var(--wa-accent)]'
                    }`}
                  >
                    <Avatar src={currentUser.avatarUrl} name={currentUser.displayName} size="md" />
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="نشر قصة جديدة"
                  title="نشر قصة جديدة"
                  onClick={() => onOpenStatusTab()}
                  className="absolute -bottom-0.5 -left-0.5 w-4.5 h-4.5 rounded-full bg-[var(--wa-accent)] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#111B21] cursor-pointer hover:brightness-95"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate w-full text-center">
                {myStoryGroup ? `قصتي (${myStoryGroup.stories.length})` : 'قصتي'}
              </span>
            </div>

            {contactStoryGroups.map((group) => (
              <button
                key={group.authorId}
                type="button"
                aria-label={`عرض قصص ${group.authorName} (${group.stories.length})`}
                onClick={() => onOpenStatusTab(group.authorId)}
                className="flex flex-col items-center gap-1 shrink-0 w-14 cursor-pointer"
              >
                <div className="relative">
                  <div
                    className={`p-0.5 rounded-full border-2 ${
                      group.unviewedCount > 0
                        ? 'border-[var(--wa-accent)]'
                        : 'border-[#8696A0]/50'
                    }`}
                  >
                    <Avatar src={group.authorAvatar} name={group.authorName} size="md" />
                  </div>
                  {group.stories.length > 1 && (
                    <span className="absolute -bottom-0.5 -left-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#202C33] dark:bg-[#2A3942] text-white text-[9px] font-bold font-mono-code flex items-center justify-center ring-2 ring-white dark:ring-[#111B21]">
                      {group.stories.length}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium text-[#111B21] dark:text-[#E9EDEF] truncate w-full text-center">
                  {group.authorName.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Segmented Controls */}
      {!showArchived && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {filterButtons.map((btn) => {
            const active = filter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onChangeFilter(btn.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                  active
                    ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] font-semibold'
                    : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]'
                }`}
              >
                {btn.id === 'locked' && <Lock className="w-3 h-3" aria-hidden="true" />}
                <span>{btn.label}</span>
                {typeof btn.count === 'number' && btn.count > 0 && (
                  <span className="font-mono-code text-[10px]">({btn.count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Archived banner row */}
      {!showArchived && archivedCount > 0 && (
        <button
          type="button"
          onClick={() => onToggleArchivedView(true)}
          className="w-full px-4 py-3 flex items-center justify-between border-b border-[#F0F2F5] dark:border-[#222D34] hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] transition-colors cursor-pointer shrink-0"
        >
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--wa-accent)]">
              <Archive className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-[#111B21] dark:text-[#E9EDEF]">المؤرشفة</span>
          </div>
          <span className="text-xs font-semibold text-[var(--wa-accent)] font-mono-code">{archivedCount}</span>
        </button>
      )}

      {/* Multi-Selection Action Bar */}
      {isSelectionMode && (
        <div className="px-4 py-2.5 bg-[#E9EDEF] dark:bg-[#202C33] border-y border-[#D1D7DB] dark:border-[#374248] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] whitespace-nowrap">
              تم تحديد ({selectedChatIdsForDeletion.size})
            </span>
            <button
              type="button"
              onClick={() => {
                if (selectedChatIdsForDeletion.size === chats.length) {
                  setSelectedChatIdsForDeletion(new Set());
                } else {
                  setSelectedChatIdsForDeletion(new Set(chats.map((c) => c.id)));
                }
              }}
              className="text-[11px] text-[var(--wa-accent-strong)] hover:underline font-semibold cursor-pointer whitespace-nowrap"
            >
              {selectedChatIdsForDeletion.size === chats.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </button>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={selectedChatIdsForDeletion.size === 0}
              onClick={() => setShowMultiDeleteModal(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>حذف المحدد</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedChatIdsForDeletion(new Set());
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white/70 dark:bg-[#111B21] text-xs font-medium text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-white cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Chat List & Deep Message Search Results (Virtualized Window) */}
      <div
        ref={listScrollRef}
        onScroll={handleListScroll}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-24 md:pb-16"
      >
        {chats.length === 0 && messageSearchResults.length === 0 ? (
          <div className="px-6 py-14 text-center space-y-2">
            <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">
              {hasSearchQuery || msgFilter !== 'all'
                ? 'لا توجد محادثات أو رسائل مطابقة لبحثك'
                : filter === 'locked'
                  ? 'لا توجد محادثات مقفلة حالياً'
                  : filter === 'all' && !showArchived
                    ? 'لا توجد محادثات بعد'
                    : 'لا توجد محادثات مطابقة للفلتر الحالي'}
            </p>
            {!hasSearchQuery && msgFilter === 'all' && filter === 'all' && !showArchived && (
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                ابحث بالمعرّف الخاص (@) للطرف الآخر أو شارك معرفك لبدء محادثة مشفرة فورية.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {hasSearchQuery && (
                <button
                  type="button"
                  onClick={() => onOpenNewChat(searchQuery.trim())}
                  className="px-4 py-2 rounded-full bg-[var(--wa-accent)] text-white text-xs font-semibold hover:brightness-95 transition-all cursor-pointer"
                >
                  بحث بالمعرّف وبدء محادثة: «{searchQuery.trim()}»
                </button>
              )}
              <button
                type="button"
                onClick={
                  hasSearchQuery || msgFilter !== 'all'
                    ? () => {
                        onSearchChange('');
                        setMsgFilter('all');
                      }
                    : filter === 'locked'
                      ? () => onChangeFilter('all')
                      : () => onOpenNewChat()
                }
                className={`px-4 py-2 rounded-full text-xs font-semibold hover:brightness-95 transition-all cursor-pointer ${
                  hasSearchQuery
                    ? 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF]'
                    : 'bg-[var(--wa-accent)] text-white'
                }`}
              >
                {hasSearchQuery || msgFilter !== 'all'
                  ? 'إعادة ضبط البحث'
                  : filter === 'locked'
                    ? 'عرض جميع الدردشات'
                    : 'بدء محادثة بالمعرّف @'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {(hasSearchQuery || msgFilter !== 'all') && chats.length > 0 && (
              <div className="px-4 py-1.5 bg-[#F8FAFB] dark:bg-[#182229] border-y border-[#F0F2F5] dark:border-[#222D34] text-[11px] font-bold text-[#54656F] dark:text-[#8696A0]">
                المحادثات ({chats.length})
              </div>
            )}
            {chats.length > 0 && (
          <ul className="divide-y divide-[#F0F2F5] dark:divide-[#222D34]/60">
            {virtualWindow.topSpacerHeight > 0 && (
              <li
                aria-hidden="true"
                style={{ height: `${virtualWindow.topSpacerHeight}px` }}
                className="pointer-events-none !border-0"
              />
            )}
            {visibleChats.map((chat) => {
              const isSelected = selectedChatId === chat.id;
              const isMine = chat.lastMessageSenderId === myUid;
              const isLocked = lockedChatIds.includes(chat.id);

              return (
                <li
                  key={chat.id}
                  className={`relative group h-[74px] ${menuChatId === chat.id ? 'z-20' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleChatSelection(chat.id);
                      } else {
                        setMenuChatId(null);
                        onSelectChat(chat.id);
                      }
                    }}
                    className={`w-full h-full px-3.5 flex items-center gap-3 text-right transition-colors cursor-pointer ${
                      isSelected && !isSelectionMode
                        ? 'bg-[#F0F2F5] dark:bg-[#2A3942]'
                        : selectedChatIdsForDeletion.has(chat.id)
                          ? 'bg-rose-50/70 dark:bg-rose-950/20'
                          : 'hover:bg-[#F5F6F6] dark:hover:bg-[#202C33]'
                    }`}
                  >
                    {isSelectionMode && (
                      <div className="shrink-0 flex items-center justify-center pl-1">
                        <input
                          type="checkbox"
                          aria-label={`تحديد المحادثة ${chat.title}`}
                          checked={selectedChatIdsForDeletion.has(chat.id)}
                          onChange={() => toggleChatSelection(chat.id)}
                          className="w-4.5 h-4.5 rounded accent-rose-600 cursor-pointer"
                        />
                      </div>
                    )}
                    <Avatar
                      src={chat.avatarUrl}
                      name={chat.title}
                      size="lg"
                      isOnline={chat.isOnline}
                      isGroup={chat.type !== 'direct'}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate flex items-center gap-1.5">
                          <span className="truncate">
                            <HighlightText text={chat.title} query={searchQuery} />
                          </span>
                          {isLocked && (
                            <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="محادثة مقفلة" />
                          )}
                        </span>
                        <span
                          className={`text-[11px] font-mono-code whitespace-nowrap shrink-0 ${
                            chat.unreadCount > 0
                              ? 'text-[var(--wa-accent)] font-semibold'
                              : 'text-[#667781] dark:text-[#8696A0]'
                          }`}
                        >
                          {formatWhatsAppTime(chat.lastMessageAtMs)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 min-w-0 text-[13px] text-[#54656F] dark:text-[#8696A0]">
                          {isMine && (
                            <span className="shrink-0">
                              {chat.lastMessageStatus === 'read' ? (
                                <CheckCheck className="w-4 h-4 text-[#53BDEB]" aria-label="تمت القراءة والمشاهدة" />
                              ) : chat.lastMessageStatus === 'delivered' ? (
                                <CheckCheck className="w-4 h-4 text-[#8696A0]" aria-label="تم الاستلام" />
                              ) : (
                                <Check className="w-4 h-4 text-[#8696A0]" aria-label="تم الإرسال" />
                              )}
                            </span>
                          )}
                          <span className="truncate">
                            {isLocked ? (
                              'محادثة مقفلة برمز سري'
                            ) : chat.isTyping ? (
                              <span className="text-[var(--wa-accent)] font-medium">يكتب الآن...</span>
                            ) : (
                              <HighlightText text={chat.lastMessagePreview} query={searchQuery} />
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {chat.favorite && (
                            <Heart className="w-3.5 h-3.5 text-[var(--wa-accent)] fill-[var(--wa-accent)]" aria-label="مفضلة" />
                          )}
                          {chat.muted && (
                            <VolumeX className="w-3.5 h-3.5 text-[#8696A0]" aria-label="مكتومة" />
                          )}
                          {chat.pinned && (
                            <Pin className="w-3.5 h-3.5 text-[#8696A0] rotate-45" aria-label="مثبتة" />
                          )}
                          {chat.unreadCount > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--wa-accent)] text-white text-[11px] font-bold flex items-center justify-center font-mono-code">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Quick-action menu button */}
                  <div data-floating-menu="chat-list" className="contents">
                    <button
                      type="button"
                      aria-label={`خيارات المحادثة ${chat.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const openUp =
                          typeof window !== 'undefined' &&
                          window.innerHeight - rect.bottom < 270 &&
                          rect.top > 240;
                        setMenuOpensUp(openUp);
                        setMenuChatId((curr) => (curr === chat.id ? null : chat.id));
                        setShowHeaderMenu(false);
                        setFabOpen(false);
                      }}
                      className="opacity-80 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/95 dark:bg-[#202C33] ring-1 ring-[#E9EDEF] dark:ring-[#374248] shadow-sm flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white transition-opacity cursor-pointer"
                    >
                      <MoreVertical className="w-4 h-4" aria-hidden="true" />
                    </button>

                    {menuChatId === chat.id && (
                      <div
                        role="menu"
                        className={`absolute left-3 z-40 w-48 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-[#233138] shadow-xl border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-sm ${
                          menuOpensUp ? 'bottom-14' : 'top-14'
                        }`}
                      >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onTogglePin(chat.id);
                          setMenuChatId(null);
                        }}
                        className="w-full px-4 py-2 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                      >
                        {chat.pinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onToggleFavorite(chat.id);
                          setMenuChatId(null);
                        }}
                        className="w-full px-4 py-2 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                      >
                        {chat.favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onToggleLockChat(chat.id);
                          setMenuChatId(null);
                        }}
                        className="w-full px-4 py-2 text-right flex items-center gap-2 hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                      >
                        {isLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                            <span>إلغاء قفل المحادثة</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                            <span>قفل المحادثة برمز</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onToggleMute(chat.id);
                          setMenuChatId(null);
                        }}
                        className="w-full px-4 py-2 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                      >
                        {chat.muted ? 'إلغاء كتم الإشعارات' : 'كتم الإشعارات'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onToggleArchive(chat.id);
                          setMenuChatId(null);
                        }}
                        className="w-full px-4 py-2 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#182229] text-[#111B21] dark:text-[#E9EDEF] cursor-pointer"
                      >
                        {chat.archived ? 'إلغاء الأرشفة' : 'أرشفة المحادثة'}
                      </button>
                      <div className="my-1 border-t border-[#F0F2F5] dark:border-[#374248]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuChatId(null);
                          setDeleteTargetChat(chat);
                        }}
                        className="w-full px-4 py-2 text-right flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-semibold cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
                        <span>حذف المحادثة</span>
                      </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
            {virtualWindow.bottomSpacerHeight > 0 && (
              <li
                aria-hidden="true"
                style={{ height: `${virtualWindow.bottomSpacerHeight}px` }}
                className="pointer-events-none !border-0"
              />
            )}
            </ul>
            )}

            {/* Deep Message Content Results */}
            {(hasSearchQuery || msgFilter !== 'all') && (
              <div className="mt-1">
                <div className="px-4 py-1.5 bg-[#F8FAFB] dark:bg-[#182229] border-y border-[#F0F2F5] dark:border-[#222D34] flex items-center justify-between text-[11px] font-bold text-[var(--wa-accent-strong)]">
                  <span className="flex items-center gap-1.5">
                    <MessageSquareText className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>الرسائل المطابقة ({messageSearchResults.length})</span>
                  </span>
                </div>
                {messageSearchResults.length === 0 ? (
                  <p className="px-4 py-5 text-center text-xs text-[#667781] dark:text-[#8696A0]">
                    لا توجد رسائل مطابقة لهذا البحث.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#F0F2F5] dark:divide-[#222D34]/60">
                    {messageSearchResults.map((res) => (
                      <li key={`${res.chatId}_${res.message.id}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuChatId(null);
                            if (onJumpToMessage) {
                              onJumpToMessage(res.chatId, res.message.id, searchQuery);
                            } else {
                              onSelectChat(res.chatId);
                            }
                          }}
                          className="w-full px-3.5 py-2.5 flex items-start gap-3 text-right hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] transition-colors cursor-pointer"
                        >
                          <Avatar
                            src={res.chatAvatar}
                            name={res.chatTitle}
                            size="md"
                            isGroup={res.isGroup}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                                {res.chatTitle}
                              </span>
                              <span className="text-[10px] font-mono-code text-[#667781] dark:text-[#8696A0] shrink-0">
                                {formatWhatsAppTime(res.message.createdAtMs)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-[#54656F] dark:text-[#AEBAC1] line-clamp-2 break-words">
                              <span className="font-semibold text-[#111B21] dark:text-[#E9EDEF]">
                                {res.message.senderId === myUid ? 'أنت' : res.message.senderName}:{' '}
                              </span>
                              <HighlightText text={res.snippet} query={searchQuery} />
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {hasSearchQuery && (
              <div className="px-4 py-3 border-t border-[#F0F2F5] dark:border-[#222D34] text-center">
                <button
                  type="button"
                  onClick={() => onOpenNewChat(searchQuery.trim())}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-xs font-bold hover:brightness-95 transition-all cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>بحث بالمعرّف وبدء محادثة جديدة: «{searchQuery.trim()}»</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Expandable Omar Floating Action Button (FAB) */}
      <div
        data-floating-menu="chat-list"
        className="absolute bottom-20 left-4 md:bottom-5 md:left-4 z-20 flex flex-col items-start gap-2"
      >
        {fabOpen && (
          <div className="flex flex-col items-start gap-2 mb-1">
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                onOpenOmarAddons();
              }}
              className="px-3.5 py-2 rounded-full bg-white dark:bg-[#233138] text-[#111B21] dark:text-[#E9EDEF] shadow-lg border border-[#E9EDEF] dark:border-[#374248] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <Palette className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>ثيمات وإضافات أكرم</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                onOpenBroadcast();
              }}
              className="px-3.5 py-2 rounded-full bg-white dark:bg-[#233138] text-[#111B21] dark:text-[#E9EDEF] shadow-lg border border-[#E9EDEF] dark:border-[#374248] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <Megaphone className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>رسالة بث جماعية</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                onOpenStatusTab();
              }}
              className="px-3.5 py-2 rounded-full bg-white dark:bg-[#233138] text-[#111B21] dark:text-[#E9EDEF] shadow-lg border border-[#E9EDEF] dark:border-[#374248] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>نشر حالة جديدة</span>
            </button>
            {onOpenNewChannel && (
              <button
                type="button"
                onClick={() => {
                  setFabOpen(false);
                  onOpenNewChannel();
                }}
                className="px-3.5 py-2 rounded-full bg-white dark:bg-[#233138] text-[#111B21] dark:text-[#E9EDEF] shadow-lg border border-[#E9EDEF] dark:border-[#374248] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
              >
                <Radio className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
                <span>قناة إخبارية جديدة</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                onOpenNewGroup();
              }}
              className="px-3.5 py-2 rounded-full bg-white dark:bg-[#233138] text-[#111B21] dark:text-[#E9EDEF] shadow-lg border border-[#E9EDEF] dark:border-[#374248] text-xs font-semibold flex items-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <Users className="w-4 h-4 text-[var(--wa-accent)]" aria-hidden="true" />
              <span>مجموعة جديدة</span>
            </button>
          </div>
        )}

        <button
          type="button"
          aria-label={fabOpen ? 'إغلاق الإجراءات السريعة' : 'الإجراءات السريعة'}
          aria-expanded={fabOpen}
          onClick={() => {
            setFabOpen((v) => !v);
            setShowHeaderMenu(false);
            setMenuChatId(null);
          }}
          className="w-13 h-13 rounded-2xl bg-[var(--wa-accent)] text-white shadow-lg flex items-center justify-center hover:brightness-95 active:scale-95 transition-all cursor-pointer"
        >
          <Plus
            className={`w-6 h-6 transition-transform duration-200 ${fabOpen ? 'rotate-45' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <PWAInstallGuideModal
        open={showInstallGuide}
        onClose={() => setShowInstallGuide(false)}
      />

      {/* Delete Single Chat Confirmation Modal */}
      {deleteTargetChat && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد حذف المحادثة"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl p-5 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                حذف المحادثة نهائياً؟
              </h3>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                هل أنت متأكد من حذف محادثة «<span className="font-semibold text-[#111B21] dark:text-[#E9EDEF]">{deleteTargetChat.title}</span>»؟
                سيتم حذف المحادثة والرسائل الخاصة بها نهائياً.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingChat}
                onClick={() => setDeleteTargetChat(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold hover:bg-[#E9EDEF] dark:hover:bg-[#222D34] transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeletingChat}
                onClick={async () => {
                  if (!onDeleteChat) return;
                  setIsDeletingChat(true);
                  try {
                    await onDeleteChat(deleteTargetChat.id);
                    setDeleteTargetChat(null);
                  } finally {
                    setIsDeletingChat(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingChat ? 'جاري الحذف...' : 'حذف المحادثة'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Multiple Chats Confirmation Modal */}
      {showMultiDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد حذف المحادثات المحددة"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#202C33] rounded-2xl p-5 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                تأكيد حذف المحادثات المحددة
              </h3>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                هل أنت متأكد من حذف <span className="font-bold text-rose-600 font-mono-code">{selectedChatIdsForDeletion.size}</span> محادثة محددة؟
                سيتم حذف المحادثات والرسائل الخاصة بها نهائياً.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingMulti}
                onClick={() => setShowMultiDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold hover:bg-[#E9EDEF] dark:hover:bg-[#222D34] transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isDeletingMulti}
                onClick={async () => {
                  if (!onDeleteMultipleChats) return;
                  setIsDeletingMulti(true);
                  try {
                    await onDeleteMultipleChats(Array.from(selectedChatIdsForDeletion));
                    setSelectedChatIdsForDeletion(new Set());
                    setIsSelectionMode(false);
                    setShowMultiDeleteModal(false);
                  } finally {
                    setIsDeletingMulti(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingMulti ? 'جاري الحذف...' : 'حذف الكل'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
