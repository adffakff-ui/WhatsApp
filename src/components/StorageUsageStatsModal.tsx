import { useMemo, useState } from 'react';
import {
  HardDrive,
  Trash2,
  X,
  Sparkles,
  PieChart as PieIcon,
  MessageSquare,
  ImageIcon,
  Database
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ChatRoom, DecryptedMessage } from '../types/chat';
import { formatBytes } from '../lib/storageStats';

interface StorageUsageStatsModalProps {
  open: boolean;
  onClose: () => void;
  chats: ChatRoom[];
  messagesMap: Record<string, DecryptedMessage[]>;
  onClearOldMedia?: (daysThreshold: number) => void;
  onClearChatMessages?: (chatId: string) => void;
  onShowToast?: (msg: string) => void;
}

interface ChatStorageBreakdown {
  chatId: string;
  title: string;
  isGroup: boolean;
  avatarUrl?: string;
  messageCount: number;
  mediaCount: number;
  estimatedBytes: number;
  lastMessageTimeMs: number;
}

const CHART_COLORS = ['#00A884', '#34B7F1', '#F2994A', '#8E44AD', '#E74C3C'];

export function StorageUsageStatsModal({
  open,
  onClose,
  chats,
  messagesMap,
  onClearOldMedia,
  onClearChatMessages,
  onShowToast
}: StorageUsageStatsModalProps) {
  const [cleaning, setCleaning] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number>(30);

  const breakdown = useMemo(() => {
    let totalTextBytes = 0;
    let totalMediaBytes = 0;
    let totalMessages = 0;
    let totalMediaCount = 0;

    const chatItems: ChatStorageBreakdown[] = chats.map((chat) => {
      const msgs = messagesMap[chat.id] || [];
      const messageCount = msgs.length;
      totalMessages += messageCount;

      let mediaCount = 0;
      let chatBytes = 0;
      let latestTime = chat.lastMessageAtMs || Date.now();

      for (const msg of msgs) {
        if (msg.createdAtMs > latestTime) {
          latestTime = msg.createdAtMs;
        }
        const textLen = (msg.payload?.text || '').length * 2;
        totalTextBytes += 256 + textLen;
        chatBytes += 256 + textLen;

        const payload = msg.payload || {};
        let mediaLen = 0;

        if (payload.mediaUrl) {
          mediaCount++;
          totalMediaCount++;
          mediaLen = payload.mediaUrl.length * 1.5;
        }
        if (Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0) {
          mediaCount += payload.mediaUrls.length;
          totalMediaCount += payload.mediaUrls.length;
          for (const u of payload.mediaUrls) {
            mediaLen += u.length * 1.5;
          }
        }
        if (payload.fileDataUrl) {
          mediaCount++;
          totalMediaCount++;
          mediaLen += payload.fileDataUrl.length * 1.5;
        }
        totalMediaBytes += mediaLen;
        chatBytes += mediaLen;
      }

      return {
        chatId: chat.id,
        title: chat.title || 'محادثة',
        isGroup: chat.type === 'group' || chat.type === 'community',
        avatarUrl: chat.avatarUrl,
        messageCount,
        mediaCount,
        estimatedBytes: chatBytes,
        lastMessageTimeMs: latestTime
      };
    });

    chatItems.sort((a, b) => b.estimatedBytes - a.estimatedBytes);

    const systemConfigBytes = 1024 * 64; // ~64 KB metadata & settings
    const cacheStorageBytes = 1024 * 512; // ~512 KB PWA cache estimate

    const totalBytes = totalTextBytes + totalMediaBytes + systemConfigBytes + cacheStorageBytes;

    const chartData = [
      { name: 'الوسائط والمرفقات', value: Math.max(1024, totalMediaBytes), color: '#34B7F1' },
      { name: 'رسائل ونصوص المحادثات', value: Math.max(1024, totalTextBytes), color: '#00A884' },
      { name: 'موارد التخزين المؤقت', value: cacheStorageBytes, color: '#F2994A' },
      { name: 'إعدادات وبيانات النظام', value: systemConfigBytes, color: '#8E44AD' }
    ];

    return {
      chatItems,
      totalBytes,
      totalMessages,
      totalMediaCount,
      chartData
    };
  }, [chats, messagesMap]);

  if (!open) return null;

  const handleCleanOldMedia = () => {
    if (
      !window.confirm(
        `هل أنت متأكد من تنظيف الوسائط والرسائل القديمة الأقدم من ${daysFilter} يوماً؟ سيتم تحرير مساحة التخزين بذكاء.`
      )
    ) {
      return;
    }
    setCleaning(true);
    try {
      onClearOldMedia?.(daysFilter);
      onShowToast?.(`تم تنظيف الوسائط الأقدم من ${daysFilter} يوماً بنجاح وتحرير المساحة.`);
    } catch {
      onShowToast?.('تعذر إتمام عملية التنظيف.');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fadeIn"
    >
      <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3 bg-[#F8FAFB] dark:bg-[#202C33]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C] flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold truncate">إحصائيات استهلاك التخزين (StorageUsageStats)</h2>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                توزيع المساحة التخزينية ورسم بياني تفصيلي وإدارة ذكية للوسائط
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-9 h-9 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 no-scrollbar">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] block">إجمالي التخزين المستهلك</span>
              <p className="text-lg font-bold font-mono-code text-[#008069] dark:text-[#06CF9C]" dir="ltr">
                {formatBytes(breakdown.totalBytes)}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] block">إجمالي الرسائل</span>
              <p className="text-lg font-bold font-mono-code" dir="ltr">
                {breakdown.totalMessages} رسالة
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0] block">الوسائط والمرفقات</span>
              <p className="text-lg font-bold font-mono-code" dir="ltr">
                {breakdown.totalMediaCount} عنصر
              </p>
            </div>
          </div>

          {/* Recharts Pie Chart Section */}
          <div className="p-5 rounded-3xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                <span>توزيع استهلاك التخزين حسب الفئة</span>
              </h3>
              <span className="text-[10px] font-mono-code text-[#54656F] dark:text-[#8696A0]">
                رسم بياني تفاعلي
              </span>
            </div>

            <div className="w-full h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown.chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {breakdown.chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown) => [
                      formatBytes(typeof value === 'number' ? value : Number(value) || 0),
                      'الحجم المقدر'
                    ]}
                    contentStyle={{
                      backgroundColor: '#111B21',
                      border: '1px solid #374248',
                      borderRadius: '12px',
                      color: '#E9EDEF',
                      fontSize: '12px',
                      direction: 'rtl'
                    }}
                  />
                  <Legend
                    formatter={(value) => <span className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF]">{value}</span>}
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Smart Cleanup Action Card */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-l from-[#008069]/10 via-[#00A884]/15 to-emerald-500/10 border border-[#00A884]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#008069] dark:text-[#06CF9C]">
                <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>تنظيف الوسائط القديمة بذكاء</span>
              </div>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                تحرير المساحة عبر إزالة مرفقات الوسائط الأقدم من الفترة المحددة دون فقدان سجل المحادثات والنصوص.
              </p>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
              <select
                aria-label="الفترة الزمنية لتنظيف الوسائط"
                value={daysFilter}
                onChange={(e) => setDaysFilter(Number(e.target.value))}
                className="rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] px-3 py-2 text-xs font-semibold focus:outline-none"
              >
                <option value={7}>أقدم من 7 أيام</option>
                <option value={14}>أقدم من 14 يوماً</option>
                <option value={30}>أقدم من 30 يوماً</option>
                <option value={90}>أقدم من 3 أشهر</option>
              </select>

              <button
                type="button"
                disabled={cleaning}
                onClick={handleCleanOldMedia}
                className="px-4 py-2.5 rounded-xl bg-[#00A884] hover:bg-[#008069] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
              >
                {cleaning ? 'جاري التنظيف...' : 'تنظيف الوسائط القديمة'}
              </button>
            </div>
          </div>

          {/* Per-Chat Breakdown List */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-[#111B21] dark:text-[#E9EDEF] flex items-center justify-between">
              <span>قائمة تفصيلية بحجم كل محادثة</span>
              <span className="text-[10px] font-mono-code text-[#54656F] dark:text-[#8696A0]">
                {breakdown.chatItems.length} محادثة نشطة
              </span>
            </h3>

            <div className="rounded-2xl border border-[#E9EDEF] dark:border-[#2A3942] overflow-hidden max-h-72 overflow-y-auto divide-y divide-[#E9EDEF] dark:divide-[#2A3942]">
              {breakdown.chatItems.map((item) => (
                <div
                  key={item.chatId}
                  className="px-4 py-3 flex items-center justify-between gap-3 bg-white dark:bg-[#111B21] hover:bg-[#F8FAFB] dark:hover:bg-[#202C33]/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[var(--wa-accent-soft)] dark:bg-[#202C33] text-[var(--wa-accent)] flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        item.title.slice(0, 2)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate flex items-center gap-2">
                        <span>{item.messageCount} رسالة</span>
                        <span>·</span>
                        <span>{item.mediaCount} عنصر وسائط</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono-code text-xs font-bold text-[#008069] dark:text-[#06CF9C]" dir="ltr">
                      {formatBytes(item.estimatedBytes)}
                    </span>
                    {onClearChatMessages && (
                      <button
                        type="button"
                        aria-label="مسح رسائل المحادثة"
                        onClick={() => {
                          if (window.confirm(`هل تريد مسح رسائل محادثة "${item.title}" بالكامل لتحرير المساحة؟`)) {
                            onClearChatMessages(item.chatId);
                            onShowToast?.(`تم مسح رسائل محادثة ${item.title}.`);
                          }
                        }}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {breakdown.chatItems.length === 0 && (
                <div className="py-10 text-center text-xs text-[#54656F] dark:text-[#8696A0]">
                  لا توجد محادثات نشطة حالياً.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
