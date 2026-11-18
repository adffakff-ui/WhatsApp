import { Star, MessageSquareText } from 'lucide-react';
import { formatWhatsAppTime } from '../lib/chatLogic';
import type { ChatRoom, DecryptedMessage } from '../types/chat';

interface StarredViewProps {
  messagesMap: Record<string, DecryptedMessage[]>;
  chats: ChatRoom[];
  myUid: string;
  onJumpToChat: (chatId: string) => void;
}

export function StarredView({
  messagesMap,
  chats,
  myUid,
  onJumpToChat
}: StarredViewProps) {
  const starredItems: { chat: ChatRoom; msg: DecryptedMessage }[] = [];

  for (const chat of chats) {
    const msgs = messagesMap[chat.id] || [];
    for (const msg of msgs) {
      if (msg.starredBy.includes(myUid) && !msg.isDeleted) {
        starredItems.push({ chat, msg });
      }
    }
  }

  starredItems.sort((a, b) => b.msg.createdAtMs - a.msg.createdAtMs);

  return (
    <div className="flex-1 min-w-0 w-full max-w-full overflow-hidden flex flex-col h-full bg-white dark:bg-[#111B21]">
      <header className="h-16 px-4 md:px-6 flex items-center gap-3 border-b border-[#E9EDEF] dark:border-[#222D34] shrink-0 min-w-0">
        <Star className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0" aria-hidden="true" />
        <h1 className="font-display text-lg sm:text-xl font-bold text-[#111B21] dark:text-[#E9EDEF] truncate min-w-0">
          الرسائل المميزة بنجمة
        </h1>
      </header>

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24 md:pb-6">
        {starredItems.length === 0 ? (
          <div className="py-16 text-center max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-full bg-amber-400/15 text-amber-500 flex items-center justify-center mx-auto mb-3">
              <Star className="w-6 h-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF]">
              لا توجد رسائل مميزة بنجمة
            </p>
            <p className="mt-1.5 text-xs text-[#54656F] dark:text-[#8696A0]">
              مرر فوق أي رسالة واختر «تمييز بنجمة» لحفظها هنا للرجوع إليها بسرعة.
            </p>
          </div>
        ) : (
          <ul className="max-w-2xl space-y-3">
            {starredItems.map(({ chat, msg }) => (
              <li key={msg.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onJumpToChat(chat.id)}
                  className="w-full text-right p-4 rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33] hover:brightness-95 transition-all cursor-pointer min-w-0 overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[#54656F] dark:text-[#8696A0] mb-1.5 min-w-0">
                    <span className="font-semibold text-[var(--wa-accent-strong)] flex items-center gap-1.5 min-w-0 truncate">
                      <MessageSquareText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{chat.title} · {msg.senderName}</span>
                    </span>
                    <span className="font-mono-code shrink-0">{formatWhatsAppTime(msg.createdAtMs)}</span>
                  </div>
                  <p className="text-sm text-[#111B21] dark:text-[#E9EDEF] leading-relaxed break-words">
                    {msg.payload.text}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
