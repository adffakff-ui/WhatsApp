import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Lock } from 'lucide-react';
import { Avatar } from './Avatar';
import { formatCallDuration, formatWhatsAppTime } from '../lib/chatLogic';
import type { CallRecord, ChatRoom } from '../types/chat';

interface CallsViewProps {
  calls: CallRecord[];
  chats: ChatRoom[];
  onStartCall: (chat: ChatRoom, callType: 'audio' | 'video') => void;
}

export function CallsView({ calls, chats, onStartCall }: CallsViewProps) {
  const directChats = chats.filter((c) => c.type === 'direct');

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full bg-white dark:bg-[#111B21]">
      <div className="w-full md:w-96 border-l border-[#E9EDEF] dark:border-[#222D34] flex flex-col h-full">
        <header className="h-16 px-4 flex items-center justify-between border-b border-[#F0F2F5] dark:border-[#222D34]">
          <h1 className="font-display text-xl font-bold text-[#111B21] dark:text-[#E9EDEF]">
            المكالمات
          </h1>
          <span className="text-xs text-[#54656F] dark:text-[#8696A0] flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
            <span>مشفرة تماماً</span>
          </span>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-5 pb-20 md:pb-4">
          {/* Quick call contacts */}
          <div>
            <p className="px-2 pb-2 text-xs font-semibold text-[#008069] dark:text-[#06CF9C]">
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
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[#00A884] hover:bg-[#D9FDD3]/60 dark:hover:bg-[#0A332C] cursor-pointer"
                    >
                      <Phone className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`مكالمة مرئية مع ${chat.title}`}
                      onClick={() => onStartCall(chat, 'video')}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[#00A884] hover:bg-[#D9FDD3]/60 dark:hover:bg-[#0A332C] cursor-pointer"
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
              سجل المكالمات الأخيرة
            </p>
            {calls.length === 0 ? (
              <p className="text-xs text-center text-[#667781] py-6">لا توجد مكالمات مسجلة بعد.</p>
            ) : (
              <ul className="space-y-1">
                {calls.map((call) => {
                  const peerName = call.direction === 'outgoing' ? call.calleeName : call.callerName;
                  const peerAvatar = call.direction === 'outgoing' ? call.calleeAvatar : call.callerAvatar;
                  const isMissed = call.status === 'missed' || call.status === 'declined';

                  const matchingChat = directChats.find((c) => c.title === peerName) || directChats[0];

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
                              <PhoneOutgoing className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
                            ) : (
                              <PhoneIncoming className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
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
                          className="w-9 h-9 rounded-full flex items-center justify-center text-[#00A884] hover:bg-[#D9FDD3]/60 dark:hover:bg-[#0A332C] cursor-pointer"
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
          <div className="w-16 h-16 rounded-full bg-[#00A884]/15 text-[#00A884] flex items-center justify-center mx-auto mb-4">
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
