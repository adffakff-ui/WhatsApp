import {
  WASIL_APP_NAME,
  WASIL_APP_VERSION,
  WASIL_DEFAULT_VERCEL_URL,
  WASIL_PACKAGE_ID,
  WASIL_SHORT_NAME,
  normalizeOriginUrl
} from './appPackageConfig.ts';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface IosMobileConfigInput {
  originUrl?: string;
  iconBase64?: string;
}

export function buildIosMobileConfigXml(input: IosMobileConfigInput = {}): string {
  const origin = normalizeOriginUrl(input.originUrl || WASIL_DEFAULT_VERCEL_URL);
  const escapedUrl = escapeXml(`${origin}/`);
  const escapedLabel = escapeXml(WASIL_SHORT_NAME);
  const escapedDisplayName = escapeXml(WASIL_APP_NAME);
  const escapedPkg = escapeXml(WASIL_PACKAGE_ID);
  const escapedVersion = escapeXml(WASIL_APP_VERSION);

  const iconBlock = input.iconBase64
    ? `      <key>Icon</key>
      <data>
${input.iconBase64.replace(/(.{76})/g, '$1\n')}
      </data>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
${iconBlock}
      <key>IgnoreManifestScope</key>
      <false/>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>${escapedLabel}</string>
      <key>PayloadDescription</key>
      <string>تثبيت تطبيق ${escapedDisplayName} كتطبيق مستقل على الشاشة الرئيسية</string>
      <key>PayloadDisplayName</key>
      <string>${escapedDisplayName}</string>
      <key>PayloadIdentifier</key>
      <string>${escapedPkg}.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>7B6E8143-5E1B-4C94-9C7C-2F6C5D00A101</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${escapedUrl}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>ملف تعريف التثبيت الرسمي لتطبيق ${escapedDisplayName} (${escapedVersion})</string>
  <key>PayloadDisplayName</key>
  <string>${escapedDisplayName}</string>
  <key>PayloadIdentifier</key>
  <string>${escapedPkg}.profile</string>
  <key>PayloadOrganization</key>
  <string>Wasil Messenger</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>7B6E8143-5E1B-4C94-9C7C-2F6C5D00A100</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}
