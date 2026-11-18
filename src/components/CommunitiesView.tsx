import { useMemo, useState } from 'react';
import {
  Users,
  Plus,
  Lock,
  ArrowLeft,
  Megaphone,
  Search,
  Pin,
  VolumeX,
  Volume2,
  Copy,
  Check,
  ShieldCheck,
  Radio,
  Sparkles
} from 'lucide-react';
import { BUNDLED_ASSETS } from '../data/assets';
import { Avatar } from './Avatar';
import { buildChannelInviteCode, formatWhatsAppTime } from '../lib/chatLogic';
import type { ChatRoom } from '../types/chat';

export interface SuggestedChannelItem {
  id: string;
  title: string;
  description: string;
  followersLabel: string;
  avatarUrl: string;
}

const SUGGESTED_CHANNELS: SuggestedChannelItem[] = [
  {
    id: 'channel_wasil_updates',
    title: 'قناة تحديثات تواصل الرسمية',
    description: 'أخبار التطوير، ميزات الخصوصية الجديدة، وإصدارات الأمان الفورية.',
    followersLabel: '48.2K متابع',
    avatarUrl: BUNDLED_ASSETS.avatarTechGroup
  },
  {
    id: 'channel_cyber_alerts',
    title: 'قناة الأمن السيبراني والتشفير',
    description: 'تنبيهات حماية الحسابات وأفضل الممارسات للتواصل المشفر.',
    followersLabel: '19.5K متابع',
    avatarUrl: BUNDLED_ASSETS.avatarOmar
  }
];

interface CommunitiesViewProps {
  communities: ChatRoom[];
  onSelectCommunity: (chatId: string) => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
  onJoinSuggestedChannel: (channel: SuggestedChannelItem) => Promise<void>;
  onTogglePin: (chatId: string) => void;
  onToggleMute: (chatId: string) => void;
}

type CommunityFilter = 'all' | 'groups' | 'channels' | 'pinned';

