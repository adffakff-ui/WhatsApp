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
  AlertTriangle
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
  serviceWorker: boolean;
  icons: boolean;
  displayStandalone: boolean;
  publicHttps: boolean;
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
    if (typeof window === 'undefined') return 'https://wasil-messenger.vercel.app';
    return window.location.origin;
  });
  const [sha256Input, setSha256Input] = useState('');
  const [activeTab, setActiveTab] = useState<'apk' | 'vercel' | 'checks'>('apk');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [manifestFeedback, setManifestFeedback] = useState<string | null>(null);

  const [checks, setChecks] = useState<PackageChecks>({
    manifest: true,
    twaManifest: true,
    assetLinks: true,
    serviceWorker: true,
    icons: true,
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
      const [manifestRes, twaRes, assetLinksRes] = await Promise.all([
        fetch('/manifest.json', { cache: 'no-store' }).catch(() => null),
        fetch('/twa-manifest.json', { cache: 'no-store' }).catch(() => null),
        fetch('/.well-known/assetlinks.json', { cache: 'no-store' }).catch(() => null)
      ]);

      let manifestJson: { icons?: unknown[]; display?: string } | null = null;
      if (manifestRes?.ok) {
        manifestJson = (await manifestRes.json().catch(() => null)) as {
          icons?: unknown[];
          display?: string;
        } | null;
      }

      const twaOk = Boolean(twaRes?.ok && (await twaRes.json().catch(() => null)));
      const assetLinksOk = Boolean(
        assetLinksRes?.ok && Array.isArray(await assetLinksRes.json().catch(() => null))
      );

      setChecks({
        manifest: Boolean(manifestRes?.ok && manifestJson),
        twaManifest: twaOk,
        assetLinks: assetLinksOk,
        serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
        icons: Boolean(manifestJson?.icons && manifestJson.icons.length >= 2),
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
    checks.serviceWorker,
    checks.icons,
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
              <span>فحص الملفات الفعلية ({scoreCount}/6)</span>
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
                    placeholder="https://wasil-messenger.vercel.app"
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
                    ok: checks.icons,
                    title: 'أيقونات PNG الفعلية (192x192 و 512x512 + Maskable)',
                    desc: 'أيقونات مضبوطة الأبعاد ومتوافقة مع معايير Google Play و iOS Safari.'
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
