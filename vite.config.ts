import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: [
          'apple-touch-icon.png',
          'favicon.ico',
          'favicon-32x32.png',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'twa-manifest.json',
          'screenshots/desktop-wide.png',
          'screenshots/mobile-narrow.png',
          'wallpapers/aurora.mp4',
          'wallpapers/ocean.mp4',
          'wallpapers/emerald.mp4',
          'wallpapers/nebula.mp4'
        ],
        manifest: {
          id: '/',
          name: 'تواصل - Wasil Messenger',
          short_name: 'تواصل',
          description:
            'تطبيق تواصل اجتماعي متكامل مستوحى من واتساب مع تشفير تام بين الطرفين ومكالمات صوتية ومرئية ومزامنة فورية عبر Firebase.',
          lang: 'ar',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'any',
          theme_color: '#008069',
          background_color: '#EAE6DF',
          categories: ['social', 'communication', 'productivity'],
          launch_handler: {
            client_mode: ['focus-existing', 'auto']
          },
          edge_side_panel: {
            preferred_width: 420
          },
          handle_links: 'preferred',
          prefer_related_applications: false,
          related_applications: [
            {
              platform: 'play',
              id: 'com.wasil.messenger',
              url: 'https://play.google.com/store/apps/details?id=com.wasil.messenger'
            },
            {
              platform: 'webapp',
              url: 'https://wasil-messenger.vercel.app/manifest.json'
            }
          ],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          screenshots: [
            {
              src: '/screenshots/desktop-wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'واجهة تواصل على سطح المكتب مع المحادثات المشفرة والرسائل الصوتية'
            },
            {
              src: '/screenshots/mobile-narrow.png',
              sizes: '540x960',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'واجهة تواصل على الجوال مع الحالات اليومية وقائمة الدردشات'
            }
          ],
          shortcuts: [
            {
              name: 'محادثة جديدة',
              short_name: 'محادثة',
              description: 'بدء محادثة مشفرة جديدة',
              url: '/?action=new-chat',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
              name: 'الحالات والقصص',
              short_name: 'الحالات',
              description: 'استعراض الحالات اليومية',
              url: '/?tab=status',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
            }
          ],
          protocol_handlers: [
            {
              protocol: 'web+wasil',
              url: '/?chat=%s'
            }
          ],
          share_target: {
            action: '/?share=1',
            method: 'GET',
            params: {
              title: 'title',
              text: 'text',
              url: 'url'
            }
          }
        } as Record<string, unknown>,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,webp,woff,woff2,json}'],
          globIgnores: ['downloads/**', 'sw.js', 'workbox-*.js'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/install/, /^\/downloads/, /^\/\.well-known/, /^\/api/],
          runtimeCaching: [
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin &&
                url.pathname.startsWith('/api/') &&
                url.pathname !== '/api/packages',
              handler: 'NetworkOnly'
            },
            {
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                !url.pathname.startsWith('/downloads/') &&
                (request.destination === 'script' ||
                  request.destination === 'style' ||
                  request.destination === 'worker'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'wasil-core-assets-swr',
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: ({ request, sameOrigin, url }) =>
                sameOrigin &&
                request.destination === 'document' &&
                !url.pathname.startsWith('/api/') &&
                !url.pathname.startsWith('/downloads/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'wasil-documents-swr',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 7
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: ({ sameOrigin, url }) =>
                sameOrigin &&
                (/^\/(manifest\.json|twa-manifest\.json|\.well-known\/assetlinks\.json)$/.test(
                  url.pathname
                ) ||
                  url.pathname === '/api/packages' ||
                  url.pathname === '/downloads/package-manifest.json'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'wasil-manifests-swr',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 7
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: ({ request, url }) =>
                !url.pathname.startsWith('/downloads/') &&
                (request.destination === 'image' ||
                  url.hostname.endsWith('googleusercontent.com') ||
                  url.hostname.endsWith('firebasestorage.googleapis.com')),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'wasil-media-images-swr',
                expiration: {
                  maxEntries: 250,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: ({ sameOrigin, url }) =>
                sameOrigin &&
                !url.pathname.startsWith('/api/') &&
                !url.pathname.startsWith('/downloads/') &&
                /\.(woff2?|ttf|otf|json|lottie|mp3|ogg|wav)$/i.test(url.pathname),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'wasil-static-resources-swr',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                  purgeOnQuotaError: true
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets-swr',
                expiration: {
                  maxEntries: 15,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 15,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false,
          type: 'module'
        }
      })
    ],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          install: path.resolve(__dirname, 'install/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
