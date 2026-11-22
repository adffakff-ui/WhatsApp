import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_VIDEO_WALLPAPERS,
  MAX_CHAT_WALLPAPER_LENGTH,
  formatVideoWallpaperValue,
  normalizeChatWallpaper,
  parseVideoWallpaperValue,
  resolveChatWallpaper,
  withVideoWallpaperMuted
} from './chatWallpaper';

test('normalizeChatWallpaper accepts presets, hex colors, valid image data URLs, and rejects unsafe inputs', () => {
  assert.equal(normalizeChatWallpaper(undefined), '');
  assert.equal(normalizeChatWallpaper(''), '');
  assert.equal(normalizeChatWallpaper('default'), '');
  assert.equal(normalizeChatWallpaper('mint'), 'mint');
  assert.equal(normalizeChatWallpaper('velvet'), 'velvet');
  assert.equal(normalizeChatWallpaper('#0f172a'), '#0F172A');

  const validImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  assert.equal(normalizeChatWallpaper(validImg), validImg);

  assert.equal(normalizeChatWallpaper('video:aurora:muted'), 'video:aurora:muted');
  assert.equal(normalizeChatWallpaper('video:ocean:sound'), 'video:ocean:sound');
  assert.equal(normalizeChatWallpaper('localvideo:vid_123_abc:muted'), 'localvideo:vid_123_abc:muted');

  // Reject unsafe or oversized values
  assert.equal(normalizeChatWallpaper('javascript:alert(1)'), '');
  assert.equal(normalizeChatWallpaper('https://example.com/bg.jpg'), '');
  assert.equal(normalizeChatWallpaper('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(normalizeChatWallpaper('video:unknown_clip:muted'), '');
  assert.equal(normalizeChatWallpaper('localvideo:bad/id:muted'), '');
  const oversized = `data:image/jpeg;base64,${'A'.repeat(MAX_CHAT_WALLPAPER_LENGTH)}`;
  assert.equal(normalizeChatWallpaper(oversized), '');
});

test('resolveChatWallpaper falls back to global wallpaper when unset or default', () => {
  const fallback = resolveChatWallpaper('', 'sand');
  assert.equal(fallback.mode, 'default');
  assert.equal(fallback.className, 'wa-wallpaper-sand');
  assert.equal(fallback.isCustomOverride, false);

  const invalidFallback = resolveChatWallpaper('invalid-value', 'slate');
  assert.equal(invalidFallback.mode, 'default');
  assert.equal(invalidFallback.className, 'wa-wallpaper-slate');
  assert.equal(invalidFallback.isCustomOverride, false);
});

test('resolveChatWallpaper resolves custom preset, solid hex color, and custom image overrides', () => {
  const preset = resolveChatWallpaper('mint', 'pattern');
  assert.equal(preset.mode, 'preset');
  assert.equal(preset.className, 'wa-wallpaper-mint');
  assert.equal(preset.isCustomOverride, true);

  const color = resolveChatWallpaper('#064e3b', 'pattern');
  assert.equal(color.mode, 'color');
  assert.equal(color.style?.backgroundColor, '#064E3B');
  assert.equal(color.isCustomOverride, true);

  const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const resolvedImg = resolveChatWallpaper(img, 'pattern');
  assert.equal(resolvedImg.mode, 'image');
  assert.equal(resolvedImg.isCustomOverride, true);
  assert.equal(resolvedImg.imageUrl, img);
  assert.ok(String(resolvedImg.style?.backgroundImage).includes(img));
});

test('short video wallpapers resolve with auto-mute defaults and toggle sound cleanly', () => {
  assert.equal(CURATED_VIDEO_WALLPAPERS.length >= 4, true);

  const defaultMutedToken = formatVideoWallpaperValue('curated', 'aurora', true);
  assert.equal(defaultMutedToken, 'video:aurora:muted');

  const resolvedCurated = resolveChatWallpaper(defaultMutedToken, 'pattern');
  assert.equal(resolvedCurated.mode, 'video');
  assert.equal(resolvedCurated.videoKind, 'curated');
  assert.equal(resolvedCurated.videoId, 'aurora');
  assert.equal(resolvedCurated.videoSrc, '/wallpapers/aurora.mp4');
  assert.equal(resolvedCurated.videoMuted, true);

  const unmutedToken = withVideoWallpaperMuted(defaultMutedToken, false);
  assert.equal(unmutedToken, 'video:aurora:sound');
  const resolvedUnmuted = resolveChatWallpaper(unmutedToken, 'pattern');
  assert.equal(resolvedUnmuted.videoMuted, false);

  const localToken = formatVideoWallpaperValue('local', 'vid_local_999', true);
  const parsedLocal = parseVideoWallpaperValue(localToken);
  assert.equal(parsedLocal?.kind, 'local');
  assert.equal(parsedLocal?.id, 'vid_local_999');
  assert.equal(parsedLocal?.muted, true);
});
