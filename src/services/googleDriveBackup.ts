import { encryptPayload, decryptPayload } from '../lib/crypto';

const BACKUP_FILE_NAME = 'wasil_encrypted_chat_backup.json';

async function getBackupEncryptionKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode('wasil-secure-drive-backup-master-key-2026-v1');
  const hash = await crypto.subtle.digest('SHA-256', rawKey);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackupData(payload: unknown): Promise<string> {
  const key = await getBackupEncryptionKey();
  const jsonStr = JSON.stringify(payload);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(jsonStr);
  const cipherBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  
  const envelope = {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(cipherBytes)),
    version: 1,
    createdAt: Date.now()
  };
  return JSON.stringify(envelope);
}

export async function decryptBackupData(encryptedEnvelopeStr: string): Promise<unknown> {
  const envelope = JSON.parse(encryptedEnvelopeStr);
  const key = await getBackupEncryptionKey();
  const iv = new Uint8Array(envelope.iv);
  const ciphertext = new Uint8Array(envelope.ciphertext);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const jsonStr = new TextDecoder().decode(decrypted);
  return JSON.parse(jsonStr);
}

export async function uploadBackupToGoogleDrive(payload: unknown, accessToken: string): Promise<string> {
  const encryptedStr = await encryptBackupData(payload);
  
  // 1. Search if file already exists
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}' and trashed=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  const searchData = await searchRes.json();
  const existingFile = searchData.files?.[0];

  const blob = new Blob([encryptedStr], { type: 'application/json' });

  if (existingFile) {
    // Update existing file content
    const updateRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: blob
      }
    );
    if (!updateRes.ok) {
      throw new Error('فشل تحديث النسخة الاحتياطية المشفرة في Google Drive.');
    }
    return existingFile.id;
  } else {
    // Create new file with multipart upload
    const metadata = {
      name: BACKUP_FILE_NAME,
      mimeType: 'application/json',
      description: 'Encrypted chat database backup for Wasil / Omar Chat'
    };
    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', blob);

    const createRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: form
      }
    );
    if (!createRes.ok) {
      throw new Error('فشل إنشاء النسخة الاحتياطية المشفرة في Google Drive.');
    }
    const createdData = await createRes.json();
    return createdData.id;
  }
}

export async function restoreBackupFromGoogleDrive(accessToken: string): Promise<unknown> {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}' and trashed=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  const searchData = await searchRes.json();
  const existingFile = searchData.files?.[0];
  if (!existingFile) {
    throw new Error('لم يتم العثور على نسخة احتياطية مشفرة في Google Drive.');
  }

  const fileRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  if (!fileRes.ok) {
    throw new Error('تعذر تنزيل النسخة الاحتياطية المشفرة من Google Drive.');
  }
  const encryptedText = await fileRes.text();
  return await decryptBackupData(encryptedText);
}
