export type StickerCategoryId = 'all' | 'animated' | 'greetings' | 'reactions' | 'blessings' | 'work';

export interface StickerCategory {
  id: StickerCategoryId;
  label: string;
}

export interface StickerDefinition {
  id: string;
  label: string;
  category: Exclude<StickerCategoryId, 'all' | 'animated'>;
  kind?: 'static' | 'lottie';
  lottieId?: string;
  bgFrom: string;
  bgTo: string;
  accent: string;
  textColor: string;
  emoji: string;
  subtitle?: string;
  badge?: string;
}

export const STICKER_CATEGORIES: StickerCategory[] = [
  { id: 'all', label: 'الكل' },
  { id: 'animated', label: 'متحركة Lottie' },
  { id: 'greetings', label: 'تحيات' },
  { id: 'reactions', label: 'تفاعل' },
  { id: 'blessings', label: 'دعاء ومناسبات' },
  { id: 'work', label: 'عمل وتواصل' }
];

export const STICKER_CATALOG: StickerDefinition[] = [
  // تحيات
  {
    id: 'stk_salam',
    label: 'السلام عليكم',
    subtitle: 'ورحمة الله وبركاته',
    category: 'greetings',
    bgFrom: '#0F766E',
    bgTo: '#065F46',
    accent: '#99F6E4',
    textColor: '#FFFFFF',
    emoji: '🕌',
    badge: 'تحية طيبة'
  },
  {
    id: 'stk_ahlan',
    label: 'أهلاً وسهلاً',
    subtitle: 'نوّرت المحادثة',
    category: 'greetings',
    bgFrom: '#0284C7',
    bgTo: '#0369A1',
    accent: '#BAE6FD',
    textColor: '#FFFFFF',
    emoji: '✨',
    badge: 'ترحيب'
  },
  {
    id: 'stk_sabah',
    label: 'صباح الخير',
    subtitle: 'يوم سعيد ومبارك',
    category: 'greetings',
    bgFrom: '#F59E0B',
    bgTo: '#D97706',
    accent: '#FEF3C7',
    textColor: '#FFFFFF',
    emoji: '☀️',
    badge: 'صباحاً'
  },
  {
    id: 'stk_masa',
    label: 'مساء النور',
    subtitle: 'أمسية هادئة',
    category: 'greetings',
    bgFrom: '#4338CA',
    bgTo: '#312E81',
    accent: '#C7D2FE',
    textColor: '#FFFFFF',
    emoji: '🌙',
    badge: 'مساءً'
  },
  {
    id: 'stk_kaif',
    label: 'كيف حالك؟',
    subtitle: 'أتمنى أن تكون بخير',
    category: 'greetings',
    bgFrom: '#059669',
    bgTo: '#047857',
    accent: '#A7F3D0',
    textColor: '#FFFFFF',
    emoji: '😊'
  },
  {
    id: 'stk_farewell',
    label: 'في أمان الله',
    subtitle: 'نلتقي على خير',
    category: 'greetings',
    bgFrom: '#0D9488',
    bgTo: '#115E59',
    accent: '#CCFBF1',
    textColor: '#FFFFFF',
    emoji: '👋'
  },

  // تفاعل ومشاعر
  {
    id: 'stk_shukran',
    label: 'شكراً جزيلاً',
    subtitle: 'ممتن لتعاونك',
    category: 'reactions',
    bgFrom: '#E11D48',
    bgTo: '#BE123C',
    accent: '#FFE4E6',
    textColor: '#FFFFFF',
    emoji: '❤️',
    badge: 'تقدير'
  },
  {
    id: 'stk_tislam',
    label: 'تسلم يدك',
    subtitle: 'مجهود رائع',
    category: 'reactions',
    bgFrom: '#7C3AED',
    bgTo: '#5B21B6',
    accent: '#DDD6FE',
    textColor: '#FFFFFF',
    emoji: '👏'
  },
  {
    id: 'stk_mumtaz',
    label: 'ممتاز جداً!',
    subtitle: 'أحسنت الاختيار',
    category: 'reactions',
    bgFrom: '#16A34A',
    bgTo: '#15803D',
    accent: '#BBF7D0',
    textColor: '#FFFFFF',
    emoji: '🏆',
    badge: '١٠٠٪'
  },
  {
    id: 'stk_laugh',
    label: 'أضحكتني!',
    subtitle: 'دمك خفيف',
    category: 'reactions',
    bgFrom: '#EA580C',
    bgTo: '#C2410C',
    accent: '#FFEDD5',
    textColor: '#FFFFFF',
    emoji: '😂'
  },
  {
    id: 'stk_wow',
    label: 'يا للروعة!',
    subtitle: 'مفاجأة جميلة',
    category: 'reactions',
    bgFrom: '#2563EB',
    bgTo: '#1D4ED8',
    accent: '#DBEAFE',
    textColor: '#FFFFFF',
    emoji: '🤩'
  },
  {
    id: 'stk_hug',
    label: 'مشتاقون لك',
    subtitle: 'طالت الغيبة',
    category: 'reactions',
    bgFrom: '#DB2777',
    bgTo: '#9D174D',
    accent: '#FCE7F3',
    textColor: '#FFFFFF',
    emoji: '💐'
  },

  // دعاء ومناسبات
  {
    id: 'stk_barakallah',
    label: 'بارك الله فيك',
    subtitle: 'وزادك من فضله',
    category: 'blessings',
    bgFrom: '#047857',
    bgTo: '#064E3B',
    accent: '#FDE68A',
    textColor: '#FFFFFF',
    emoji: '🤲',
    badge: 'دعاء'
  },
  {
    id: 'stk_jazakallah',
    label: 'جزاك الله خيراً',
    subtitle: 'في ميزان حسناتك',
    category: 'blessings',
    bgFrom: '#0E7490',
    bgTo: '#155E75',
    accent: '#A5F3FC',
    textColor: '#FFFFFF',
    emoji: '💚'
  },
  {
    id: 'stk_jumuah',
    label: 'جمعة مباركة',
    subtitle: 'طابت أيامكم بالخير',
    category: 'blessings',
    bgFrom: '#B45309',
    bgTo: '#78350F',
    accent: '#FDE68A',
    textColor: '#FFFFFF',
    emoji: '🕌',
    badge: 'الجمعة'
  },
  {
    id: 'stk_mashallah',
    label: 'ما شاء الله',
    subtitle: 'تبارك الرحمن',
    category: 'blessings',
    bgFrom: '#0F766E',
    bgTo: '#134E4A',
    accent: '#FCD34D',
    textColor: '#FFFFFF',
    emoji: '🌟'
  },
  {
    id: 'stk_eid',
    label: 'عيدكم مبارك',
    subtitle: 'كل عام وأنتم بخير',
    category: 'blessings',
    bgFrom: '#9333EA',
    bgTo: '#6B21A8',
    accent: '#FDE047',
    textColor: '#FFFFFF',
    emoji: '🎉',
    badge: 'تهنئة'
  },
  {
    id: 'stk_ramadan',
    label: 'أعانكم الله',
    subtitle: 'وتقبل طاعاتكم',
    category: 'blessings',
    bgFrom: '#1E3A8A',
    bgTo: '#172554',
    accent: '#FDE68A',
    textColor: '#FFFFFF',
    emoji: '🏮'
  },

  // عمل وتواصل
  {
    id: 'stk_done',
    label: 'تم التنفيذ ✓',
    subtitle: 'جاهز للمراجعة',
    category: 'work',
    bgFrom: '#10B981',
    bgTo: '#059669',
    accent: '#ECFDF5',
    textColor: '#FFFFFF',
    emoji: '✅',
    badge: 'مكتمل'
  },
  {
    id: 'stk_working',
    label: 'جاري العمل...',
    subtitle: 'سأوافيك بالتحديث',
    category: 'work',
    bgFrom: '#3B82F6',
    bgTo: '#1D4ED8',
    accent: '#EFF6FF',
    textColor: '#FFFFFF',
    emoji: '⚡'
  },
  {
    id: 'stk_idea',
    label: 'فكرة عبقرية!',
    subtitle: 'لنبدأ بتطبيقها',
    category: 'work',
    bgFrom: '#D97706',
    bgTo: '#B45309',
    accent: '#FEF3C7',
    textColor: '#FFFFFF',
    emoji: '💡'
  },
  {
    id: 'stk_wait',
    label: 'دقيقة واحدة',
    subtitle: 'سأعود حالاً',
    category: 'work',
    bgFrom: '#475569',
    bgTo: '#334155',
    accent: '#E2E8F0',
    textColor: '#FFFFFF',
    emoji: '⏳'
  },
  {
    id: 'stk_coffee',
    label: 'استراحة قهوة',
    subtitle: 'تفضل فنجانك',
    category: 'work',
    bgFrom: '#78350F',
    bgTo: '#451A03',
    accent: '#FDE68A',
    textColor: '#FFFFFF',
    emoji: '☕'
  },
  {
    id: 'stk_callme',
    label: 'لنتواصل لاحقاً',
    subtitle: 'راسلني في أي وقت',
    category: 'work',
    bgFrom: '#008069',
    bgTo: '#005C4B',
    accent: '#D1FAE5',
    textColor: '#FFFFFF',
    emoji: '📞'
  },

  // ملصقات Lottie متحركة
  {
    id: 'stk_lottie_wave',
    label: 'أهلاً بك!',
    subtitle: 'تحية متحركة',
    category: 'greetings',
    kind: 'lottie',
    lottieId: 'lottie_wave_hello',
    bgFrom: '#0284C7',
    bgTo: '#0369A1',
    accent: '#BAE6FD',
    textColor: '#FFFFFF',
    emoji: '👋',
    badge: 'Lottie'
  },
  {
    id: 'stk_lottie_sun',
    label: 'صباح الإشراق',
    subtitle: 'بداية يوم مفعمة بالنشاط',
    category: 'greetings',
    kind: 'lottie',
    lottieId: 'lottie_sun_rays',
    bgFrom: '#F59E0B',
    bgTo: '#B45309',
    accent: '#FEF3C7',
    textColor: '#FFFFFF',
    emoji: '☀️',
    badge: 'Lottie'
  },
  {
    id: 'stk_lottie_heart',
    label: 'كل المحبة',
    subtitle: 'نبض وتقدير',
    category: 'reactions',
    kind: 'lottie',
    lottieId: 'lottie_heart_pulse',
    bgFrom: '#E11D48',
    bgTo: '#9F1239',
    accent: '#FFE4E6',
    textColor: '#FFFFFF',
    emoji: '❤️',
    badge: 'Lottie'
  },
  {
    id: 'stk_lottie_celebrate',
    label: 'مبارك لكم!',
    subtitle: 'لحظة تستحق الاحتفال',
    category: 'reactions',
    kind: 'lottie',
    lottieId: 'lottie_celebrate_confetti',
    bgFrom: '#7C3AED',
    bgTo: '#4C1D95',
    accent: '#DDD6FE',
    textColor: '#FFFFFF',
    emoji: '🎉',
    badge: 'Lottie'
  },
  {
    id: 'stk_lottie_sparkle',
    label: 'إبداع متألق',
    subtitle: 'تأثير نجمي متحرك',
    category: 'reactions',
    kind: 'lottie',
    lottieId: 'lottie_star_sparkle',
    bgFrom: '#2563EB',
    bgTo: '#1E3A8A',
    accent: '#DBEAFE',
    textColor: '#FFFFFF',
    emoji: '✨',
    badge: 'Lottie'
  },
  {
    id: 'stk_lottie_crescent',
    label: 'ليلة مباركة',
    subtitle: 'طمأنينة وسكينة',
    category: 'blessings',
    kind: 'lottie',
    lottieId: 'lottie_crescent_glow',
    bgFrom: '#312E81',
    bgTo: '#1E1B4B',
    accent: '#FDE68A',
    textColor: '#FFFFFF',
    emoji: '🌙',
    badge: 'Lottie'
  },
  {
    id: 'stk_lottie_done',
    label: 'تم بنجاح!',
    subtitle: 'مكتمل ومؤكد',
    category: 'work',
    kind: 'lottie',
    lottieId: 'lottie_checkmark_pop',
    bgFrom: '#059669',
    bgTo: '#064E3B',
    accent: '#A7F3D0',
    textColor: '#FFFFFF',
    emoji: '✅',
    badge: 'Lottie'
  },
  {
    id: 'stk_lottie_coffee',
    label: 'فنجان تركيز',
    subtitle: 'قهوة ساخنة للعمل',
    category: 'work',
    kind: 'lottie',
    lottieId: 'lottie_coffee_steam',
    bgFrom: '#92400E',
    bgTo: '#451A03',
    accent: '#FDE68A',
    textColor: '#FFFFFF',
    emoji: '☕',
    badge: 'Lottie'
  }
];

const STICKER_MAP = new Map(STICKER_CATALOG.map((s) => [s.id, s]));

export function getStickerById(stickerId?: string): StickerDefinition | undefined {
  if (!stickerId) return undefined;
  return STICKER_MAP.get(stickerId);
}

export function isLottieSticker(sticker?: StickerDefinition): boolean {
  return Boolean(sticker && sticker.kind === 'lottie' && sticker.lottieId);
}

export function filterStickersByCategory(category: StickerCategoryId): StickerDefinition[] {
  if (category === 'all') return STICKER_CATALOG;
  if (category === 'animated') return STICKER_CATALOG.filter((s) => s.kind === 'lottie');
  return STICKER_CATALOG.filter((s) => s.category === category);
}
