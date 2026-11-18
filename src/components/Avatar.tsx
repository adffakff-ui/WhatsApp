import { useState } from 'react';
import { Users } from 'lucide-react';
import { resolveBundledAssetUrl } from '../data/assets';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  isGroup?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-24 h-24 text-2xl'
};

export function Avatar({ src, name, size = 'md', isOnline, isGroup }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedSrc = resolveBundledAssetUrl(src);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('');

  return (
    <div className={`relative shrink-0 rounded-full ${SIZE_CLASSES[size]}`}>
      {resolvedSrc && !imgFailed ? (
        <img
          src={resolvedSrc}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full rounded-full object-cover bg-[#DFE5E7] dark:bg-[#2A3942]"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-[#00A884]/15 dark:bg-[#00A884]/25 text-[#008069] dark:text-[#06CF9C] font-semibold flex items-center justify-center select-none">
          {isGroup ? <Users className="w-1/2 h-1/2" aria-hidden="true" /> : initials || '؟'}
        </div>
      )}
      {isOnline && (
        <span
          aria-label="متصل الآن"
          className="absolute bottom-0 left-0 w-3 h-3 rounded-full bg-[#00A884] ring-2 ring-white dark:ring-[#111B21]"
        />
      )}
    </div>
  );
}
