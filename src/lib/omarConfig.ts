import type {
  BubbleStyleId,
  ChatWallpaperId,
  FontSizePref,
  OmarSettings,
  OmarThemeId
} from '../types/chat';

export const DEFAULT_OMAR_SETTINGS: OmarSettings = {
  omarTheme: 'emerald',
  wallpaper: 'pattern',
  bubbleStyle: 'modern',
  fontSize: 'md',
  freezeLastSeen: false,
  hideViewStatus: false,
  antiDeleteMessages: true,
  antiDeleteStatuses: true,
  hideReadTicks: false,
  hideTypingIndicator: false,
  autoReplyEnabled: false,
  autoReplyMessage: 'شكراً لتواصلك، أنا مشغول حالياً وسأرد عليك في أقرب وقت ممكن ✨',
  quickTemplates: [
    'وعليكم السلام ورحمة الله وبركاته 🌿',
    'أبشر، سأراجع الموضوع وأرد عليك فوراً 👍',
    'في اجتماع حالياً، أتواصل معك بعد قليل',
    'تم الاستلام بنجاح، شكراً لك ✨'
  ],
  lockedChatIds: [],
  chatLockPin: '1234',
  appLockOnLaunch: false,
  lockMethod: 'pin',
  biometricCredentialId: '',
  biometricEnrolledAtMs: 0,
  biometricDeviceLabel: '',
  dndMode: false,
  showStoriesTray: true
};

export interface OmarThemeMeta {
  id: OmarThemeId;
  name: string;
  subtitle: string;
  primaryHex: string;
  softHex: string;
}

export const OMAR_THEMES: OmarThemeMeta[] = [
  {
    id: 'emerald',
    name: 'الأخضر الأصلي',
    subtitle: 'تصميم تواصل الكلاسيكي الهادئ',
    primaryHex: '#008069',
    softHex: '#D9FDD3'
  },
  {
    id: 'burgundy',
    name: 'العنابي الملكي',
    subtitle: 'ثيم واتساب أكرم العنابي الشهير',
    primaryHex: '#800020',
    softHex: '#FCE7F3'
  },
  {
    id: 'blue',
    name: 'الأزرق المحيطي',
    subtitle: 'واجهة زرقاء احترافية حديثة',
    primaryHex: '#0284C7',
    softHex: '#E0F2FE'
  },
  {
    id: 'gold',
    name: 'الذهبي الفاخر',
    subtitle: 'لمسة ذهبية دافئة وأنيقة',
    primaryHex: '#D97706',
    softHex: '#FEF3C7'
  },
  {
    id: 'pink',
    name: 'الوردي العصري',
    subtitle: 'ثيم وردي مشرق بتباين مريح',
    primaryHex: '#DB2777',
    softHex: '#FCE7F3'
  }
];

export const WALLPAPERS: { id: ChatWallpaperId; name: string; className: string; swatch: string }[] = [
  { id: 'pattern', name: 'النقش الافتراضي', className: 'wa-wallpaper-pattern', swatch: '#EFEAE2' },
  { id: 'mint', name: 'نعناعي ناعم', className: 'wa-wallpaper-mint', swatch: '#E3F3EE' },
  { id: 'slate', name: 'سحابي حديث', className: 'wa-wallpaper-slate', swatch: '#E2E8F0' },
  { id: 'sand', name: 'رملي دافئ', className: 'wa-wallpaper-sand', swatch: '#F5EFE6' },
  { id: 'velvet', name: 'مخملي عنابي', className: 'wa-wallpaper-velvet', swatch: '#F9EBF0' }
];

export const BUBBLE_STYLES: { id: BubbleStyleId; name: string; desc: string }[] = [
  { id: 'classic', name: 'كلاسيكي', desc: 'زوايا متوازنة دقيقة' },
  { id: 'modern', name: 'عصري', desc: 'حواف ناعمة متدرجة' },
  { id: 'rounded', name: 'انسيابي', desc: 'فقاعات مستديرة بالكامل' }
];

export const FONT_SIZE_OPTIONS: { id: FontSizePref; name: string; className: string }[] = [
  { id: 'sm', name: 'صغير', className: 'text-[13px]' },
  { id: 'md', name: 'متوسط', className: 'text-[14.5px]' },
  { id: 'lg', name: 'كبير', className: 'text-[16.5px]' }
];
