export const WASIL_PACKAGE_ID = 'com.wasil.messenger';
export const WASIL_APP_NAME = 'تواصل - Wasil Messenger';
export const WASIL_SHORT_NAME = 'تواصل';
export const WASIL_APP_VERSION = '1.0.0';
export const WASIL_APP_VERSION_CODE = 1;
export const WASIL_DEFAULT_VERCEL_URL = 'https://wasil-messenger.vercel.app';

export interface TwaManifestInput {
  originUrl: string;
  sha256Fingerprint?: string;
  versionName?: string;
  versionCode?: number;
}

export function normalizeOriginUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return WASIL_DEFAULT_VERCEL_URL;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProto);
    return parsed.origin;
  } catch {
    return WASIL_DEFAULT_VERCEL_URL;
  }
}

export function extractHostname(rawUrl: string): string {
  try {
    return new URL(normalizeOriginUrl(rawUrl)).hostname;
  } catch {
    return 'wasil-messenger.vercel.app';
  }
}

export function isPublicHttpsOrigin(rawUrl: string): boolean {
  try {
    const parsed = new URL(normalizeOriginUrl(rawUrl));
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local');
  } catch {
    return false;
  }
}

export function normalizeSha256Fingerprint(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^0-9A-F:]/g, '');
  if (!cleaned) return '';
  if (cleaned.includes(':')) return cleaned;
  // Format 64 hex chars into AA:BB:... pairs
  if (cleaned.length === 64) {
    return cleaned.match(/.{1,2}/g)?.join(':') || cleaned;
  }
  return cleaned;
}

export function isValidSha256Fingerprint(raw: string): boolean {
  const normalized = normalizeSha256Fingerprint(raw);
  return /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(normalized);
}

export function buildPwaBuilderUrls(targetUrl: string): {
  effectiveUrl: string;
  reportUrl: string;
  directUrl: string;
} {
  const effectiveUrl = normalizeOriginUrl(targetUrl);
  const encoded = encodeURIComponent(effectiveUrl);
  return {
    effectiveUrl,
    reportUrl: `https://www.pwabuilder.com/reportcard?site=${encoded}`,
    directUrl: `https://www.pwabuilder.com/?url=${encoded}`
  };
}

export function buildTwaManifest(input: TwaManifestInput) {
  const origin = normalizeOriginUrl(input.originUrl);
  const host = extractHostname(origin);
  const normalizedFp = normalizeSha256Fingerprint(input.sha256Fingerprint || '');
  const fingerprints = isValidSha256Fingerprint(normalizedFp)
    ? [{ name: 'release', value: normalizedFp }]
    : [];

  return {
    packageId: WASIL_PACKAGE_ID,
    host,
    name: WASIL_APP_NAME,
    launcherName: WASIL_SHORT_NAME,
    display: 'standalone',
    themeColor: '#008069',
    themeColorDark: '#111B21',
    navigationColor: '#008069',
    navigationColorDark: '#111B21',
    navigationDividerColor: '#E9EDEF',
    navigationDividerColorDark: '#222D34',
    backgroundColor: '#EAE6DF',
    enableNotifications: true,
    startUrl: '/',
    iconUrl: `${origin}/pwa-512x512.png`,
    maskableIconUrl: `${origin}/pwa-maskable-512x512.png`,
    monochromeIconUrl: `${origin}/pwa-192x192.png`,
    splashScreenFadeOutDuration: 300,
    signingKey: {
      path: './android.keystore',
      alias: 'wasil'
    },
    appVersionName: input.versionName || WASIL_APP_VERSION,
    appVersionCode: input.versionCode || WASIL_APP_VERSION_CODE,
    shortcuts: [
      {
        name: 'محادثة جديدة',
        shortName: 'محادثة',
        url: `${origin}/?action=new-chat`,
        chosenIconUrl: `${origin}/pwa-192x192.png`
      },
      {
        name: 'الحالات والقصص',
        shortName: 'الحالات',
        url: `${origin}/?tab=status`,
        chosenIconUrl: `${origin}/pwa-192x192.png`
      }
    ],
    generatorApp: 'bubblewrap-cli',
    webManifestUrl: `${origin}/manifest.json`,
    fallbackType: 'customtabs',
    features: {
      locationDelegation: { enabled: false },
      playBilling: { enabled: false }
    },
    alphaDependencies: { enabled: false },
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    isMetaQuest: false,
    fullScopeUrl: `${origin}/`,
    minSdkVersion: 21,
    orientation: 'default',
    fingerprints,
    additionalTrustedOrigins: [],
    retainedBundles: [],
    appVersion: input.versionName || WASIL_APP_VERSION
  };
}

export function buildAndroidAssetLinks(
  sha256Fingerprint: string,
  packageId = WASIL_PACKAGE_ID
) {
  const normalized = normalizeSha256Fingerprint(sha256Fingerprint);
  const fingerprints = isValidSha256Fingerprint(normalized)
    ? [normalized]
    : [
        '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00'
      ];

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageId,
        sha256_cert_fingerprints: fingerprints
      }
    }
  ];
}
