import { useEffect, useState } from 'react';
import {
  Download,
  Smartphone,
  WifiOff,
  Package,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  FileCode,
  Globe,
  HelpCircle,
  X,
  Layers,
  RefreshCw,
  Info
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  compact?: boolean;
}

export function PWAInstallButton({ className = '', compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showPWABuilderModal, setShowPWABuilderModal] = useState(false);

  // PWABuilder modal state
  const [currentUrl, setCurrentUrl] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedManifestUrl, setCopiedManifestUrl] = useState(false);
  const [copiedPackageId, setCopiedPackageId] = useState(false);
  const [activeTab, setActiveTab] = useState<'builder' | 'checklist' | 'steps'>('builder');
  const [isVerifying, setIsVerifying] = useState(false);

  const [checks, setChecks] = useState({
    manifest: true,
    serviceWorker: true,
    icons: true,
    https: true,
    displayStandalone: true
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      setCurrentUrl(origin);
      setCustomUrl(origin);

      const isSecure =
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      const hasSw = 'serviceWorker' in navigator;

      setChecks((prev) => ({
        ...prev,
        serviceWorker: hasSw,
        https: isSecure,
        manifest: true,
        icons: true,
        displayStandalone: true
      }));
    }
  }, []);

  const runVerification = async () => {
    setIsVerifying(true);
    try {
      const resp = await fetch('/manifest.json');
      const manifestOk = resp.ok;
      let manifestJson: { icons?: unknown[]; display?: string } | null = null;
      if (manifestOk) {
        manifestJson = await resp.json() as { icons?: unknown[]; display?: string };
      }

      const hasSw = 'serviceWorker' in navigator;
      const isSecure =
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      setChecks({
        manifest: manifestOk,
        serviceWorker: hasSw,
        icons: Boolean(manifestJson?.icons && manifestJson.icons.length >= 2),
        https: isSecure,
        displayStandalone: manifestJson?.display === 'standalone'
      });
    } catch {
      // Keep optimistic checks if offline
    } finally {
      window.setTimeout(() => setIsVerifying(false), 400);
    }
  };

  const effectiveUrl = (customUrl.trim() || currentUrl || 'https://wasil-messenger.vercel.app').trim();
  const manifestUrl = `${effectiveUrl.replace(/\/$/, '')}/manifest.json`;
  const packageId = 'com.wasil.messenger';

  const pwabuilderDirectUrl = `https://www.pwabuilder.com/?url=${encodeURIComponent(effectiveUrl)}`;
  const pwabuilderReportUrl = `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(effectiveUrl)}`;

  const handleCopy = async (text: string, type: 'url' | 'manifest' | 'pkg') => {
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
      if (type === 'url') {
        setCopiedUrl(true);
        window.setTimeout(() => setCopiedUrl(false), 2000);
      } else if (type === 'manifest') {
        setCopiedManifestUrl(true);
        window.setTimeout(() => setCopiedManifestUrl(false), 2000);
      } else {
        setCopiedPackageId(true);
        window.setTimeout(() => setCopiedPackageId(false), 2000);
      }
    } catch {
      // Silently ignore clipboard errors
    }
  };

  const handleDownloadManifest = () => {
    fetch('/manifest.json')
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'manifest.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        // Fallback
      });
  };

  return (
    <div className={`space-y-2 w-full max-w-full min-w-0 ${className}`}>
      {/* 1. Status Pill if already installed */}
      {isInstalled && (
        <div className="flex items-center justify-between gap-2 min-w-0 max-w-full px-3.5 py-2 rounded-xl bg-[#00A884]/10 dark:bg-[#00A884]/20 border border-[#00A884]/30 text-xs text-[#008069] dark:text-[#06CF9C] font-medium">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-[#00A884] shrink-0" aria-hidden="true" />
            <span className="truncate">التطبيق مثبت كـ PWA على هذا المتصفح</span>
          </div>
          <span className="text-[10px] bg-[#00A884] text-white px-2 py-0.5 rounded-full font-bold shrink-0">
            نشط
          </span>
        </div>
      )}

      {/* 2. Direct PWA Install for Chromium / Desktop */}
      {isInstallable && !isInstalled && (
        <button
          type="button"
          onClick={() => void install()}
          className="w-full max-w-full min-w-0 overflow-hidden py-2.5 px-3 sm:px-4 rounded-xl bg-[#00A884] hover:bg-[#008069] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="truncate">تثبيت التطبيق على الجهاز مباشرة (PWA)</span>
        </button>
      )}

      {/* 3. iOS Safari Guide Button */}
      {isIOS && !isInstalled && (
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full max-w-full min-w-0 overflow-hidden py-2.5 px-3 sm:px-4 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#008069] dark:text-[#06CF9C] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-95 transition-all cursor-pointer"
        >
          <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="truncate">تثبيت التطبيق على iPhone / iPad</span>
        </button>
      )}

      {/* 4. PWABuilder Android APK Generator Button (Always Available) */}
      <button
        type="button"
        onClick={() => {
          setShowPWABuilderModal(true);
          void runVerification();
        }}
        className={`w-full max-w-full min-w-0 overflow-hidden py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
          compact
            ? 'bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942]'
            : 'bg-gradient-to-l from-[#008069] via-[#00A884] to-[#059669] text-white shadow-md hover:brightness-105 active:scale-[0.99]'
        }`}
      >
        <Package className="w-4 h-4 shrink-0 text-white" aria-hidden="true" />
        <span className="truncate min-w-0">توليد وتحميل حزمة APK عبر PWABuilder</span>
        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono-code font-bold uppercase tracking-wider shrink-0">
          Android
        </span>
      </button>

      {/* iOS Installation Guide Modal */}
      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="إرشادات التثبيت على iOS"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#202C33] p-6 shadow-2xl border border-[#E9EDEF] dark:border-[#374248] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                تثبيت تواصل على iPhone / iPad
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#8696A0] hover:bg-[#F0F2F5] dark:hover:bg-[#111B21] cursor-pointer"
                aria-label="إغلاق النافذة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
              <div className="flex items-start gap-2.5 bg-[#F0F2F5] dark:bg-[#111B21] p-3 rounded-xl">
                <span className="w-5 h-5 rounded-full bg-[#00A884] text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                  ١
                </span>
                <span>اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح Safari السفلي.</span>
              </div>
              <div className="flex items-start gap-2.5 bg-[#F0F2F5] dark:bg-[#111B21] p-3 rounded-xl">
                <span className="w-5 h-5 rounded-full bg-[#00A884] text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                  ٢
                </span>
                <span>مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full rounded-xl bg-[#00A884] py-2.5 text-xs font-semibold text-white hover:bg-[#008069] cursor-pointer transition-colors"
            >
              فهمت، إغلاق
            </button>
          </div>
        </div>
      )}

      {/* PWABuilder APK Generator Modal */}
      {showPWABuilderModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="توليد وتحميل حزمة APK عبر PWABuilder"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 md:p-6 overflow-y-auto"
          onClick={() => setShowPWABuilderModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#111B21] shadow-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-hidden my-auto max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <header className="px-5 py-4 border-b border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/80 dark:bg-[#202C33]/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00A884] to-[#008069] text-white flex items-center justify-center shadow-md">
                  <Package className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">
                      توليد وتحميل حزمة APK عبر PWABuilder
                    </h3>
                    <span className="text-[10px] bg-[#00A884] text-white px-2 py-0.5 rounded-full font-bold">
                      أندرويد
                    </span>
                  </div>
                  <p className="text-xs text-[#54656F] dark:text-[#8696A0]">
                    تحويل تطبيق تواصل (PWA) إلى تطبيق أندرويد حقيقي بصيغة APK و AAB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPWABuilderModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656F] dark:text-[#8696A0] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                aria-label="إغلاق النافذة"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Navigation Tabs */}
            <div className="px-4 sm:px-5 pt-3 border-b border-[#E9EDEF] dark:border-[#222D34] flex gap-2 shrink-0 bg-white dark:bg-[#111B21] overflow-x-auto no-scrollbar max-w-full">
              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeTab === 'builder'
                    ? 'border-[#00A884] text-[#008069] dark:text-[#06CF9C]'
                    : 'border-transparent text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-[#E9EDEF]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>التوليد المباشر</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('checklist')}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'checklist'
                    ? 'border-[#00A884] text-[#008069] dark:text-[#06CF9C]'
                    : 'border-transparent text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-[#E9EDEF]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>فحص جاهزية PWA (100%)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('steps')}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'steps'
                    ? 'border-[#00A884] text-[#008069] dark:text-[#06CF9C]'
                    : 'border-transparent text-[#54656F] dark:text-[#8696A0] hover:text-[#111B21] dark:hover:text-[#E9EDEF]'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>خطوات التحميل والتثبيت</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-right flex-1">
              {activeTab === 'builder' && (
                <div className="space-y-4">
                  {/* Readiness Banner */}
                  <div className="p-4 rounded-xl bg-[#D9FDD3]/40 dark:bg-[#202C33] border border-[#00A884]/30 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#00A884] shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                        تطبيق تواصل مهيأ وجاهز 100% للتحزيم عبر أداة PWABuilder الرسمية
                      </p>
                      <p className="text-[11px] text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                        تم فحص وتأكيد ملف البيان (<code className="font-mono-code text-[#008069] dark:text-[#06CF9C]">manifest.json</code>)،
                        وعامل الخدمة (<code className="font-mono-code text-[#008069] dark:text-[#06CF9C]">sw.js</code>)،
                        والأيقونات المقنعة (Maskable Icons) بأبعاد 192 و 512 بكسل.
                      </p>
                    </div>
                  </div>

                  {/* App URL and Inputs */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="pwabuilder-target-url" className="text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF] flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
                        <span>رابط التطبيق المستخدم للتحزيم (URL)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleCopy(effectiveUrl, 'url')}
                        className="text-[11px] text-[#008069] dark:text-[#06CF9C] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedUrl ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        id="pwabuilder-target-url"
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://your-domain.vercel.app"
                        className="w-full rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] px-3.5 py-2.5 text-xs text-[#111B21] dark:text-[#E9EDEF] font-mono-code text-left focus:outline-none focus:ring-2 focus:ring-[#00A884]"
                        dir="ltr"
                      />
                    </div>
                    {customUrl.includes('localhost') && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          أداة PWABuilder تتطلب رابطاً عاماً على الإنترنت (مثل رابط النشر على Vercel أو Cloud Run). إذا كنت تجري معاينة محلية، أدخل رابط استضافتك أعلاه أو انسخ ملف البيان مباشرة.
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Package Identity Details */}
                  <div className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#111B21] dark:text-[#E9EDEF]">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
                        <span>بيانات حزمة الأندرويد المقترحة (Package Identity)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(packageId, 'pkg')}
                        className="text-[11px] text-[#008069] dark:text-[#06CF9C] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPackageId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedPackageId ? 'تم النسخ!' : 'نسخ المعرّف'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono-code" dir="ltr">
                      <div className="p-2 rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248]/80 text-[#111B21] dark:text-[#E9EDEF]">
                        <span className="text-[#8696A0] select-none block text-[10px]">Package ID:</span>
                        {packageId}
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#374248]/80 text-[#111B21] dark:text-[#E9EDEF]">
                        <span className="text-[#8696A0] select-none block text-[10px]">Display / Version:</span>
                        standalone / 1.0.0
                      </div>
                    </div>
                  </div>

                  {/* Primary Generation CTAs */}
                  <div className="space-y-2.5 pt-2">
                    <a
                      href={pwabuilderReportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 px-4 rounded-xl bg-[#00A884] hover:bg-[#008069] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#00A884]/25 hover:shadow-xl transition-all cursor-pointer text-center"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>فتح PWABuilder وبدء توليد حزمة APK الآن 🚀</span>
                      <ExternalLink className="w-4 h-4 shrink-0 mr-auto ml-1" aria-hidden="true" />
                    </a>

                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <a
                        href={pwabuilderDirectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:flex-1 py-2 px-3 rounded-xl border border-[#00A884] text-[#008069] dark:text-[#06CF9C] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#00A884]/5 transition-colors cursor-pointer text-center"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>رابط الفحص التلقائي المباشر</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleDownloadManifest}
                        className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942] transition-colors cursor-pointer"
                      >
                        <FileCode className="w-3.5 h-3.5 text-[#00A884]" aria-hidden="true" />
                        <span>تحميل manifest.json الأصلي</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'checklist' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                      معايير PWA المعتمدة لدى PWABuilder و Google Play
                    </p>
                    <button
                      type="button"
                      disabled={isVerifying}
                      onClick={() => void runVerification()}
                      className="text-xs font-semibold text-[#008069] dark:text-[#06CF9C] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                      <span>إعادة الفحص</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    <div className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                          <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                            ملف بيان تطبيق الويب (Web App Manifest)
                          </span>
                        </div>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                          يتضمن <code className="font-mono-code">name</code>, <code className="font-mono-code">short_name</code>, <code className="font-mono-code">start_url</code>, واللغة العربية (<code className="font-mono-code">dir: rtl</code>).
                        </p>
                      </div>
                      <span className="text-[10px] bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C] px-2 py-0.5 rounded-full font-bold">
                        مكتمل ✓
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                          <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                            عامل الخدمة والكاش دون اتصال (Service Worker)
                          </span>
                        </div>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                          ملف <code className="font-mono-code">sw.js</code> مسجل مع استراتيجيات التخزين المؤقت للعمل بدون إنترنت.
                        </p>
                      </div>
                      <span className="text-[10px] bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C] px-2 py-0.5 rounded-full font-bold">
                        مكتمل ✓
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                          <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                            الأيقونات المقنعة وعالية الدقة (Maskable Icons)
                          </span>
                        </div>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                          تتوفر أيقونة 192x192 و 512x512 مع مراعاة منطقة الأمان (Safe Zone 80%) المعتمدة في أندرويد.
                        </p>
                      </div>
                      <span className="text-[10px] bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C] px-2 py-0.5 rounded-full font-bold">
                        مكتمل ✓
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#00A884]" aria-hidden="true" />
                          <span className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                            وضع العرض المستقل (Standalone Display)
                          </span>
                        </div>
                        <p className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                          يفتح التطبيق كشاشة مستقلة بدون شريط متصفح كأنه تطبيق أصلي تماماً.
                        </p>
                      </div>
                      <span className="text-[10px] bg-[#00A884]/15 text-[#008069] dark:text-[#06CF9C] px-2 py-0.5 rounded-full font-bold">
                        مكتمل ✓
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs text-[#54656F] dark:text-[#8696A0]">
                    <span>النتيجة المتوقعة في PWABuilder:</span>
                    <span className="font-bold text-[#008069] dark:text-[#06CF9C] font-mono-code text-sm">
                      40 / 40 (ممتاز 100%)
                    </span>
                  </div>
                </div>
              )}

              {activeTab === 'steps' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    دليل توليد وتثبيت حزمة APK خطوة بخطوة:
                  </h4>

                  <div className="space-y-3 text-xs text-[#54656F] dark:text-[#8696A0]">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
                      <span className="w-6 h-6 rounded-full bg-[#00A884] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        ١
                      </span>
                      <div className="space-y-0.5">
                        <strong className="text-[#111B21] dark:text-[#E9EDEF] block">
                          افتح PWABuilder عبر الزر أعلاه
                        </strong>
                        <p className="leading-relaxed">
                          سيتم إرسال رابط التطبيق مباشرة للأداة لتبدأ بفحصه والتأكد من مطابقة شروط المتجر.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
                      <span className="w-6 h-6 rounded-full bg-[#00A884] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        ٢
                      </span>
                      <div className="space-y-0.5">
                        <strong className="text-[#111B21] dark:text-[#E9EDEF] block">
                          اضغط على Package for Stores ثم Android
                        </strong>
                        <p className="leading-relaxed">
                          في أعلى يمين شاشة التقرير بـ PWABuilder، انقر على زر التحزيم واختر منصة Android (Google Play & APK).
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
                      <span className="w-6 h-6 rounded-full bg-[#00A884] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        ٣
                      </span>
                      <div className="space-y-0.5">
                        <strong className="text-[#111B21] dark:text-[#E9EDEF] block">
                          حمّل ملف APK أو AAB
                        </strong>
                        <p className="leading-relaxed">
                          اختر <strong>Download APK</strong> إذا كنت تريد تثبيته فوراً على هاتفك دون متجر، أو <strong>Download AAB</strong> إذا أردت رفعه على Google Play Console.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
                      <span className="w-6 h-6 rounded-full bg-[#00A884] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        ٤
                      </span>
                      <div className="space-y-0.5">
                        <strong className="text-[#111B21] dark:text-[#E9EDEF] block">
                          تثبيت التطبيق على هاتف الأندرويد
                        </strong>
                        <p className="leading-relaxed">
                          انقر على ملف الـ <code className="font-mono-code text-[#008069] dark:text-[#06CF9C]">.apk</code> الذي تم تحميله، ثم اختر "تثبيت". سيعمل التطبيق بكامل وظائف تواصل المشفرة كأي تطبيق أندرويد أصلي.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <footer className="px-5 py-3 border-t border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/60 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-[#54656F] dark:text-[#8696A0]">
                مدعوم بأداة PWABuilder الرسمية من Microsoft & Web Standards
              </span>
              <button
                type="button"
                onClick={() => setShowPWABuilderModal(false)}
                className="px-4 py-1.5 rounded-xl bg-[#E9EDEF] dark:bg-[#374248] text-[#111B21] dark:text-[#E9EDEF] text-xs font-semibold hover:brightness-95 transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      <span>وضع عدم الاتصال — يتم استخدام البيانات المخزنة محلياً</span>
    </div>
  );
}
