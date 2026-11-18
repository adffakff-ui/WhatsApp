import { useMemo, useState } from 'react';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Lock, Search, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { formatCallDuration, formatWhatsAppTime } from '../lib/chatLogic';
import type { CallRecord, ChatRoom } from '../types/chat';

interface CallsViewProps {
  calls: CallRecord[];
  chats: ChatRoom[];
  onStartCall: (chat: ChatRoom, callType: 'audio' | 'video') => void;
}

type CallFilterMode = 'all' | 'audio' | 'video' | 'missed';

export function CallsView({ calls, chats, onStartCall }: CallsViewProps) {
  const [filterMode, setFilterMode] = useState<CallFilterMode>('all');
  const [search, setSearch] = useState('');

  const directChats = useMemo(
    () =>
      chats.filter(
        (c) =>
          c.type === 'direct' &&
          (!search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase()))
      ),
    [chats, search]
  );

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((call) => {
      if (filterMode === 'audio' && call.callType !== 'audio') return false;
      if (filterMode === 'video' && call.callType !== 'video') return false;
      if (filterMode === 'missed' && call.status !== 'missed' && call.status !== 'declined') {
        return false;
      }
      if (q) {
        const peerName = (call.direction === 'outgoing' ? call.calleeName : call.callerName).toLowerCase();
        if (!peerName.includes(q)) return false;
      }
      return true;
    });
  }, [calls, filterMode, search]);

  const filters: { id: CallFilterMode; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'audio', label: 'الصوتية' },
    { id: 'video', label: 'المرئية' },
    { id: 'missed', label: 'الفائتة' }
  ];

  return (
    <div className="flex-1 min-w-0 w-full max-w-full overflow-hidden flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      <div className="w-full max-w-full min-w-0 md:w-96 md:shrink-0 border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full overflow-hidden">
        <header className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0 min-w-0">
          <h1 className="font-display text-lg sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] truncate min-w-0">
            المكالمات
          </h1>
          <span className="text-xs text-[#54656F] dark:text-[#8696A0] flex items-center gap-1 shrink-0 whitespace-nowrap">
            <Lock className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
            <span>مشفرة تماماً</span>
          </span>
        </header>

        {/* Search & Filter Controls */}
        <div className="p-3 space-y-2.5 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0">
          <div className="flex items-center bg-[#F0F2F5] dark:bg-[#202C33] rounded-xl px-3 h-9.5">
            <Search className="w-4 h-4 text-[#54656F] dark:text-[#8696A0] ml-2 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في المكالمات وجهات الاتصال..."
              aria-label="ابحث في المكالمات"
              className="w-full bg-transparent text-xs text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#54656F] dark:placeholder:text-[#8696A0] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                aria-label="مسح البحث"
                onClick={() => setSearch('')}
                className="p-0.5 text-[#54656F] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {filters.map((f) => {
              const active = filterMode === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMode(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] font-bold'
                      : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0]'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-5 pb-24 md:pb-4">
          {/* Quick call contacts */}
          <div>
            <p className="px-2 pb-2 text-xs font-semibold text-[var(--wa-accent-strong)]">
              إجراء مكالمة فورية
            </p>
            <ul className="space-y-1">
              {directChats.map((chat) => (
                <li
                  key={chat.id}
                  className="p-2.5 rounded-xl flex items-center justify-between gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={chat.avatarUrl} name={chat.title} size="md" isOnline={chat.isOnline} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] truncate">
                        {chat.title}
                      </p>
                      <p className="text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                        {chat.isOnline ? 'متصل الآن' : 'متاح للمكالمات'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`مكالمة صوتية مع ${chat.title}`}
                      onClick={() => onStartCall(chat, 'audio')}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)] cursor-pointer"
                    >
                      <Phone className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`مكالمة مرئية مع ${chat.title}`}
                      onClick={() => onStartCall(chat, 'video')}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)] cursor-pointer"
                    >
                      <Video className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Call History */}
          <div>
            <p className="px-2 pb-2 text-xs font-semibold text-[#54656F] dark:text-[#8696A0]">
              سجل المكالمات الأخيرة ({filteredCalls.length})
            </p>
            {filteredCalls.length === 0 ? (
              <p className="text-xs text-center text-[#667781] py-6">لا توجد مكالمات مطابقة للفلتر الحالي.</p>
            ) : (
              <ul className="space-y-1">
                {filteredCalls.map((call) => {
                  const peerName = call.direction === 'outgoing' ? call.calleeName : call.callerName;
                  const peerAvatar = call.direction === 'outgoing' ? call.calleeAvatar : call.callerAvatar;
                  const isMissed = call.status === 'missed' || call.status === 'declined';

                  const matchingChat = chats.find((c) => c.type === 'direct' && c.title === peerName) || chats.find((c) => c.type === 'direct');

                  return (
                    <li
                      key={call.id}
                      className="p-2.5 rounded-xl flex items-center justify-between gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar src={peerAvatar} name={peerName} size="md" />
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isMissed
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-[#111B21] dark:text-[#E9EDEF]'
                            }`}
                          >
                            {peerName}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-[#54656F] dark:text-[#8696A0]">
                            {isMissed ? (
                              <PhoneMissed className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
                            ) : call.direction === 'outgoing' ? (
                              <PhoneOutgoing className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                            ) : (
                              <PhoneIncoming className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
                            )}
                            <span>{formatWhatsAppTime(call.createdAtMs)}</span>
                            {call.durationSeconds > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-code">{formatCallDuration(call.durationSeconds)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {matchingChat && (
                        <button
                          type="button"
                          aria-label={`إعادة الاتصال بـ ${peerName}`}
                          onClick={() => onStartCall(matchingChat, call.callType)}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--wa-accent)] hover:bg-[var(--wa-accent-soft)] cursor-pointer"
                        >
                          {call.callType === 'video' ? (
                            <Video className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Phone className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Right Summary Pane */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] p-8 text-center">
        <div className="max-w-sm">
          <div className="w-16 h-16 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center mx-auto mb-4">
            <Phone className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
            مكالمات صوتية ومرئية فائقة الوضوح
          </h2>
          <p className="mt-2 text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
            اتصل مباشرة بأي جهة اتصال مع تشفير WebRTC DTLS-SRTP ومزامنة فورية لسجل المكالمات عبر Firestore.
          </p>
        </div>
      </div>
    </div>
  );
}
