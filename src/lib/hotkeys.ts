export interface HotkeyItem {
  id: string;
  category: 'chats' | 'messaging' | 'system';
  keys: string[]; // e.g. ['Ctrl', 'N'] or ['⌘', 'N']
  macKeys?: string[];
  label: string;
  description: string;
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '');
}

export const HOTKEYS_CATALOG: HotkeyItem[] = [
  {
    id: 'new-chat',
    category: 'chats',
    keys: ['Ctrl', 'N'],
    macKeys: ['⌘', 'N'],
    label: 'محادثة جديدة',
    description: 'فتح نافذة بدء محادثة مشفرة جديدة فوراً'
  },
  {
    id: 'search-chats',
    category: 'chats',
    keys: ['Ctrl', 'K'],
    macKeys: ['⌘', 'K'],
    label: 'البحث في المحادثات',
    description: 'التركيز السريع على شريط البحث في الدردشات والرسائل'
  },
  {
    id: 'new-group',
    category: 'chats',
    keys: ['Ctrl', 'Shift', 'N'],
    macKeys: ['⌘', 'Shift', 'N'],
    label: 'مجموعة جديدة',
    description: 'إنشاء مجموعة مشفرة جديدة متعددة الأطراف'
  },
  {
    id: 'send-message',
    category: 'messaging',
    keys: ['Ctrl', 'Enter'],
    macKeys: ['⌘', 'Enter'],
    label: 'إرسال الرسالة',
    description: 'إرسال الرسالة الحالية المشفرة إلى الطرف الآخر'
  },
  {
    id: 'newline-message',
    category: 'messaging',
    keys: ['Shift', 'Enter'],
    label: 'سطر جديد',
    description: 'إضافة سطر جديد داخل صندوق كتابة الرسالة دون إرسالها'
  },
  {
    id: 'next-chat',
    category: 'chats',
    keys: ['Alt', '↓'],
    macKeys: ['⌥', '↓'],
    label: 'المحادثة التالية',
    description: 'الانتقال إلى المحادثة التالية في القائمة'
  },
  {
    id: 'prev-chat',
    category: 'chats',
    keys: ['Alt', '↑'],
    macKeys: ['⌥', '↑'],
    label: 'المحادثة السابقة',
    description: 'الانتقال إلى المحادثة السابقة في القائمة'
  },
  {
    id: 'open-settings',
    category: 'system',
    keys: ['Ctrl', ','],
    macKeys: ['⌘', ','],
    label: 'الإعدادات',
    description: 'فتح شاشة الإعدادات والخصوصية والأمان'
  },
  {
    id: 'lock-app',
    category: 'system',
    keys: ['Ctrl', 'Shift', 'L'],
    macKeys: ['⌘', 'Shift', 'L'],
    label: 'قفل التطبيق',
    description: 'قفل الجلسة فورياً وحماية المفاتيح المشفرة'
  },
  {
    id: 'toggle-dnd',
    category: 'system',
    keys: ['Ctrl', 'Shift', 'D'],
    macKeys: ['⌘', 'Shift', 'D'],
    label: 'وضع عدم الإزعاج',
    description: 'تبديل وضع حظر الإشعارات والمكالمات الواردة'
  },
  {
    id: 'shortcuts-help',
    category: 'system',
    keys: ['Ctrl', '/'],
    macKeys: ['⌘', '/'],
    label: 'دليل الاختصارات',
    description: 'عرض القائمة الكاملة لاختصارات لوحة المفاتيح'
  },
  {
    id: 'escape-action',
    category: 'system',
    keys: ['Esc'],
    label: 'إلغاء / رجوع',
    description: 'إغلاق النوافذ المنبثقة، إلغاء البحث، أو إلغاء تعديل الرسائل'
  }
];

/**
 * Returns the cycle next/prev chat ID given a list of rooms and current active chat ID.
 */
export function getNextChatId(
  chats: Array<{ id: string }>,
  currentChatId: string | null,
  direction: 'next' | 'prev'
): string | null {
  if (!chats || chats.length === 0) return null;
  if (!currentChatId) return chats[0].id;

  const currentIndex = chats.findIndex((c) => c.id === currentChatId);
  if (currentIndex === -1) return chats[0].id;

  if (direction === 'next') {
    const nextIdx = (currentIndex + 1) % chats.length;
    return chats[nextIdx].id;
  } else {
    const prevIdx = (currentIndex - 1 + chats.length) % chats.length;
    return chats[prevIdx].id;
  }
}

/**
 * Checks if a keyboard event matches a specific hotkey combination.
 */
export function isHotkeyMatch(
  e: KeyboardEvent,
  hotkey: {
    ctrlOrMeta?: boolean;
    shift?: boolean;
    alt?: boolean;
    key: string;
  }
): boolean {
  const hasCtrlOrMeta = Boolean(e.ctrlKey || e.metaKey);
  if (Boolean(hotkey.ctrlOrMeta) !== hasCtrlOrMeta) return false;
  if (Boolean(hotkey.shift) !== Boolean(e.shiftKey)) return false;
  if (Boolean(hotkey.alt) !== Boolean(e.altKey)) return false;

  return e.key.toLowerCase() === hotkey.key.toLowerCase();
}
