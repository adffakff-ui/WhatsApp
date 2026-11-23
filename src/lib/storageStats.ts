export interface LocalStorageKeyStat {
  key: string;
  sizeBytes: number;
  itemCount?: number;
}

export interface StorageStatsReport {
  localStorageTotalBytes: number;
  localStorageKeyCount: number;
  localStorageKeys: LocalStorageKeyStat[];
  quotaBytes: number;
  usageBytes: number;
  quotaPercentage: number;
  cacheStorageBytes: number;
  cacheNames: string[];
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function collectStorageStats(): Promise<StorageStatsReport> {
  let localStorageTotalBytes = 0;
  const localStorageKeys: LocalStorageKeyStat[] = [];
  let localStorageKeyCount = 0;

  if (typeof window !== 'undefined' && window.localStorage) {
    localStorageKeyCount = window.localStorage.length;
    for (let i = 0; i < localStorageKeyCount; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const val = window.localStorage.getItem(key) || '';
      // Approximate UTF-16 string size (2 bytes per char) plus key length
      const sizeBytes = (key.length + val.length) * 2;
      localStorageTotalBytes += sizeBytes;
      let itemCount: number | undefined = undefined;
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          itemCount = parsed.length;
        } else if (parsed && typeof parsed === 'object') {
          itemCount = Object.keys(parsed).length;
        }
      } catch {
        // Not JSON
      }
      localStorageKeys.push({ key, sizeBytes, itemCount });
    }
    localStorageKeys.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }

  let quotaBytes = 0;
  let usageBytes = 0;
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota || 0;
      usageBytes = estimate.usage || 0;
    } catch {
      // Ignore
    }
  }

  const quotaPercentage =
    quotaBytes > 0 ? Math.min(100, Number(((usageBytes / quotaBytes) * 100).toFixed(1))) : 0;

  let cacheStorageBytes = 0;
  const cacheNames: string[] = [];
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await caches.keys();
      cacheNames.push(...keys);
      for (const name of keys) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        for (const req of requests) {
          const res = await cache.match(req);
          if (res) {
            const blob = await res.blob().catch(() => null);
            if (blob) {
              cacheStorageBytes += blob.size;
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return {
    localStorageTotalBytes,
    localStorageKeyCount,
    localStorageKeys,
    quotaBytes,
    usageBytes,
    quotaPercentage,
    cacheStorageBytes,
    cacheNames
  };
}
