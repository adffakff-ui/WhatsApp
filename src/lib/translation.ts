import type { DecryptedMessage } from '../types/chat';

export type TranslationLangCode =
  | 'ar'
  | 'en'
  | 'fr'
  | 'es'
  | 'de'
  | 'tr'
  | 'ur'
  | 'id'
  | 'ru'
  | 'zh-CN';

export interface TranslationLanguageOption {
  code: TranslationLangCode;
  nativeName: string;
  arabicName: string;
  dir: 'rtl' | 'ltr';
}

export const SUPPORTED_TRANSLATION_LANGUAGES: TranslationLanguageOption[] = [
  { code: 'ar', nativeName: 'العربية', arabicName: 'العربية', dir: 'rtl' },
  { code: 'en', nativeName: 'English', arabicName: 'الإنجليزية', dir: 'ltr' },
  { code: 'fr', nativeName: 'Français', arabicName: 'الفرنسية', dir: 'ltr' },
  { code: 'es', nativeName: 'Español', arabicName: 'الإسبانية', dir: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', arabicName: 'الألمانية', dir: 'ltr' },
  { code: 'tr', nativeName: 'Türkçe', arabicName: 'التركية', dir: 'ltr' },
  { code: 'ur', nativeName: 'اردو', arabicName: 'الأردية', dir: 'rtl' },
  { code: 'id', nativeName: 'Bahasa Indonesia', arabicName: 'الإندونيسية', dir: 'ltr' },
  { code: 'ru', nativeName: 'Русский', arabicName: 'الروسية', dir: 'ltr' },
  { code: 'zh-CN', nativeName: '中文', arabicName: 'الصينية', dir: 'ltr' }
];

export interface TranslationResult {
  translatedText: string;
  detectedSourceLang: string;
  targetLang: TranslationLangCode;
  provider: 'google-cloud' | 'google-translate' | 'gemini';
}

export function getTranslationLanguageMeta(code?: string): TranslationLanguageOption {
  return (
    SUPPORTED_TRANSLATION_LANGUAGES.find((l) => l.code === code) ||
    SUPPORTED_TRANSLATION_LANGUAGES[0]
  );
}

export function getTranslatableMessageText(msg: DecryptedMessage): string {
  if (msg.isDeleted) return '';
  if (msg.type === 'poll' && msg.payload.pollQuestion) {
    return msg.payload.pollQuestion.trim();
  }
  return (msg.payload.text || '').trim();
}

export function parseGoogleTranslateSingleResponse(
  raw: unknown,
  targetLang: TranslationLangCode
): { translatedText: string; detectedSourceLang: string } | null {
  if (!Array.isArray(raw) || !Array.isArray(raw[0])) return null;
  const segments = raw[0] as unknown[];
  const translatedParts: string[] = [];
  for (const seg of segments) {
    if (Array.isArray(seg) && typeof seg[0] === 'string') {
      translatedParts.push(seg[0]);
    }
  }
  const translatedText = translatedParts.join('').trim();
  if (!translatedText) return null;
  const detectedSourceLang = typeof raw[2] === 'string' ? raw[2] : 'auto';
  return {
    translatedText,
    detectedSourceLang: detectedSourceLang || targetLang
  };
}

export async function translateMessageText(
  text: string,
  targetLang: TranslationLangCode = 'ar'
): Promise<TranslationResult> {
  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error('لا يوجد نص قابل للترجمة في هذه الرسالة.');
  }

  // Primary path: full-stack server endpoint (supports Google Translate API + Gemini fallback)
  try {
    const apiRes = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleaned, targetLang })
    });
    if (apiRes.ok) {
      const data = (await apiRes.json()) as Partial<TranslationResult>;
      if (typeof data.translatedText === 'string' && data.translatedText.trim()) {
        return {
          translatedText: data.translatedText.trim(),
          detectedSourceLang: data.detectedSourceLang || 'auto',
          targetLang,
          provider: data.provider || 'google-translate'
        };
      }
    } else if (apiRes.status !== 404 && apiRes.status !== 405) {
      // Continue to browser Google Translate endpoint fallback before throwing
    }
  } catch {
    // Backend unavailable (e.g., static hosting); continue to direct Google Translate fallback
  }

  // Direct Google Translate fallback for static CDN deployments
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    targetLang
  )}&dt=t&q=${encodeURIComponent(cleaned)}`;
  const gtxRes = await fetch(url);
  if (!gtxRes.ok) {
    throw new Error('تعذر الاتصال بخدمة الترجمة حالياً، حاول مرة أخرى.');
  }
  const gtxJson: unknown = await gtxRes.json();
  const parsed = parseGoogleTranslateSingleResponse(gtxJson, targetLang);
  if (!parsed) {
    throw new Error('استجابة غير صالحة من خدمة الترجمة.');
  }
  return {
    translatedText: parsed.translatedText,
    detectedSourceLang: parsed.detectedSourceLang,
    targetLang,
    provider: 'google-translate'
  };
}
