import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearServiceWorkerAndWorkboxCache,
  getServiceWorkerCacheDetails,
  isCacheStorageSupported,
  isServiceWorkerSupported
} from './pwaCacheManager.ts';

test('isServiceWorkerSupported and isCacheStorageSupported return boolean in Node / Browser', () => {
  assert.equal(typeof isServiceWorkerSupported(), 'boolean');
  assert.equal(typeof isCacheStorageSupported(), 'boolean');
});

test('getServiceWorkerCacheDetails handles environment with mock caches and service workers', async () => {
  const originalWindow = (globalThis as any).window;
  const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  try {
    const fakeCaches: Record<string, string[]> = {
      'workbox-precache-v2-https://example.com/': ['entry1', 'entry2'],
      'wasil-core-assets-swr': ['script.js', 'style.css'],
      'random-cache': ['image.png']
    };

    (globalThis as any).window = {
      caches: {
        keys: async () => Object.keys(fakeCaches),
        open: async (name: string) => ({
          keys: async () => fakeCaches[name] || []
        }),
        delete: async (name: string) => {
          if (name in fakeCaches) {
            delete fakeCaches[name];
            return true;
          }
          return false;
        }
      }
    };

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        serviceWorker: {
          getRegistrations: async () => [
            {
              active: { postMessage: () => {} },
              waiting: null,
              installing: null,
              update: async () => {},
              unregister: async () => true
            }
          ]
        }
      },
      configurable: true,
      writable: true
    });

    const details = await getServiceWorkerCacheDetails();
    assert.equal(details.supported, true);
    assert.equal(details.cacheNames.length, 3);
    assert.equal(details.totalEntries, 5);
    assert.equal(details.hasWorkboxCache, true);
    assert.equal(details.serviceWorkerState, 'active');
    assert.equal(details.serviceWorkersCount, 1);

    // Test clearServiceWorkerAndWorkboxCache
    const clearResult = await clearServiceWorkerAndWorkboxCache({ unregister: false, reload: false });
    assert.equal(clearResult.success, true);
    assert.equal(clearResult.deletedCaches.length, 3);
    assert.equal(clearResult.serviceWorkersUpdated, 1);
    assert.equal(Object.keys(fakeCaches).length, 0);
  } finally {
    (globalThis as any).window = originalWindow;
    if (originalNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
    }
  }
});

test('clearServiceWorkerAndWorkboxCache unregisters workers when unregister option is true', async () => {
  const originalWindow = (globalThis as any).window;
  const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  try {
    let unregisterCalled = false;
    (globalThis as any).window = {
      caches: {
        keys: async () => [],
        delete: async () => true
      }
    };

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        serviceWorker: {
          getRegistrations: async () => [
            {
              active: null,
              waiting: { postMessage: () => {} },
              installing: null,
              update: async () => {},
              unregister: async () => {
                unregisterCalled = true;
                return true;
              }
            }
          ]
        }
      },
      configurable: true,
      writable: true
    });

    const result = await clearServiceWorkerAndWorkboxCache({ unregister: true, reload: false });
    assert.equal(result.success, true);
    assert.equal(result.serviceWorkersUnregistered, 1);
    assert.equal(unregisterCalled, true);
  } finally {
    (globalThis as any).window = originalWindow;
    if (originalNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
    }
  }
});
