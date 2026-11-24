import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WASIL_APP_NAME,
  WASIL_APP_VERSION,
  WASIL_DEFAULT_VERCEL_URL,
  WASIL_PACKAGE_ID,
  buildAndroidAssetLinks,
  buildTwaManifest,
  normalizeOriginUrl
} from '../src/lib/appPackageConfig.ts';
import { buildIosMobileConfigXml } from '../src/lib/mobileConfig.ts';
import { buildZipArchive, type ZipEntryInput } from '../src/lib/zipBuilder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DOWNLOADS_DIR = path.join(PUBLIC_DIR, 'downloads');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');

export interface PackageManifestItem {
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

export interface GeneratedPackageManifest {
  appName: string;
  packageId: string;
  version: string;
  originUrl: string;
  generatedAt: string;
  packages: PackageManifestItem[];
}

function sha256Hex(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function collectFilesRecursively(
  dir: string,
  zipPrefix: string,
  ignoreNames = new Set(['build', '.gradle', 'local.properties'])
): Promise<ZipEntryInput[]> {
  const entries: ZipEntryInput[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  items.sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    if (ignoreNames.has(item.name)) continue;
    const fullPath = path.join(dir, item.name);
    const relPath = `${zipPrefix}/${item.name}`;
    if (item.isDirectory()) {
      entries.push(...(await collectFilesRecursively(fullPath, relPath, ignoreNames)));
    } else if (item.isFile()) {
      const stat = await fs.stat(fullPath);
      const data = await fs.readFile(fullPath);
      entries.push({
        name: relPath,
        data,
        mtime: stat.mtime
      });
    }
  }
  return entries;
}

async function main() {
  const originUrl = normalizeOriginUrl(
    process.env.WASIL_PUBLIC_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      WASIL_DEFAULT_VERCEL_URL
  );
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });

  // 1. iOS / iPadOS MobileConfig Profile with embedded PNG icon
  const appleIconPath = path.join(PUBLIC_DIR, 'apple-touch-icon.png');
  const appleIconBase64 = await fs
    .readFile(appleIconPath)
    .then((b) => b.toString('base64'))
    .catch(() => undefined);

  const mobileConfigXml = buildIosMobileConfigXml({
    originUrl,
    iconBase64: appleIconBase64
  });
  const mobileConfigBuf = Buffer.from(mobileConfigXml, 'utf-8');
  const mobileConfigName = 'wasil-ios.mobileconfig';
  await fs.writeFile(path.join(DOWNLOADS_DIR, mobileConfigName), mobileConfigBuf);

  // 2. Desktop Standalone Installer Bundle (Windows .bat/.ps1 + Linux .desktop)
  const windowsBat = `@echo off
setlocal
set "APP_URL=${originUrl}/"
echo Launching / Installing Wasil Messenger Standalone App...
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%"
  exit /b 0
)
if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%"
  exit /b 0
)
if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%"
  exit /b 0
)
start "" "%APP_URL%"
`;

  const windowsPs1 = `param(
  [string]$AppUrl = "${originUrl}/"
)
$ErrorActionPreference = "Stop"
$browsers = @(
  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
  "$env:ProgramFiles(x86)\\Google\\Chrome\\Application\\chrome.exe",
  "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles(x86)\\Microsoft\\Edge\\Application\\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Start-Process $AppUrl
  exit 0
}
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Wasil Messenger.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browser
$shortcut.Arguments = "--app=$AppUrl --class=WasilMessenger"
$shortcut.Description = "Wasil Messenger - Encrypted Chat"
$shortcut.Save()
Write-Host "Shortcut created on Desktop: $shortcutPath"
Start-Process $browser "--app=$AppUrl"
`;

  const linuxDesktop = `[Desktop Entry]
Version=1.0
Type=Application
Name=Wasil Messenger
GenericName=Encrypted Messenger
Comment=تواصل - مراسلة مشفرة ومكالمات فورية
Exec=xdg-open ${originUrl}/
Terminal=false
Categories=Network;InstantMessaging;
StartupNotify=true
`;

  const desktopReadme = `Wasil Messenger (${WASIL_APP_VERSION}) - Desktop Standalone Installer
================================================================

1. Windows (Shortcut + Standalone Window):
   - Double-click Install-Wasil-Windows.bat to launch immediately in app mode.
   - Or right-click Install-Wasil-Windows.ps1 -> "Run with PowerShell" to create a Desktop shortcut.

2. Linux:
   - Copy wasil-messenger.desktop to ~/.local/share/applications/ and run:
     chmod +x ~/.local/share/applications/wasil-messenger.desktop

App Origin: ${originUrl}
Package ID: ${WASIL_PACKAGE_ID}
`;

  const desktopZipName = 'wasil-desktop-installer.zip';
  const desktopZipBuf = buildZipArchive([
    { name: 'Install-Wasil-Windows.bat', data: windowsBat },
    { name: 'Install-Wasil-Windows.ps1', data: windowsPs1 },
    { name: 'wasil-messenger.desktop', data: linuxDesktop },
    { name: 'README.txt', data: desktopReadme }
  ]);
  await fs.writeFile(path.join(DOWNLOADS_DIR, desktopZipName), desktopZipBuf);

