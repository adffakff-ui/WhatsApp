export interface AutoLockOption {
  minutes: number;
  label: string;
  shortLabel: string;
  description: string;
}

export const AUTO_LOCK_OPTIONS: AutoLockOption[] = [
  {
    minutes: 0,
    label: 'معطّل (يدوي فقط)',
    shortLabel: 'معطّل',
    description: 'تبقى المحادثات مفتوحة حتى تقفلها يدوياً أو تعيد تشغيل التطبيق.'
  },
  {
    minutes: 1,
    label: 'بعد دقيقة واحدة',
    shortLabel: '1 د',
    description: 'أعلى درجة حماية: قفل فوري بعد 60 ثانية من عدم النشاط.'
  },
  {
    minutes: 5,
    label: 'بعد 5 دقائق',
    shortLabel: '5 د',
    description: 'توازن مثالي للأمان والاستخدام اليومي في المحادثات المشفرة.'
  },
  {
    minutes: 15,
    label: 'بعد 15 دقيقة',
    shortLabel: '15 د',
    description: 'قفل تلقائي عند ترك الجهاز دون تفاعل لربع ساعة.'
  },
  {
    minutes: 30,
    label: 'بعد 30 دقيقة',
    shortLabel: '30 د',
    description: 'قفل تلقائي للجلسات الطويلة بعد نصف ساعة من الخمول.'
  }
];

const ALLOWED_MINUTES = new Set(AUTO_LOCK_OPTIONS.map((o) => o.minutes));

export function normalizeAutoLockMinutes(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  if (ALLOWED_MINUTES.has(raw)) {
    return raw;
  }
  const positiveOptions = AUTO_LOCK_OPTIONS.filter((o) => o.minutes > 0);
  let closest = positiveOptions[0].minutes;
  let bestDist = Math.abs(raw - closest);
  for (const opt of positiveOptions) {
    const dist = Math.abs(raw - opt.minutes);
    if (dist < bestDist) {
      bestDist = dist;
      closest = opt.minutes;
    }
  }
  return closest;
}

export function formatAutoLockStatus(minutes: unknown): string {
  const normalized = normalizeAutoLockMinutes(minutes);
  const match = AUTO_LOCK_OPTIONS.find((o) => o.minutes === normalized);
  return match ? match.label : 'معطّل (يدوي فقط)';
}

export interface AutoLockCheckInput {
  timeoutMinutes: number;
  lastActivityMs: number;
  nowMs: number;
  isEntered: boolean;
  isAlreadyLocked: boolean;
  hasActiveCall?: boolean;
}

export function shouldTriggerAutoLock(input: AutoLockCheckInput): boolean {
  const minutes = normalizeAutoLockMinutes(input.timeoutMinutes);
  if (minutes <= 0) return false;
  if (!input.isEntered || input.isAlreadyLocked) return false;
  if (input.hasActiveCall) return false;
  if (!Number.isFinite(input.lastActivityMs) || !Number.isFinite(input.nowMs)) {
    return false;
  }
  const thresholdMs = minutes * 60_000;
  return input.nowMs - input.lastActivityMs >= thresholdMs;
}
