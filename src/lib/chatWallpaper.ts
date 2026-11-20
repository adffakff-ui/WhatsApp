import type { CSSProperties } from 'react';
import { WALLPAPERS } from './omarConfig';
import type { ChatWallpaperId } from '../types/chat';

export const MAX_CHAT_WALLPAPER_LENGTH = 65536;

export const PRESET_WALLPAPER_IDS: readonly ChatWallpaperId[] = [
  'pattern',
  'mint',
  'slate',
  'sand',
  'velvet'
];

export const HEX_WALLPAPER_REGEX = /^#[0-9a-fA-F]{6}$/;
export const DATA_IMAGE_WALLPAPER_REGEX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export interface CuratedColorWallpaper {
  hex: string;
  name: string;
}

export const CURATED_SOLID_WALLPAPERS: CuratedColorWallpaper[] = [
  { hex: '#0F172A', name: 'كحلي ليلي' },
  { hex: '#064E3B', name: 'زمردي عميق' },
  { hex: '#3B0764', name: 'بنفسجي ملكي' },
  { hex: '#4C0519', name: 'عنابي داكن' },
  { hex: '#1E293B', name: 'رمادي صخري' },
  { hex: '#E0F2FE', name: 'سماوي هادئ' },
  { hex: '#ECFDF5', name: 'أخضر ناعم' },
  { hex: '#FFFBEB', name: 'كريمي دافئ' }
];

export function isPresetWallpaperId(value: string): value is ChatWallpaperId {
  return (PRESET_WALLPAPER_IDS as readonly string[]).includes(value);
}

export function isValidHexColor(value: string): boolean {
  return HEX_WALLPAPER_REGEX.test(value);
}

export function isValidWallpaperDataUrl(value: string): boolean {
  return value.length <= MAX_CHAT_WALLPAPER_LENGTH && DATA_IMAGE_WALLPAPER_REGEX.test(value);
}

/**
 * Validates and normalizes a per-chat wallpaper value in sync with
 * firebase-blueprint.json and firestore.rules constraints.
 * Returns '' for empty, 'default', or invalid/oversized values.
 */
export function normalizeChatWallpaper(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'default') return '';
  if (trimmed.length > MAX_CHAT_WALLPAPER_LENGTH) return '';

  if (isPresetWallpaperId(trimmed)) {
    return trimmed;
  }
  if (isValidHexColor(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (isValidWallpaperDataUrl(trimmed)) {
    return trimmed;
  }
  return '';
}

export interface ResolvedChatWallpaper {
  mode: 'default' | 'preset' | 'color' | 'image';
  className: string;
  style?: CSSProperties;
  label: string;
  isCustomOverride: boolean;
  swatchColor?: string;
  imageUrl?: string;
}

export function resolveChatWallpaper(
  chatWallpaper: string | undefined,
  globalWallpaper: ChatWallpaperId
): ResolvedChatWallpaper {
  const normalized = normalizeChatWallpaper(chatWallpaper);

  if (!normalized) {
    const globalMeta = WALLPAPERS.find((w) => w.id === globalWallpaper) || WALLPAPERS[0];
    return {
      mode: 'default',
      className: `wa-wallpaper-${globalMeta.id}`,
      label: `الافتراضي العام (${globalMeta.name})`,
      isCustomOverride: false,
      swatchColor: globalMeta.swatch
    };
  }

  if (isPresetWallpaperId(normalized)) {
    const presetMeta = WALLPAPERS.find((w) => w.id === normalized) || WALLPAPERS[0];
    return {
      mode: 'preset',
      className: `wa-wallpaper-${presetMeta.id}`,
      label: presetMeta.name,
      isCustomOverride: true,
      swatchColor: presetMeta.swatch
    };
  }

  if (isValidHexColor(normalized)) {
    const curated = CURATED_SOLID_WALLPAPERS.find(
      (c) => c.hex.toUpperCase() === normalized.toUpperCase()
    );
    return {
      mode: 'color',
      className: '',
      style: { backgroundColor: normalized },
      label: curated ? curated.name : `لون مخصص (${normalized})`,
      isCustomOverride: true,
      swatchColor: normalized
    };
  }

  return {
    mode: 'image',
    className: 'bg-cover bg-center bg-no-repeat',
    style: {
      backgroundImage: `linear-gradient(rgba(11, 20, 26, 0.22), rgba(11, 20, 26, 0.22)), url("${normalized}")`
    },
    label: 'صورة مخصصة',
    isCustomOverride: true,
    imageUrl: normalized
  };
}

export async function compressWallpaperImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة صالح (JPG أو PNG أو WebP).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة المختار.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذر معالجة الصورة المختارة.'));
      img.onload = () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر تهيئة أداة ضغط الصورة.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.78;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 56000 && quality > 0.26) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        if (dataUrl.length > MAX_CHAT_WALLPAPER_LENGTH) {
          // Downscale further if still above Firestore string limit
          const smallCanvas = document.createElement('canvas');
          smallCanvas.width = Math.max(1, Math.round(width * 0.65));
          smallCanvas.height = Math.max(1, Math.round(height * 0.65));
          const smallCtx = smallCanvas.getContext('2d');
          if (!smallCtx) {
            reject(new Error('حجم الصورة كبير جداً حتى بعد الضغط.'));
            return;
          }
          smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
          dataUrl = smallCanvas.toDataURL('image/jpeg', 0.6);
        }

        const normalized = normalizeChatWallpaper(dataUrl);
        if (!normalized) {
          reject(new Error('حجم الصورة يتجاوز الحد المسموح للحفظ السحابي.'));
          return;
        }
        resolve(normalized);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