  // 3. Complete Android Studio / Gradle APK Build Kit + TWA Config
  const androidEntries: ZipEntryInput[] = [];
  const hasAndroidDir = await fs
    .stat(ANDROID_DIR)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (hasAndroidDir) {
    androidEntries.push(...(await collectFilesRecursively(ANDROID_DIR, 'android')));
  }

  const twaManifest = buildTwaManifest({ originUrl });
  const assetLinks = buildAndroidAssetLinks('');
  const androidBuildGuide = `Wasil Messenger Android APK / Play Store Build Kit (${WASIL_APP_VERSION})
============================================================================

Package ID: ${WASIL_PACKAGE_ID}
Default Live URL: ${originUrl}

Option A — Build APK directly with Android Studio or Gradle:
  1. Open the "android/" folder in Android Studio (or run inside android/):
       gradle wrapper --gradle-version 8.5
       ./gradlew assembleDebug
     Or for signed Play Store / distribution release:
       ./gradlew assembleRelease
  2. Output APK location:
       android/app/build/outputs/apk/debug/app-debug.apk

Option B — Build Trusted Web Activity (TWA) via Bubblewrap CLI:
  npx @bubblewrap/cli init --manifest=${originUrl}/manifest.json
  npx @bubblewrap/cli build
`;

  androidEntries.push(
    { name: 'twa-manifest.json', data: JSON.stringify(twaManifest, null, 2) },
    { name: 'assetlinks.json', data: JSON.stringify(assetLinks, null, 2) },
    { name: 'README-BUILD-APK.txt', data: androidBuildGuide }
  );

  const androidZipName = 'wasil-messenger-android-project.zip';
  const androidZipBuf = buildZipArchive(androidEntries);
  await fs.writeFile(path.join(DOWNLOADS_DIR, androidZipName), androidZipBuf);

  // 4. Optional pre-compiled binary APK (when produced by CI / Android SDK into public/downloads/)
  const apkName = 'wasil-messenger.apk';
  const apkPath = path.join(DOWNLOADS_DIR, apkName);
  const apkBuf = await fs.readFile(apkPath).catch(() => null);

  const packages: PackageManifestItem[] = [
    {
      id: 'android-apk',
      platform: 'android',
      filename: apkName,
      url: `/downloads/${apkName}`,
      title: 'حزمة Android APK الجاهزة للتثبيت المباشر',
      subtitle: 'تثبيت فوري على هواتف Android بدون متجر Play',
      mimeType: 'application/vnd.android.package-archive',
      sizeBytes: apkBuf ? apkBuf.length : 0,
      sha256: apkBuf ? sha256Hex(apkBuf) : '',
      available: Boolean(apkBuf && apkBuf.length > 0)
    },
    {
      id: 'android-project',
      platform: 'android',
      filename: androidZipName,
      url: `/downloads/${androidZipName}`,
      title: 'حزمة مشروع Android APK / TWA الكاملة',
      subtitle: 'مشروع Gradle جاهز + twa-manifest.json + assetlinks.json',
      mimeType: 'application/zip',
      sizeBytes: androidZipBuf.length,
      sha256: sha256Hex(androidZipBuf),
      available: true
    },
    {
      id: 'ios-mobileconfig',
      platform: 'ios',
      filename: mobileConfigName,
      url: `/downloads/${mobileConfigName}`,
      title: 'ملف تثبيت iPhone و iPad (.mobileconfig)',
      subtitle: 'ملف تعريف Apple WebClip أصلي بشعار التطبيق الكامل',
      mimeType: 'application/x-apple-aspen-config',
      sizeBytes: mobileConfigBuf.length,
      sha256: sha256Hex(mobileConfigBuf),
      available: true
    },
    {
      id: 'desktop-installer',
      platform: 'desktop',
      filename: desktopZipName,
      url: `/downloads/${desktopZipName}`,
      title: 'حزمة سطح المكتب Windows & Linux (.zip)',
      subtitle: 'مثبت اختصار مستقل (Standalone) لأنظمة Windows و Linux',
      mimeType: 'application/zip',
      sizeBytes: desktopZipBuf.length,
      sha256: sha256Hex(desktopZipBuf),
      available: true
    }
  ];

  const manifest: GeneratedPackageManifest = {
    appName: WASIL_APP_NAME,
    packageId: WASIL_PACKAGE_ID,
    version: WASIL_APP_VERSION,
    originUrl,
    generatedAt: new Date().toISOString(),
    packages
  };

  await fs.writeFile(
    path.join(DOWNLOADS_DIR, 'package-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  console.log(
    `[build-install-packages] Generated ${packages.filter((p) => p.available).length} hosted install packages in public/downloads/`
  );
}

void main();
