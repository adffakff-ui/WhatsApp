import { useState } from 'react';
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
  Heart,
  X
} from 'lucide-react';
import { Avatar } from './Avatar';
import { formatWhatsAppTime } from '../lib/chatLogic';
import type { ChatFilter, ChatRoom } from '../types/chat';

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
  myUid: string;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onTogglePin: (chatId: string) => void;
  onToggleArchive: (chatId: string) => void;
  onToggleMute: (chatId: string) => void;
  onToggleFavorite: (chatId: string) => void;
  isCloudSynced: boolean;
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
  myUid,
  onOpenNewChat,
  onOpenNewGroup,
  onTogglePin,
  onToggleArchive,
  onToggleMute,
  onToggleFavorite,
  isCloudSynced
}: ChatListPaneProps) {
  const [menuChatId, setMenuChatId] = useState<string | null>(null);

  const filterButtons: { id: ChatFilter; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'unread', label: 'غير مقروءة' },
    { id: 'favorites', label: 'المفضلة' },
    { id: 'groups', label: 'المجموعات' }
  ];

  return (
    <section
      aria-label="قائمة المحادثات"
      className="flex flex-col h-full bg-white dark:bg-[#111B21] border-l border-[#E9EDEF] dark:border-[#222D34]"
    >
      {/* Top Header */}
      <header className="px-4 h-16 shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="font-display text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
            {showArchived ? 'المؤرشفة' : 'الدردشات'}
          </h1>
          <span className="text-xs text-[#54656F] dark:text-[#8696A0] flex items-center gap-1 whitespace-nowrap">
            <Lock className="w-3 h-3 text-[#00A884]" aria-hidden="true" />
            <span>{isCloudSynced ? 'مزامنة سحابية' : 'تشفير محلي'}</span>
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showArchived && (
            <button
              type="button"
              onClick={() => onToggleArchivedView(false)}
              className="min-h-[40px] px-3 rounded-full text-xs font-medium text-[#008069] dark:text-[#06CF9C] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors whitespace-nowrap cursor-pointer"
            >
              العودة للدردشات
            </button>
          )}
          <button
            type="button"
            aria-label="مجموعة جديدة"
            title="مجموعة جديدة"
            onClick={onOpenNewGroup}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors cursor-pointer"
          >
            <Users className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="دردشة جديدة"
            title="دردشة جديدة"
            onClick={onOpenNewChat}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Search Bar */}
      <div className="px-3 pb-2.5 shrink-0">
        <div className="relative flex items-center bg-[#F0F2F5] dark:bg-[#202C33] rounded-lg px-3 h-9.5">
          <Search className="w-4 h-4 text-[#54656F] dark:text-[#8696A0] shrink-0 ml-2.5" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث أو ابدأ دردشة جديدة"
            aria-label="البحث في المحادثات"
            className="w-full bg-transparent text-sm text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#54656F] dark:placeholder:text-[#8696A0] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="مسح البحث"
              onClick={() => onSearchChange('')}
              className="p-1 text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Segmented Controls */}
      {!showArchived && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {filterButtons.map((btn) => {
            const active = filter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onChangeFilter(btn.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#D9FDD3] dark:bg-[#0A332C] text-[#008069] dark:text-[#06CF9C]'
                    : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]'
                }`}
              >
                {btn.label}
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
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#00A884]">
              <Archive className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-[#111B21] dark:text-[#E9EDEF]">المؤرشفة</span>
          </div>
          <span className="text-xs font-semibold text-[#00A884] font-mono-code">{archivedCount}</span>
        </button>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto pb-16 md:pb-2">
        {chats.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-[#54656F] dark:text-[#8696A0]">
              لا توجد محادثات مطابقة للفلتر الحالي
            </p>
            <button
              type="button"
              onClick={onOpenNewChat}
              className="mt-4 px-4 py-2 rounded-full bg-[#00A884] text-white text-xs font-semibold hover:bg-[#008069] transition-colors cursor-pointer"
            >
              بدء محادثة مشفرة جديدة
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[#F0F2F5] dark:divide-[#222D34]/60">
            {chats.map((chat) => {
              const isSelected = selectedChatId === chat.id;
              const isMine = chat.lastMessageSenderId === myUid;

              return (
                <li key={chat.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuChatId(null);
                      onSelectChat(chat.id);
                    }}
                    className={`w-full px-3.5 py-3 flex items-center gap-3 text-right transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#F0F2F5] dark:bg-[#2A3942]'
                        : 'hover:bg-[#F5F6F6] dark:hover:bg-[#202C33]'
                    }`}
                  >
                    <Avatar
                      src={chat.avatarUrl}
                      name={chat.title}
                      size="lg"
                      isOnline={chat.isOnline}
                      isGroup={chat.type !== 'direct'}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {chat.title}
                        </span>
                        <span
                          className={`text-[11px] font-mono-code whitespace-nowrap shrink-0 ${
                            chat.unreadCount > 0
                              ? 'text-[#00A884] font-semibold'
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
                                <CheckCheck className="w-4 h-4 text-[#53BDEB]" aria-label="مقروءة" />
                              ) : chat.lastMessageStatus === 'delivered' ? (
                                <CheckCheck className="w-4 h-4 text-[#8696A0]" aria-label="تم الاستلام" />
                              ) : (
                                <Check className="w-4 h-4 text-[#8696A0]" aria-label="تم الإرسال" />
                              )}
                            </span>
                          )}
                          <span className="truncate">
                            {chat.isTyping ? (
                              <span className="text-[#00A884] font-medium">يكتب الآن...</span>
                            ) : (
                              chat.lastMessagePreview
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {chat.favorite && (
                            <Heart className="w-3.5 h-3.5 text-[#00A884] fill-[#00A884]" aria-label="مفضلة" />
                          )}
                          {chat.muted && (
                            <VolumeX className="w-3.5 h-3.5 text-[#8696A0]" aria-label="مكتومة" />
                          )}
                          {chat.pinned && (
                            <Pin className="w-3.5 h-3.5 text-[#8696A0] rotate-45" aria-label="مثبتة" />
                          )}
                          {chat.unreadCount > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#00A884] text-white text-[11px] font-bold flex items-center justify-center font-mono-code">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Quick-action menu button */}
                  <button
                    type="button"
                    aria-label={`خيارات المحادثة ${chat.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuChatId(menuChatId === chat.id ? null : chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute left-2 top-8 w-7 h-7 rounded-full bg-white/90 dark:bg-[#202C33] shadow-sm flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white transition-opacity cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" aria-hidden="true" />
                  </button>

                  {menuChatId === chat.id && (
                    <div
                      role="menu"
                      className="absolute left-3 top-14 z-20 w-44 rounded-xl bg-white dark:bg-[#233138] shadow-lg border border-[#E9EDEF] dark:border-[#374248] py-1.5 text-sm"
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
