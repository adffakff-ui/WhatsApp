import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  WASIL_PACKAGE_ID,
  buildAndroidAssetLinks,
  buildPwaBuilderUrls,
  buildTwaManifest,
  isPublicHttpsOrigin,
  isValidSha256Fingerprint,
  normalizeOriginUrl,
  normalizeSha256Fingerprint
} from './appPackageConfig';

test('normalizeOriginUrl and isPublicHttpsOrigin distinguish Vercel/HTTPS hosts from localhost', () => {
  assert.equal(normalizeOriginUrl('wasil.vercel.app/install'), 'https://wasil.vercel.app');
  assert.equal(normalizeOriginUrl('https://wasil-chat.vercel.app/'), 'https://wasil-chat.vercel.app');
  assert.equal(isPublicHttpsOrigin('https://wasil-chat.vercel.app'), true);
  assert.equal(isPublicHttpsOrigin('http://localhost:3000'), false);
  assert.equal(isPublicHttpsOrigin('https://127.0.0.1:3000'), false);
});

test('buildTwaManifest & buildAndroidAssetLinks generate valid Bubblewrap & Digital Asset Links configs', () => {
  const rawFp = 'ab'.repeat(32);
  const normalizedFp = normalizeSha256Fingerprint(rawFp);
  assert.equal(isValidSha256Fingerprint(normalizedFp), true);

  const twa = buildTwaManifest({
    originUrl: 'https://wasil-messenger.vercel.app',
    sha256Fingerprint: rawFp
  });
  assert.equal(twa.packageId, WASIL_PACKAGE_ID);
  assert.equal(twa.host, 'wasil-messenger.vercel.app');
  assert.equal(twa.webManifestUrl, 'https://wasil-messenger.vercel.app/manifest.json');
  assert.equal(twa.fingerprints.length, 1);
  assert.equal(twa.fingerprints[0].value, normalizedFp);

  const links = buildAndroidAssetLinks(rawFp);
  assert.equal(links[0].target.package_name, WASIL_PACKAGE_ID);
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [normalizedFp]);
});

test('buildPwaBuilderUrls targets live origin and static package files are valid JSON', () => {
  const { effectiveUrl, reportUrl, directUrl } = buildPwaBuilderUrls('https://app.vercel.app/install');
  assert.equal(effectiveUrl, 'https://app.vercel.app');
  assert.ok(reportUrl.includes('https%3A%2F%2Fapp.vercel.app'));
  assert.ok(directUrl.includes('https%3A%2F%2Fapp.vercel.app'));

  const manifest = JSON.parse(fs.readFileSync(path.resolve('public/manifest.json'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2);
  assert.ok(
    manifest.screenshots.some((s: { form_factor?: string; sizes?: string; src?: string }) => s.form_factor === 'wide' && s.sizes === '1280x720' && fs.existsSync(path.resolve(`public${s.src}`)))
  );
  assert.ok(
    manifest.screenshots.some((s: { form_factor?: string; sizes?: string; src?: string }) => s.form_factor === 'narrow' && s.sizes === '540x960' && fs.existsSync(path.resolve(`public${s.src}`)))
  );
  assert.ok(
    Array.isArray(manifest.related_applications) &&
      manifest.related_applications.some((app: { platform?: string; id?: string }) => app.platform === 'play' && app.id === WASIL_PACKAGE_ID)
  );

  const twaStatic = JSON.parse(fs.readFileSync(path.resolve('public/twa-manifest.json'), 'utf8'));
  assert.equal(twaStatic.packageId, WASIL_PACKAGE_ID);

  const assetLinksStatic = JSON.parse(
    fs.readFileSync(path.resolve('public/.well-known/assetlinks.json'), 'utf8')
  );
  assert.equal(assetLinksStatic[0].target.package_name, WASIL_PACKAGE_ID);

  const vercel = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'));
  assert.ok(
    vercel.rewrites.some(
      (r: { source: string; destination: string }) =>
        r.source === '/install' && r.destination === '/install/index.html'
    )
  );
});
