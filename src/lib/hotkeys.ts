export interface HotkeyItem {
  id: string;
  category: 'chats' | 'messaging' | 'system';
  keys: string[]; // e.g. ['Ctrl', 'N'] or ['⌘', 'N']
  macKeys?: string[];
  slashCommand?: string;
  mobileActionLabel?: string;
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
    slashCommand: '/new',
    mobileActionLabel: 'لمسة سريعة',
    label: 'محادثة جديدة',
    description: 'فتح نافذة بدء محادثة مشفرة جديدة فوراً'
  },
  {
    id: 'search-chats',
    category: 'chats',
    keys: ['Ctrl', 'K'],
    macKeys: ['⌘', 'K'],
    slashCommand: '/search',
    mobileActionLabel: 'لمسة سريعة',
    label: 'البحث في المحادثات',
    description: 'التركيز السريع على شريط البحث في الدردشات والرسائل'
  },
  {
    id: 'new-group',
    category: 'chats',
    keys: ['Ctrl', 'Shift', 'N'],
    macKeys: ['⌘', 'Shift', 'N'],
    slashCommand: '/group',
    mobileActionLabel: 'لمسة سريعة',
    label: 'مجموعة جديدة',
    description: 'إنشاء مجموعة مشفرة جديدة متعددة الأطراف'
  },
  {
    id: 'send-message',
    category: 'messaging',
    keys: ['Ctrl', 'Enter'],
    macKeys: ['⌘', 'Enter'],
    mobileActionLabel: 'زر الإرسال في لوحة الجوال',
    label: 'إرسال الرسالة',
    description: 'إرسال الرسالة الحالية فوراً (يدعم زر الإرسال في لوحة مفاتيح الجوال)'
  },
  {
    id: 'newline-message',
    category: 'messaging',
    keys: ['Shift', 'Enter'],
    mobileActionLabel: 'زر ↵ داخل الشريط',
    label: 'سطر جديد',
    description: 'إضافة سطر جديد داخل صندوق كتابة الرسالة دون إرسالها'
  },
  {
    id: 'next-chat',
    category: 'chats',
    keys: ['Alt', '↓'],
    macKeys: ['⌥', '↓'],
    slashCommand: '/next',
    mobileActionLabel: 'لمسة سريعة',
    label: 'المحادثة التالية',
    description: 'الانتقال إلى المحادثة التالية في القائمة'
  },
  {
    id: 'prev-chat',
    category: 'chats',
    keys: ['Alt', '↑'],
    macKeys: ['⌥', '↑'],
    slashCommand: '/prev',
    mobileActionLabel: 'لمسة سريعة',
    label: 'المحادثة السابقة',
    description: 'الانتقال إلى المحادثة السابقة في القائمة'
  },
  {
    id: 'open-settings',
    category: 'system',
    keys: ['Ctrl', ','],
    macKeys: ['⌘', ','],
    slashCommand: '/settings',
    mobileActionLabel: 'لمسة سريعة',
    label: 'الإعدادات والأمان',
    description: 'فتح شاشة الإعدادات والخصوصية وقفل التطبيق'
  },
  {
    id: 'lock-app',
    category: 'system',
    keys: ['Ctrl', 'Shift', 'L'],
    macKeys: ['⌘', 'Shift', 'L'],
    slashCommand: '/lock',
    mobileActionLabel: 'قفل فوري بلمسة',
    label: 'قفل التطبيق فوراً',
    description: 'قفل الجلسة فورياً وحماية المفاتيح والمحادثات المشفرة'
  },
  {
    id: 'toggle-dnd',
    category: 'system',
    keys: ['Ctrl', 'Shift', 'D'],
    macKeys: ['⌘', 'Shift', 'D'],
    slashCommand: '/dnd',
    mobileActionLabel: 'تبديل فوري',
    label: 'وضع عدم الإزعاج',
    description: 'تبديل وضع حظر الإشعارات والمكالمات الواردة'
  },
  {
    id: 'shortcuts-help',
    category: 'system',
    keys: ['Ctrl', '/'],
    macKeys: ['⌘', '/'],
    slashCommand: '/shortcuts',
    mobileActionLabel: 'قائمة الأوامر',
    label: 'دليل الاختصارات والأوامر',
    description: 'عرض وتنفيذ الاختصارات والأوامر السريعة على الجوال والكمبيوتر'
  },
  {
    id: 'escape-action',
    category: 'system',
    keys: ['Esc'],
    label: 'إلغاء / رجوع',
    description: 'إغلاق النوافذ المنبثقة، إلغاء البحث، أو إلغاء تعديل الرسائل'
  }
];

