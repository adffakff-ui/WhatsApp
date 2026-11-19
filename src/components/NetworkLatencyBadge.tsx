import { useEffect, useState } from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function NetworkLatencyBadge() {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [status, setStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('excellent');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
      setLatencyMs(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let isMounted = true;
    const checkLatency = async () => {
      if (!navigator.onLine) {
        if (isMounted) {
          setIsOnline(false);
          setStatus('offline');
        }
        return;
      }

      const start = performance.now();
      try {
        // Quick lightweight server roundtrip ping check
        await getDocFromServer(doc(db, 'system', 'connection_ping'));
        const duration = Math.round(performance.now() - start);
        if (isMounted) {
          setIsOnline(true);
          setLatencyMs(duration);
          if (duration < 300) setStatus('excellent');
          else if (duration < 900) setStatus('good');
          else setStatus('poor');
        }
      } catch {
        // Even if collection doesn't exist, if request completed or timed out
        const duration = Math.round(performance.now() - start);
        if (isMounted) {
          setIsOnline(true);
          setLatencyMs(duration);
          setStatus(duration < 800 ? 'good' : 'poor');
        }
      }
    };

    void checkLatency();
    const interval = setInterval(checkLatency, 25000); // Check every 25s

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline || status === 'offline') {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-[11px] font-medium"
        title="غير متصل بالخترنت / الخادم"
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">غير متصل</span>
      </div>
    );
  }

  const badgeColor =
    status === 'excellent'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : status === 'good'
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        : 'bg-orange-500/15 text-orange-600 dark:text-orange-400';

  const label =
    status === 'excellent'
      ? `ممتاز (${latencyMs}ms)`
      : status === 'good'
        ? `جيد (${latencyMs}ms)`
        : `بطيء (${latencyMs}ms)`;

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium font-mono-code transition-colors ${badgeColor}`}
      title={`جودة الاتصال بخادم Firebase: ${latencyMs ?? 0}ms`}
    >
      {status === 'poor' ? (
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
