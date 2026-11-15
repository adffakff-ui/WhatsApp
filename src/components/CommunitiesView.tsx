import { Users, Plus, Lock, ArrowLeft } from 'lucide-react';
import { Avatar } from './Avatar';
import { formatWhatsAppTime } from '../lib/chatLogic';
import type { ChatRoom } from '../types/chat';

interface CommunitiesViewProps {
  communities: ChatRoom[];
  onSelectCommunity: (chatId: string) => void;
  onCreateGroup: () => void;
}

export function CommunitiesView({
  communities,
  onSelectCommunity,
  onCreateGroup
}: CommunitiesViewProps) {
  return (
    <div className="flex-1 flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      <div className="w-full md:w-96 border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full">
        <header className="h-16 px-4 flex items-center justify-between border-b border-[#F0F2F5] dark:border-[#222D34]">
          <h1 className="font-display text-xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
            المجتمعات والمجموعات
          </h1>
          <button
            type="button"
            onClick={onCreateGroup}
            className="px-3.5 py-2 rounded-full bg-[#00A884] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#008069] cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>مجموعة جديدة</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-20 md:pb-4">
          {communities.length === 0 ? (
            <div className="py-12 text-center px-4">
              <p className="text-sm text-[#54656F] dark:text-[#8696A0]">لا توجد مجتمعات أو مجموعات بعد.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {communities.map((comm) => (
                <li key={comm.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCommunity(comm.id)}
                    className="w-full p-3 rounded-xl flex items-center gap-3 hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] text-right transition-colors cursor-pointer"
                  >
                    <Avatar src={comm.avatarUrl} name={comm.title} size="lg" isGroup />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                          {comm.title}
                        </p>
                        <span className="text-[11px] font-mono-code text-[#667781] dark:text-[#8696A0]">
                          {formatWhatsAppTime(comm.lastMessageAtMs)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#54656F] dark:text-[#8696A0] truncate">
                        {comm.lastMessagePreview}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="hidden md:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] p-8 text-center">
        <div className="max-w-sm">
          <div className="w-16 h-16 rounded-full bg-[#00A884]/15 text-[#00A884] flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8" aria-hidden="true" />
          </div>
          <h2 className="font-display text-lg font-bold text-[#111B21] dark:text-[#E9EDEF]">
            إدارة المجموعات والقنوات المشفرة
          </h2>
          <p className="mt-2 text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
            اجمع الفرق والمجتمعات في مساحة واحدة مع استطلاعات الرأي، مشاركة الملفات، وتشفير تام بين الأعضاء.
          </p>
          <button
            type="button"
            onClick={onCreateGroup}
            className="mt-5 px-5 py-2.5 rounded-full bg-[#00A884] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#008069] cursor-pointer"
          >
            <span>إنشاء مجموعة الآن</span>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[#667781] dark:text-[#8696A0]">
            <Lock className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
            <span>مجموعات محمية بمفاتيح AES-GCM-256</span>
          </div>
        </div>
      </div>
    </div>
  );
}
