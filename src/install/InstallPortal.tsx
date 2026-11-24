import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FileJson,
  Globe,
  Layers,
  Moon,
  Package,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  AlertTriangle,
  HardDriveDownload,
  Monitor,
  Apple
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallGuideModal } from '../components/PWAInstallButton';
import {
  WASIL_PACKAGE_ID,
  buildAndroidAssetLinks,
  buildPwaBuilderUrls,
  buildTwaManifest,
  isPublicHttpsOrigin,
  isValidSha256Fingerprint
} from '../lib/appPackageConfig';

interface PackageChecks {
  manifest: boolean;
  twaManifest: boolean;
  assetLinks: boolean;
  hostedPackages: boolean;
  serviceWorker: boolean;
  icons: boolean;
  richStoreMeta: boolean;
  displayStandalone: boolean;
  publicHttps: boolean;
}

interface HostedPackageItem {
  id: 'ios-mobileconfig' | 'desktop-installer' | 'android-project' | 'android-apk';
  platform: 'ios' | 'desktop' | 'android';
  filename: string;
  url: string;
  title: string;
  subtitle: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  available: boolean;
}

interface HostedPackageManifest {
  appName: string;
  packageId: string;
  version: string;
  originUrl: string;
  generatedAt: string;
  packages: HostedPackageItem[];
}

function formatPackageBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function InstallPortal() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = window.localStorage.getItem('wasil_theme_v1');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {
      // Ignore storage errors
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [targetUrl, setTargetUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return 'https://whats-app-px5v.vercel.app';
    return window.location.origin;
  });
  const [sha256Input, setSha256Input] = useState('');
  const [activeTab, setActiveTab] = useState<'apk' | 'vercel' | 'checks'>('apk');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [manifestFeedback, setManifestFeedback] = useState<string | null>(null);

  const [hostedManifest, setHostedManifest] = useState<HostedPackageManifest | null>(null);

  const [checks, setChecks] = useState<PackageChecks>({
    manifest: true,
    twaManifest: true,
    assetLinks: true,
    hostedPackages: true,
    serviceWorker: true,
    icons: true,
    richStoreMeta: true,
    displayStandalone: true,
    publicHttps: false
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('wasil_theme_v1', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore
    }
  }, [darkMode]);

  const { effectiveUrl, reportUrl, directUrl } = useMemo(
    () => buildPwaBuilderUrls(targetUrl),
    [targetUrl]
  );

  const isPublicLive = useMemo(() => isPublicHttpsOrigin(effectiveUrl), [effectiveUrl]);
  const hasValidFingerprint = useMemo(
    () => isValidSha256Fingerprint(sha256Input),
    [sha256Input]
  );

  const runLivePackageVerification = useCallback(async () => {
    setIsChecking(true);
    try {
      const [manifestRes, twaRes, assetLinksRes, hostedPkgRes] = await Promise.all([
        fetch('/manifest.json', { cache: 'no-store' }).catch(() => null),
        fetch('/twa-manifest.json', { cache: 'no-store' }).catch(() => null),
        fetch('/.well-known/assetlinks.json', { cache: 'no-store' }).catch(() => null),
        fetch('/downloads/package-manifest.json', { cache: 'no-store' }).catch(() => null)
      ]);

      let manifestJson: {
        icons?: unknown[];
        screenshots?: unknown[];
        related_applications?: unknown[];
        display?: string;
      } | null = null;
      if (manifestRes?.ok) {
        manifestJson = (await manifestRes.json().catch(() => null)) as {
          icons?: unknown[];
          screenshots?: unknown[];
          related_applications?: unknown[];
          display?: string;
        } | null;
      }

      let hostedJson: HostedPackageManifest | null = null;
      if (hostedPkgRes?.ok) {
        hostedJson = (await hostedPkgRes.json().catch(() => null)) as HostedPackageManifest | null;
      } else {
        const apiRes = await fetch('/api/packages', { cache: 'no-store' }).catch(() => null);
        if (apiRes?.ok) {
          hostedJson = (await apiRes.json().catch(() => null)) as HostedPackageManifest | null;
        }
      }
      if (hostedJson && Array.isArray(hostedJson.packages)) {
        setHostedManifest(hostedJson);
      }

      const twaOk = Boolean(twaRes?.ok && (await twaRes.json().catch(() => null)));
      const assetLinksOk = Boolean(
        assetLinksRes?.ok && Array.isArray(await assetLinksRes.json().catch(() => null))
      );
      const hostedOk = Boolean(
        hostedJson?.packages && hostedJson.packages.some((pkg) => pkg.available)
      );

      setChecks({
        manifest: Boolean(manifestRes?.ok && manifestJson),
        twaManifest: twaOk,
        assetLinks: assetLinksOk,
        hostedPackages: hostedOk,
        serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
        icons: Boolean(manifestJson?.icons && manifestJson.icons.length >= 2),
        richStoreMeta: Boolean(
          manifestJson?.screenshots &&
            manifestJson.screenshots.length >= 2 &&
            manifestJson?.related_applications &&
            manifestJson.related_applications.length >= 1
        ),
        displayStandalone: manifestJson?.display === 'standalone',
        publicHttps: isPublicHttpsOrigin(window.location.origin)
      });
    } finally {
      window.setTimeout(() => setIsChecking(false), 350);
    }
  }, []);

  useEffect(() => {
    void runLivePackageVerification();
  }, [runLivePackageVerification]);

  const handleCopy = async (text: string, key: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleUniversalInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowInstallGuide(true);
  };

  const handleDownloadManifest = async () => {
    try {
      const res = await fetch('/manifest.json');
      if (!res.ok) throw new Error('manifest unavailable');
      const data = await res.json();
      downloadJsonFile('manifest.json', data);
      setManifestFeedback('تم تحميل ملف manifest.json الحقيقي للتطبيق.');
    } catch {
      setManifestFeedback('تعذر تحميل manifest.json، تحقق من الخادم.');
    }
  };

  const handleDownloadTwaManifest = () => {
    const twa = buildTwaManifest({
      originUrl: effectiveUrl,
      sha256Fingerprint: sha256Input
    });
    downloadJsonFile('twa-manifest.json', twa);
    setManifestFeedback(`تم توليد وتحميل ملف حزمة الأندرويد twa-manifest.json للنطاق ${twa.host}.`);
  };

  const handleDownloadAssetLinks = () => {
    const links = buildAndroidAssetLinks(sha256Input, WASIL_PACKAGE_ID);
    downloadJsonFile('assetlinks.json', links);
    setManifestFeedback('تم تحميل ملف التحقق assetlinks.json لوضعه داخل /.well-known/');
  };

  const scoreCount = [
    checks.manifest,
    checks.twaManifest,
    checks.assetLinks,
    checks.hostedPackages,
    checks.serviceWorker,
    checks.icons,
    checks.richStoreMeta,
    checks.displayStandalone
  ].filter(Boolean).length;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#F0F2F5] dark:bg-[#0B141A] text-[#111B21] dark:text-[#E9EDEF] flex flex-col transition-colors"
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8EE] dark:border-[#222D34] bg-white/90 dark:bg-[#111B21]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="شعار تواصل"
              className="w-10 h-10 rounded-xl shadow-xs border border-[#E9EDEF] dark:border-[#2A3942] shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-base sm:text-lg truncate">
                  تواصل — بوابة التثبيت وحزمة التطبيق
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C]">
                  PWA &amp; APK
                </span>
              </div>
              <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                صفحة index مستقلة للتثبيت على الجوال والكمبيوتر وتوليد حزمة أندرويد الفعلية عبر Vercel و PWABuilder
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={darkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
              className="w-10 h-10 rounded-xl border border-[#E2E8EE] dark:border-[#2A3942] bg-[#F8FAFB] dark:bg-[#202C33] flex items-center justify-center text-[#54656F] dark:text-[#AEBAC1] hover:text-[#111B21] dark:hover:text-white cursor-pointer transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <a
              href="/"
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#00A884] hover:bg-[#008069] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <span>فتح التطبيق</span>
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Standalone Portal Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Primary Install Hero Card (Extracted Buttons Live Here) */}
        <section
          aria-label="تثبيت التطبيق وحزم الأجهزة"
          className="rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-sm p-5 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F0F2F5] dark:border-[#222D34] pb-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#008069] dark:text-[#06CF9C]">
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>تثبيت التطبيق وحزم الأجهزة (PWA &amp; APK)</span>
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold">
                ثبّت تطبيق تواصل مباشرة أو حمّل حزمة الأندرويد الفعلية
              </h1>
              <p className="text-xs sm:text-sm text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                بوابة مستقلة عن واجهة المحادثات؛ تمنحك التثبيت المباشر على الجوال والكمبيوتر، وضبط ملفات الحزمة الفعلية (<code className="font-mono-code">manifest.json</code> و <code className="font-mono-code">twa-manifest.json</code>)، والتوليد المباشر عبر PWABuilder و Vercel.
              </p>
            </div>

            <div className="shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  isPublicLive
                    ? 'bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C]'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPublicLive ? 'bg-[#00A884]' : 'bg-amber-500'
                  }`}
                />
                <span>{isPublicLive ? 'HTTPS جاهز للتحزيم' : 'معاينة / أدخل رابط Vercel'}</span>
              </span>
              <span className="text-[11px] font-mono-code text-[#54656F] dark:text-[#8696A0]" dir="ltr">
                {WASIL_PACKAGE_ID}
              </span>
            </div>
          </div>

          {/* The Two Core Extracted Buttons */}
          <div className="space-y-3">
            {isInstalled ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-[#00A884]/12 border border-[#00A884]/30">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-[#008069] dark:text-[#06CF9C]">
                  <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>التطبيق مثبت بالفعل كـ PWA على هذا الجهاز</span>
                </div>
                <a
                  href="/"
                  className="px-4 py-2 rounded-xl bg-[#00A884] text-white text-xs font-bold text-center hover:bg-[#008069] transition-colors"
                >
                  فتح تطبيق تواصل الآن
                </a>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleUniversalInstall()}
                className="w-full min-h-[52px] py-3.5 px-5 rounded-2xl bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[#E7EAEE] dark:hover:bg-[#2A3942] text-[#008069] dark:text-[#06CF9C] font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer border border-[#E2E8EE] dark:border-[#2A3942]"
              >
                {isIOS ? (
                  <Smartphone className="w-5 h-5 shrink-0" aria-hidden="true" />
                ) : (
                  <Download className="w-5 h-5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {isInstallable
                    ? 'تثبيت التطبيق على الجوال والكمبيوتر مباشرة (PWA)'
                    : isIOS
                      ? 'تثبيت التطبيق على iPhone / iPad'
                      : 'تثبيت التطبيق على الجوال والكمبيوتر'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveTab('apk');
                document.getElementById('packager-workbench')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full min-h-[52px] py-3.5 px-5 rounded-2xl bg-gradient-to-l from-[#008069] via-[#00A884] to-[#059669] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-md hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer"
            >
              <Package className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>توليد وتحميل حزمة APK عبر PWABuilder</span>
              <span className="text-[11px] bg-white/20 px-2.5 py-0.5 rounded-full font-mono-code font-bold uppercase tracking-wider shrink-0">
                ANDROID
              </span>
            </button>
          </div>
        </section>

        {/* Direct Server-Hosted Installation Packages */}
        <section
          aria-label="حزم التثبيت الحقيقية المرفوعة على الخادم"
          className="rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-sm p-5 sm:p-7 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0F2F5] dark:border-[#222D34] pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#008069] dark:text-[#06CF9C]">
                <HardDriveDownload className="w-4 h-4" aria-hidden="true" />
                <span>حزم التثبيت الحقيقية المرفوعة مباشرة على الخادم</span>
              </div>
              <h2 className="font-display text-base sm:text-lg font-bold">
                جاهزة للتنزيل والتوزيع على نطاق واسع لجميع الأنظمة
              </h2>
            </div>
            {hostedManifest && (
              <span
                dir="ltr"
                className="text-[11px] font-mono-code px-2.5 py-1 rounded-lg bg-[#F0F2F5] dark:bg-[#202C33] text-[#54656F] dark:text-[#8696A0] self-start sm:self-auto"
              >
                v{hostedManifest.version} · {hostedManifest.packageId}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(hostedManifest?.packages || [
              {
                id: 'android-project',
                platform: 'android',
                filename: 'wasil-messenger-android-project.zip',
                url: '/downloads/wasil-messenger-android-project.zip',
                title: 'حزمة مشروع Android APK / TWA الكاملة',
                subtitle: 'مشروع Gradle جاهز + twa-manifest.json + assetlinks.json',
                mimeType: 'application/zip',
                sizeBytes: 0,
                sha256: '',
                available: true
              },
              {
                id: 'ios-mobileconfig',
                platform: 'ios',
                filename: 'wasil-ios.mobileconfig',
                url: '/downloads/wasil-ios.mobileconfig',
                title: 'ملف تثبيت iPhone و iPad (.mobileconfig)',
                subtitle: 'ملف تعريف Apple WebClip أصلي بشعار التطبيق الكامل',
                mimeType: 'application/x-apple-aspen-config',
                sizeBytes: 0,
                sha256: '',
                available: true
              },
              {
                id: 'desktop-installer',
                platform: 'desktop',
                filename: 'wasil-desktop-installer.zip',
                url: '/downloads/wasil-desktop-installer.zip',
                title: 'حزمة سطح المكتب Windows & Linux (.zip)',
                subtitle: 'مثبت اختصار مستقل (Standalone) لأنظمة Windows و Linux',
                mimeType: 'application/zip',
                sizeBytes: 0,
                sha256: '',
                available: true
              }
            ]).map((pkg) => {
              if (pkg.id === 'android-apk' && !pkg.available) {
                return (
                  <div
                    key={pkg.id}
                    className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33]/70 border border-dashed border-[#D1D7DB] dark:border-[#374248] flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                          <span>{pkg.title}</span>
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          عبر GitHub Actions / Gradle
                        </span>
                      </div>
                      <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                        تم تجهيز مشروع Android الفعلي داخل <code className="font-mono-code">/android</code> ومسار <code className="font-mono-code">build-apk.yml</code> لبناء ملف APK موقّع تلقائياً أو عبر الحزمة الكاملة أدناه.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('apk');
                        document.getElementById('packager-workbench')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full min-h-[38px] rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] text-xs font-bold text-[#008069] dark:text-[#06CF9C] hover:brightness-95 cursor-pointer"
                    >
                      عرض خطوات توليد APK المباشر
                    </button>
                  </div>
                );
              }

              const PlatformIcon =
                pkg.platform === 'android'
                  ? Smartphone
                  : pkg.platform === 'ios'
                    ? Apple
                    : Monitor;

              const effectiveHref =
                pkg.id === 'ios-mobileconfig' && isPublicLive
                  ? `/api/packages/ios.mobileconfig?origin=${encodeURIComponent(effectiveUrl)}`
                  : pkg.url;

              return (
                <div
                  key={pkg.id}
                  className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-[#00A884]/12 text-[#008069] dark:text-[#06CF9C] flex items-center justify-center shrink-0">
                          <PlatformIcon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs sm:text-sm font-bold truncate">{pkg.title}</h3>
                          <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] truncate">
                            {pkg.subtitle}
                          </p>
                        </div>
                      </div>
                      {pkg.sizeBytes > 0 && (
                        <span
                          dir="ltr"
                          className="shrink-0 text-[10px] font-mono-code font-bold px-2 py-0.5 rounded-md bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248]"
                        >
                          {formatPackageBytes(pkg.sizeBytes)}
                        </span>
                      )}
                    </div>

                    {pkg.sha256 && (
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#2A3942]">
                        <span
                          dir="ltr"
                          className="text-[10px] font-mono-code text-[#54656F] dark:text-[#8696A0] truncate"
                        >
                          SHA-256: {pkg.sha256.slice(0, 20)}…
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(pkg.sha256, `sha-${pkg.id}`)}
                          className="text-[10px] font-bold text-[#008069] dark:text-[#06CF9C] shrink-0 cursor-pointer hover:underline"
                        >
                          {copiedKey === `sha-${pkg.id}` ? 'تم النسخ ✓' : 'نسخ البصمة'}
                        </button>
                      </div>
                    )}
                  </div>

                  <a
                    href={effectiveHref}
                    download={pkg.filename}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#00A884] hover:bg-[#008069] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>تنزيل {pkg.filename}</span>
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        {/* Real Package & Vercel Workbench */}
        <section
          id="packager-workbench"
          className="rounded-3xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#222D34] shadow-sm overflow-hidden"
        >
          {/* Tabs */}
          <div className="px-4 sm:px-6 pt-3 border-b border-[#E9EDEF] dark:border-[#222D34] flex gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('apk')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'apk'
                  ? 'border-[#00A884] text-[#008069] dark:text-[#06CF9C]'
                  : 'border-transparent text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>ملفات الحزمة الفعلية و PWABuilder</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('vercel')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'vercel'
                  ? 'border-[#00A884] text-[#008069] dark:text-[#06CF9C]'
                  : 'border-transparent text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-white'
              }`}
            >
              <CloudUpload className="w-4 h-4" aria-hidden="true" />
              <span>الرفع والنشر عبر Vercel</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('checks')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                activeTab === 'checks'
                  ? 'border-[#00A884] text-[#008069] dark:text-[#06CF9C]'
                  : 'border-transparent text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>فحص الملفات الفعلية ({scoreCount}/8)</span>
            </button>
          </div>

          <div className="p-5 sm:p-7 space-y-5">
            {manifestFeedback && (
              <div
                role="status"
                className="px-4 py-2.5 rounded-xl bg-[#00A884]/12 border border-[#00A884]/30 text-xs font-semibold text-[#008069] dark:text-[#06CF9C] flex items-center justify-between gap-2"
              >
                <span>{manifestFeedback}</span>
                <button
                  type="button"
                  onClick={() => setManifestFeedback(null)}
                  className="text-[11px] underline cursor-pointer"
                >
                  إخفاء
                </button>
              </div>
            )}

            {activeTab === 'apk' && (
              <div className="space-y-5">
                {/* Target Live Vercel URL */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="vercel-origin-url"
                      className="text-xs sm:text-sm font-bold flex items-center gap-1.5"
                    >
                      <Globe className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                      <span>رابط التطبيق المنشور على Vercel (للتحزيم الفعلي)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleCopy(effectiveUrl, 'url')}
                      className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C] flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      {copiedKey === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'url' ? 'تم النسخ' : 'نسخ الرابط'}</span>
                    </button>
                  </div>
                  <input
                    id="vercel-origin-url"
                    type="url"
                    dir="ltr"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://whats-app-px5v.vercel.app"
                    className="w-full rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E2E8EE] dark:border-[#374248] px-4 py-3 text-xs sm:text-sm font-mono-code text-left focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                  />
                  {!isPublicLive && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5 leading-relaxed">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        لتحويل التطبيق إلى ملف APK فعلي عبر PWABuilder أو Bubblewrap، يجب إدخال رابط النشر العام HTTPS (مثل رابط مشروعك على Vercel).
                      </span>
                    </p>
                  )}
                </div>

                {/* Package Identity & SHA-256 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-[#54656F] dark:text-[#8696A0]">
                        <Layers className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
                        <span>معرّف حزمة الأندرويد (Package ID)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(WASIL_PACKAGE_ID, 'pkg')}
                        className="text-[11px] text-[#008069] dark:text-[#06CF9C] cursor-pointer hover:underline"
                      >
                        {copiedKey === 'pkg' ? 'تم النسخ ✓' : 'نسخ'}
                      </button>
                    </div>
                    <div className="font-mono-code text-sm font-bold" dir="ltr">
                      {WASIL_PACKAGE_ID}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-1.5">
                    <label htmlFor="sha256-input" className="text-xs font-semibold text-[#54656F] dark:text-[#8696A0] block">
                      بصمة توقيع APK SHA-256 (اختياري لإخفاء شريط المتصفح)
                    </label>
                    <input
                      id="sha256-input"
                      type="text"
                      dir="ltr"
                      value={sha256Input}
                      onChange={(e) => setSha256Input(e.target.value)}
                      placeholder="AA:BB:CC:... (من PWABuilder أو Play Console)"
                      className="w-full rounded-lg bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] px-3 py-1.5 text-[11px] font-mono-code focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                    />
                    {sha256Input.trim().length > 0 && !hasValidFingerprint && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 block">
                        صيغة البصمة غير مكتملة (مطلوب 32 بايت سداسي عشري مفصول بنقطتين)
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Launch PWABuilder CTAs */}
                <div className="space-y-2.5">
                  <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#00A884] hover:bg-[#008069] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>فتح PWABuilder وتوليد حزمة APK / AAB الآن</span>
                    <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
                  </a>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleDownloadManifest()}
                      className="min-h-[42px] py-2 px-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[#E2E8EE] dark:hover:bg-[#2A3942] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <FileCode className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                      <span>تحميل manifest.json</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadTwaManifest}
                      className="min-h-[42px] py-2 px-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[#E2E8EE] dark:hover:bg-[#2A3942] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <FileJson className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                      <span>تحميل twa-manifest.json</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadAssetLinks}
                      className="min-h-[42px] py-2 px-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] hover:bg-[#E2E8EE] dark:hover:bg-[#2A3942] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                      <span>تحميل assetlinks.json</span>
                    </button>
                  </div>

                  <div className="text-center pt-1">
                    <a
                      href={directUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#008069] dark:text-[#06CF9C] hover:underline"
                    >
                      <span>فتح صفحة الفحص الرئيسية في PWABuilder</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'vercel' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-2">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <CloudUpload className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                    <span>تهيئة الرفع عبر Vercel مكتملة في المشروع</span>
                  </h2>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                    تم ضبط ملف <code className="font-mono-code text-[#008069] dark:text-[#06CF9C]">vercel.json</code> وبناء Vite متعدد الصفحات ليقوم برفع التطبيق (<code className="font-mono-code">/</code>) وهذه البوابة المستقلة (<code className="font-mono-code">/install</code>) مع ملفات الحزمة الفعلية (<code className="font-mono-code">/manifest.json</code> و <code className="font-mono-code">/twa-manifest.json</code> و <code className="font-mono-code">/.well-known/assetlinks.json</code> و <code className="font-mono-code">/sw.js</code>) مع الترويسات الصحيحة تلقائياً.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <a
                    href="https://vercel.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] py-3 px-4 rounded-xl bg-[#111B21] dark:bg-white text-white dark:text-[#111B21] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    <CloudUpload className="w-4 h-4" aria-hidden="true" />
                    <span>نشر المستودع عبر لوحة Vercel</span>
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  </a>

                  <button
                    type="button"
                    onClick={() => void handleCopy('npx vercel --prod', 'cli')}
                    className="min-h-[48px] py-3 px-4 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E2E8EE] dark:border-[#374248] text-xs sm:text-sm font-mono-code font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-[#E7EAEE] dark:hover:bg-[#2A3942]"
                    dir="ltr"
                  >
                    <Terminal className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                    <span>npx vercel --prod</span>
                    {copiedKey === 'cli' ? (
                      <Check className="w-4 h-4 text-[#00A884]" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#54656F]" />
                    )}
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">بناء حزمة APK محلياً عبر Bubblewrap CLI</span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopy(
                          'npx @bubblewrap/cli update && npx @bubblewrap/cli build',
                          'bubblewrap'
                        )
                      }
                      className="text-[11px] font-semibold text-[#008069] dark:text-[#06CF9C] cursor-pointer hover:underline"
                    >
                      {copiedKey === 'bubblewrap' ? 'تم النسخ ✓' : 'نسخ الأمر'}
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className="p-3 rounded-xl bg-white dark:bg-[#111B21] border border-[#E2E8EE] dark:border-[#374248] text-[11px] font-mono-code overflow-x-auto text-left"
                  >
                    npx @bubblewrap/cli update && npx @bubblewrap/cli build
                  </pre>
                </div>
              </div>
            )}

            {activeTab === 'checks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs sm:text-sm font-bold">التحقق المباشر من ملفات الحزمة الفعلية</h2>
                  <button
                    type="button"
                    disabled={isChecking}
                    onClick={() => void runLivePackageVerification()}
                    className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                    <span>إعادة الفحص</span>
                  </button>
                </div>

                {[
                  {
                    ok: checks.manifest,
                    title: 'ملف البيان الفعلي (/manifest.json)',
                    desc: 'يتضمن الهوية، dir: rtl، display: standalone، والاختصارات.'
                  },
                  {
                    ok: checks.twaManifest,
                    title: 'ملف حزمة أندرويد (/twa-manifest.json)',
                    desc: `مهيأ لحزمة ${WASIL_PACKAGE_ID} مع Bubblewrap و PWABuilder.`
                  },
                  {
                    ok: checks.assetLinks,
                    title: 'رابط التحقق الرقمي (/.well-known/assetlinks.json)',
                    desc: 'معرّف ارتباط النطاق لتطبيق Android Trusted Web Activity.'
                  },
                  {
                    ok: checks.hostedPackages,
                    title: 'حزم الخادم الجاهزة للتوزيع (/downloads/package-manifest.json)',
                    desc: 'حزمة Android Studio، ملف Apple iOS WebClip، ومثبت سطح المكتب مع بصمة SHA-256.'
                  },
                  {
                    ok: checks.icons,
                    title: 'أيقونات PNG الفعلية (192x192 و 512x512 + Maskable)',
                    desc: 'أيقونات مضبوطة الأبعاد ومتوافقة مع معايير Google Play و iOS Safari.'
                  },
                  {
                    ok: checks.richStoreMeta,
                    title: 'لقطات الشاشة وتطبيقات المتجر (Screenshots & Related Apps)',
                    desc: 'يتضمن لقطتي wide لسطح المكتب و narrow للجوال مع related_applications للتثبيت الغني.'
                  },
                  {
                    ok: checks.serviceWorker,
                    title: 'عامل الخدمة (Service Worker / Workbox)',
                    desc: 'تخزين مؤقت ذكي وتحديث تلقائي للعمل دون اتصال.'
                  },
                  {
                    ok: checks.displayStandalone,
                    title: 'وضع العرض المستقل (Standalone Display)',
                    desc: 'يعمل كتطبيق مستقل على الجوال وسطح المكتب بدون شريط متصفح.'
                  }
                ].map((item) => (
                  <div
                    key={item.title}
                    className="p-3.5 rounded-2xl bg-[#F8FAFB] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#2A3942] flex items-start justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            item.ok ? 'text-[#00A884]' : 'text-amber-500'
                          }`}
                          aria-hidden="true"
                        />
                        <span>{item.title}</span>
                      </div>
                      <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">{item.desc}</p>
                    </div>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold shrink-0 ${
                        item.ok
                          ? 'bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C]'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {item.ok ? 'جاهز ✓' : 'قيد الفحص'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <PWAInstallGuideModal
        open={showInstallGuide}
        onClose={() => setShowInstallGuide(false)}
        isIOS={isIOS}
      />
    </div>
  );
}