export function CommunitiesView({
  communities,
  onSelectCommunity,
  onCreateGroup,
  onCreateChannel,
  onJoinSuggestedChannel,
  onTogglePin,
  onToggleMute
}: CommunitiesViewProps) {
  const [filter, setFilter] = useState<CommunityFilter>('all');
  const [search, setSearch] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return communities
      .filter((room) => {
        if (filter === 'groups' && room.type !== 'group') return false;
        if (filter === 'channels' && room.type !== 'community') return false;
        if (filter === 'pinned' && !room.pinned) return false;
        if (q) {
          return (
            room.title.toLowerCase().includes(q) ||
            room.description.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.lastMessageAtMs - a.lastMessageAtMs;
      });
  }, [communities, filter, search]);

  const unjoinedSuggestions = useMemo(
    () => SUGGESTED_CHANNELS.filter((s) => !communities.some((c) => c.id === s.id)),
    [communities]
  );

  const handleCopyInvite = (room: ChatRoom) => {
    const code = room.inviteCode || buildChannelInviteCode(room.id);
    const link = `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
    void navigator.clipboard?.writeText(link);
    setCopiedInviteId(room.id);
    window.setTimeout(() => setCopiedInviteId(null), 2000);
  };

  return (
    <div className="flex-1 min-w-0 w-full max-w-full overflow-hidden flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      <div className="w-full max-w-full min-w-0 md:w-[410px] lg:w-[430px] border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full md:shrink-0 overflow-hidden">
        <header className="h-16 px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0 min-w-0">
          <h1 className="font-display text-base sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] min-w-0 truncate">
            القنوات والمجموعات
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onCreateChannel}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-[11px] sm:text-xs font-bold flex items-center gap-1 hover:brightness-95 cursor-pointer whitespace-nowrap"
            >
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
              <span>قناة جديدة</span>
            </button>
            <button
              type="button"
              onClick={onCreateGroup}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-[var(--wa-accent)] text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1 hover:brightness-95 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>مجموعة</span>
            </button>
          </div>
        </header>

        {/* Search & Category Filter Bar */}
        <div className="p-3 space-y-2.5 border-b border-[#F0F2F5] dark:border-[#222D34] shrink-0">
          <div className="flex items-center bg-[#F0F2F5] dark:bg-[#202C33] rounded-xl px-3 h-9">
            <Search className="w-4 h-4 text-[#54656F] dark:text-[#8696A0] ml-2 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في المجموعات والقنوات..."
              aria-label="بحث في المجموعات والقنوات"
              className="w-full bg-transparent text-xs text-[#111B21] dark:text-[#E9EDEF] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all' as CommunityFilter, label: `الكل (${communities.length})` },
              {
                id: 'groups' as CommunityFilter,
                label: `المجموعات (${communities.filter((c) => c.type === 'group').length})`
              },
              {
                id: 'channels' as CommunityFilter,
                label: `القنوات (${communities.filter((c) => c.type === 'community').length})`
              },
              {
                id: 'pinned' as CommunityFilter,
                label: `المثبتة (${communities.filter((c) => c.pinned).length})`
              }
            ].map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)]'
                      : 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-4 pb-24 md:pb-6">
          {filteredRooms.length === 0 ? (
            <div className="py-10 text-center px-4">
              <p className="text-sm text-[#54656F] dark:text-[#8696A0]">
                لا توجد مجموعات أو قنوات مطابقة للفلتر الحالي.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredRooms.map((comm) => {
                const isChannel = comm.type === 'community';
                return (
                  <li
                    key={comm.id}
                    className="p-2.5 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] hover:bg-[#F0F2F5] dark:hover:bg-[#202C33] transition-colors flex items-center gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectCommunity(comm.id)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-right cursor-pointer"
                    >
                      <Avatar src={comm.avatarUrl} name={comm.title} size="lg" isGroup />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                              {comm.title}
                            </p>
                            {isChannel ? (
                              <Megaphone className="w-3.5 h-3.5 text-[var(--wa-accent)] shrink-0" aria-label="قناة" />
                            ) : (
                              <Users className="w-3.5 h-3.5 text-[#54656F] shrink-0" aria-label="مجموعة" />
                            )}
                          </div>
                          <span className="text-[10px] font-mono-code text-[#667781] dark:text-[#8696A0] shrink-0">
                            {formatWhatsAppTime(comm.lastMessageAtMs)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                          {comm.memberIds.length} عضو · {comm.adminOnlyPost ? 'بث المشرفين فقط' : 'مشاركة مفتوحة'}
                        </p>
                        <p className="mt-0.5 text-xs text-[#54656F] dark:text-[#AEBAC1] truncate">
                          {comm.lastMessagePreview}
                        </p>
                      </div>
                    </button>

                    {/* Sibling Quick Controls (Pin, Mute, Copy Invite) */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={comm.pinned ? `إلغاء تثبيت ${comm.title}` : `تثبيت ${comm.title}`}
                        onClick={() => onTogglePin(comm.id)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${
                          comm.pinned
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'text-[#667781] hover:bg-black/5 dark:hover:bg-white/10'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={comm.muted ? `إلغاء كتم ${comm.title}` : `كتم ${comm.title}`}
                        onClick={() => onToggleMute(comm.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#667781] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      >
                        {comm.muted ? (
                          <VolumeX className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`نسخ رابط دعوة ${comm.title}`}
                        onClick={() => handleCopyInvite(comm)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#667781] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                      >
                        {copiedInviteId === comm.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Discoverable Channels Section */}
          {unjoinedSuggestions.length > 0 && (
            <section aria-label="قنوات مقترحة للانضمام" className="pt-2 border-t border-[#F0F2F5] dark:border-[#222D34] space-y-2.5">
              <p className="text-xs font-bold text-[var(--wa-accent-strong)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>قنوات موثّقة مقترحة للانضمام</span>
              </p>
              <ul className="space-y-2">
                {unjoinedSuggestions.map((ch) => (
                  <li
                    key={ch.id}
                    className="p-3 rounded-xl bg-[#F8FAFB] dark:bg-[#182229] border border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={ch.avatarUrl} name={ch.title} size="md" isGroup />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {ch.title}
                        </p>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                          {ch.followersLabel} · {ch.description}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={joiningChannelId === ch.id}
                      onClick={() => {
                        setJoiningChannelId(ch.id);
                        void onJoinSuggestedChannel(ch).finally(() => setJoiningChannelId(null));
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-[var(--wa-accent)] text-white text-xs font-bold shrink-0 hover:brightness-95 cursor-pointer disabled:opacity-60"
                    >
                      {joiningChannelId === ch.id ? 'جاري الانضمام...' : 'متابعة'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* Right Workspace Overview */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] p-8 text-center">
        <div className="max-w-md bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] rounded-2xl p-8 space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
              إدارة متقدمة للمجموعات والقنوات الإخبارية
            </h2>
            <p className="mt-2 text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
              أنشئ قنوات إخبارية ببث للمشرفين فقط أو مجموعات تفاعلية مع روابط دعوة سريعة، استطلاعات رأي، ومفاتيح تشفير AES-GCM-256.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onCreateChannel}
              className="px-4 py-2.5 rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-accent-strong)] text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-95 cursor-pointer"
            >
              <Radio className="w-4 h-4" aria-hidden="true" />
              <span>إنشاء قناة جديدة</span>
            </button>
            <button
              type="button"
              onClick={onCreateGroup}
              className="px-4 py-2.5 rounded-full bg-[var(--wa-accent)] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-95 cursor-pointer"
            >
              <span>إنشاء مجموعة</span>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#667781] dark:text-[#8696A0]">
            <Lock className="w-3.5 h-3.5 text-[var(--wa-accent)]" aria-hidden="true" />
            <span>حماية كاملة للرسائل والأعضاء · P2P & Group E2EE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