export interface MobileSlashCommand {
  id: string;
  command: string;
  aliases: string[];
  label: string;
  description: string;
}

export const MOBILE_SLASH_COMMANDS: MobileSlashCommand[] = [
  {
    id: 'lock-app',
    command: '/lock',
    aliases: ['/lock', '/قفل'],
    label: 'قفل التطبيق فوراً',
    description: 'إغلاق الجلسة بشاشة القفل والبصمة'
  },
  {
    id: 'search-in-chat',
    command: '/search',
    aliases: ['/search', '/بحث'],
    label: 'البحث داخل المحادثة',
    description: 'فتح شريط البحث داخل رسائل الدردشة'
  },
  {
    id: 'voice-record',
    command: '/voice',
    aliases: ['/voice', '/صوت'],
    label: 'تسجيل رسالة صوتية',
    description: 'بدء تسجيل رسالة صوتية عبر الميكروفون'
  },
  {
    id: 'new-chat',
    command: '/new',
    aliases: ['/new', '/جديد'],
    label: 'محادثة جديدة',
    description: 'بدء محادثة مشفرة مع جهة اتصال'
  },
  {
    id: 'new-group',
    command: '/group',
    aliases: ['/group', '/مجموعة'],
    label: 'مجموعة جديدة',
    description: 'إنشاء مجموعة مشفرة متعددة الأطراف'
  },
  {
    id: 'toggle-dnd',
    command: '/dnd',
    aliases: ['/dnd', '/ازعاج'],
    label: 'تبديل عدم الإزعاج',
    description: 'تشغيل أو إيقاف كتم الإشعارات والمكالمات'
  },
  {
    id: 'next-chat',
    command: '/next',
    aliases: ['/next', '/التالي'],
    label: 'المحادثة التالية',
    description: 'الانتقال السريع إلى المحادثة التالية'
  },
  {
    id: 'prev-chat',
    command: '/prev',
    aliases: ['/prev', '/السابق'],
    label: 'المحادثة السابقة',
    description: 'الانتقال السريع إلى المحادثة السابقة'
  },
  {
    id: 'open-settings',
    command: '/settings',
    aliases: ['/settings', '/اعدادات'],
    label: 'الإعدادات والأمان',
    description: 'الانتقال إلى إعدادات الخصوصية والقفل'
  },
  {
    id: 'shortcuts-help',
    command: '/shortcuts',
    aliases: ['/shortcuts', '/اختصارات'],
    label: 'كل الاختصارات السريعة',
    description: 'فتح لوحة الأوامر والاختصارات التفاعلية'
  }
];

/**
 * Matches mobile slash commands typed at the start of the chat composer.
 * Only triggers on single-line queries starting with '/' and no spaces yet.
 */
export function matchMobileSlashCommands(inputText: string): MobileSlashCommand[] {
  const trimmed = inputText.trimStart();
  if (!trimmed.startsWith('/')) return [];
  if (/\s/.test(trimmed)) return [];
  const query = trimmed.toLowerCase();
  if (query === '/') return MOBILE_SLASH_COMMANDS;
  return MOBILE_SLASH_COMMANDS.filter(
    (item) =>
      item.command.toLowerCase().startsWith(query) ||
      item.aliases.some((alias) => alias.toLowerCase().startsWith(query)) ||
      item.label.toLowerCase().includes(query.slice(1))
  );
}

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

const KEY_TO_CODES: Record<string, string[]> = {
  n: ['KeyN'],
  k: ['KeyK'],
  l: ['KeyL'],
  d: ['KeyD'],
  '/': ['Slash', 'IntlRo', 'NumpadDivide'],
  ',': ['Comma'],
  enter: ['Enter', 'NumpadEnter'],
  arrowdown: ['ArrowDown'],
  arrowup: ['ArrowUp'],
  escape: ['Escape']
};

/**
 * Checks if a keyboard event matches a specific hotkey combination.
 * Supports both e.key and physical e.code so Arabic/bilingual keyboards
 * on mobile tablets, phones, and desktops trigger shortcuts reliably.
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

  const normalizedKey = hotkey.key.toLowerCase();
  if (typeof e.key === 'string' && e.key.toLowerCase() === normalizedKey) {
    return true;
  }
  if (typeof e.code === 'string' && e.code) {
    const expectedCodes = KEY_TO_CODES[normalizedKey];
    if (expectedCodes && expectedCodes.includes(e.code)) {
      return true;
    }
  }
  return false;
}

