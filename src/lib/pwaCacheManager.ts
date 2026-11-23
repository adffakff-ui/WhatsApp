export interface ServiceWorkerCacheDetails {
  supported: boolean;
  cacheNames: string[];
  totalEntries: number;
  hasWorkboxCache: boolean;
  serviceWorkerState: 'active' | 'installing' | 'waiting' | 'none' | 'unsupported';
  serviceWorkersCount: number;
}

export interface ClearCacheResult {
  success: boolean;
  deletedCaches: string[];
  serviceWorkersUpdated: number;
  serviceWorkersUnregistered: number;
  error?: string;
}

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function isCacheStorageSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

/**
 * Inspects all active caches in the browser and returns summary metrics
 * regarding Service Worker and Workbox caches.
 */
export async function getServiceWorkerCacheDetails(): Promise<ServiceWorkerCacheDetails> {
  const supported = isCacheStorageSupported();
  if (!supported) {
    return {
      supported: false,
      cacheNames: [],
      totalEntries: 0,
      hasWorkboxCache: false,
      serviceWorkerState: isServiceWorkerSupported() ? 'none' : 'unsupported',
      serviceWorkersCount: 0
    };
  }

  let cacheNames: string[] = [];
  let totalEntries = 0;
  let hasWorkboxCache = false;

  try {
    cacheNames = await window.caches.keys();
    for (const name of cacheNames) {
      if (name.toLowerCase().includes('workbox') || name.startsWith('wasil-')) {
        hasWorkboxCache = true;
      }
      try {
        const cache = await window.caches.open(name);
        const keys = await cache.keys();
        totalEntries += keys.length;
      } catch {
        // Ignore single cache read errors
      }
    }
  } catch {
    // Ignore cache key discovery errors
  }

  let serviceWorkerState: 'active' | 'installing' | 'waiting' | 'none' | 'unsupported' = 'none';
  let serviceWorkersCount = 0;

  if (isServiceWorkerSupported()) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      serviceWorkersCount = registrations.length;
      for (const reg of registrations) {
        if (reg.active) {
          serviceWorkerState = 'active';
        } else if (reg.waiting) {
          serviceWorkerState = 'waiting';
        } else if (reg.installing) {
          serviceWorkerState = 'installing';
        }
      }
    } catch {
      // Ignore registrations query errors
    }
  } else {
    serviceWorkerState = 'unsupported';
  }

  return {
    supported: true,
    cacheNames,
    totalEntries,
    hasWorkboxCache,
    serviceWorkerState,
    serviceWorkersCount
  };
}

/**
 * Safely purges all Workbox and Service Worker caches, notifies active service workers
 * to update or skip waiting, and optionally triggers a hard reload.
 */
export async function clearServiceWorkerAndWorkboxCache(options?: {
  unregister?: boolean;
  reload?: boolean;
}): Promise<ClearCacheResult> {
  const deletedCaches: string[] = [];
  let serviceWorkersUpdated = 0;
  let serviceWorkersUnregistered = 0;

  try {
    // 1. Purge CacheStorage entries
    if (isCacheStorageSupported()) {
      const keys = await window.caches.keys();
      for (const key of keys) {
        try {
          const ok = await window.caches.delete(key);
          if (ok) {
            deletedCaches.push(key);
          }
        } catch {
          // Continue deleting remaining caches
        }
      }
    }

    // 2. Notify or unregister active Service Workers
    if (isServiceWorkerSupported()) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          // Post skipWaiting if available
          try {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            if (reg.active) {
              reg.active.postMessage({ type: 'SKIP_WAITING' });
            }
          } catch {
            // Ignore message posting errors
          }

          if (options?.unregister) {
            try {
              const unregistered = await reg.unregister();
              if (unregistered) {
                serviceWorkersUnregistered++;
              }
            } catch {
              // Ignore unregister errors
            }
          } else {
            try {
              await reg.update();
              serviceWorkersUpdated++;
            } catch {
              // Ignore individual update errors
            }
          }
        }
      } catch {
        // Ignore registration lookup errors
      }
    }

    if (options?.reload && typeof window !== 'undefined') {
      // Short delay to let background cache delete operations settle
      setTimeout(() => {
        window.location.reload();
      }, 250);
    }

    return {
      success: true,
      deletedCaches,
      serviceWorkersUpdated,
      serviceWorkersUnregistered
    };
  } catch (err) {
    return {
      success: false,
      deletedCaches,
      serviceWorkersUpdated,
      serviceWorkersUnregistered,
      error: err instanceof Error ? err.message : 'Unknown cache clearing error'
    };
  }
}
