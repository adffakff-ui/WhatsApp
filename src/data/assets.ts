import avatarLayla from '../assets/images/avatar_layla_1794759601411.jpg';
import avatarOmar from '../assets/images/avatar_omar_1794759600042.jpg';
import avatarSara from '../assets/images/avatar_sara_1794759599750.jpg';
import avatarTechGroup from '../assets/images/avatar_tech_group_1794759600547.jpg';
import statusDesertSunset from '../assets/images/status_desert_sunset_1794759601351.jpg';

export const BUNDLED_ASSETS = {
  avatarLayla,
  avatarOmar,
  avatarSara,
  avatarTechGroup,
  statusDesertSunset
} as const;

export const PRESET_AVATARS = [avatarOmar, avatarSara, avatarLayla] as const;

export const GROUP_ICON_PRESETS = [avatarTechGroup, avatarSara, avatarOmar] as const;

const LEGACY_ASSET_MAP: Record<string, string> = {
  '/src/assets/images/avatar_layla_1794759601411.jpg': avatarLayla,
  '/src/assets/images/avatar_omar_1794759600042.jpg': avatarOmar,
  '/src/assets/images/avatar_sara_1794759599750.jpg': avatarSara,
  '/src/assets/images/avatar_tech_group_1794759600547.jpg': avatarTechGroup,
  '/src/assets/images/status_desert_sunset_1794759601351.jpg': statusDesertSunset
};

export function resolveBundledAssetUrl(url?: string): string {
  if (!url) return '';
  return LEGACY_ASSET_MAP[url] || url;
}
