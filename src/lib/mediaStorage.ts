import { MAX_STATUS_VIDEO_SECONDS, validateStatusVideoDuration } from './chatLogic';

const DB_NAME = 'wasil_media_v1';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

const memoryBlobFallback = new Map<string, Blob>();

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
  });
}

export function buildIdbMediaUri(id: string): string {
  return `idb://${id}`;
}

export function parseIdbMediaUri(uri?: string | null): string | null {
  if (!uri || !uri.startsWith('idb://')) return null;
  return uri.slice('idb://'.length);
}

export async function saveMediaBlob(id: string, blob: Blob): Promise<string> {
  memoryBlobFallback.set(id, blob);
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to store blob'));
    });
    db.close();
  } catch {
    // Fallback remains in memory for session continuity
  }
  return buildIdbMediaUri(id);
}

export async function getMediaBlob(uri: string): Promise<Blob | null> {
  const id = parseIdbMediaUri(uri);
  if (!id) return null;

  try {
    const db = await openMediaDb();
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as Blob | undefined) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (result) return result;
  } catch {
    // Fallback below
  }
  return memoryBlobFallback.get(id) || null;
}

export async function resolvePlayableMediaUrl(uri?: string): Promise<string | null> {
  if (!uri) return null;
  if (!uri.startsWith('idb://')) return uri;
  const blob = await getMediaBlob(uri);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function deleteMediaBlob(uri?: string): Promise<void> {
  const id = parseIdbMediaUri(uri);
  if (!id) return;
  memoryBlobFallback.delete(id);
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

export interface VideoInspectionResult {
  valid: boolean;
  durationSec: number;
  posterUrl: string;
  error?: string;
}

/**
 * Inspects a user-selected video file, validates that its duration does not exceed
 * 3 minutes (180 seconds), and captures a compressed JPEG poster thumbnail.
 */
export async function inspectVideoAndCapturePoster(
  file: Blob,
  overrideDurationSec?: number
): Promise<VideoInspectionResult> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    let settled = false;
    const finish = (res: VideoInspectionResult) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
      resolve(res);
    };

    const timeout = window.setTimeout(() => {
      if (typeof overrideDurationSec === 'number' && overrideDurationSec > 0) {
        const check = validateStatusVideoDuration(overrideDurationSec);
        finish({
          valid: check.valid,
          durationSec: check.clampedSeconds,
          posterUrl: '',
          error: check.error
        });
      } else {
        finish({
          valid: false,
          durationSec: 0,
          posterUrl: '',
          error: 'انتهت مهلة قراءة بيانات الفيديو. يرجى المحاولة بملف آخر.'
        });
      }
    }, 6000);

    video.onerror = () => {
      window.clearTimeout(timeout);
      finish({
        valid: false,
        durationSec: 0,
        posterUrl: '',
        error: 'تعذر تشغيل أو قراءة ملف الفيديو المختار.'
      });
    };

    video.onloadedmetadata = () => {
      const rawDur =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : overrideDurationSec || 0;
      const check = validateStatusVideoDuration(rawDur);
      if (!check.valid) {
        window.clearTimeout(timeout);
        finish({
          valid: false,
          durationSec: check.clampedSeconds,
          posterUrl: '',
          error: check.error
        });
        return;
      }

      const seekTarget = Math.min(0.4, Math.max(0, rawDur / 4));
      try {
        video.currentTime = seekTarget;
      } catch {
        window.clearTimeout(timeout);
        finish({
          valid: true,
          durationSec: Math.min(MAX_STATUS_VIDEO_SECONDS, check.clampedSeconds),
          posterUrl: ''
        });
      }
    };

    video.onseeked = () => {
      window.clearTimeout(timeout);
      const rawDur =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : overrideDurationSec || 5;
      const check = validateStatusVideoDuration(rawDur);
      let posterUrl = '';
      try {
        const vw = video.videoWidth || 480;
        const vh = video.videoHeight || 854;
        const maxSide = 480;
        const scale = Math.min(1, maxSide / Math.max(vw, vh));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          posterUrl = canvas.toDataURL('image/jpeg', 0.72);
          if (posterUrl.length > 48000) {
            posterUrl = canvas.toDataURL('image/jpeg', 0.45);
          }
        }
      } catch {
        posterUrl = '';
      }
      finish({
        valid: check.valid,
        durationSec: check.clampedSeconds,
        posterUrl,
        error: check.error
      });
    };
  });
}

/**
 * Triggers a reliable browser download for either a remote URL, data URL,
 * or IndexedDB-stored Blob URI.
 */
export async function downloadMediaUriOrUrl(
  uri: string,
  filename: string
): Promise<boolean> {
  if (uri.startsWith('idb://')) {
    const blob = await getMediaBlob(uri);
    if (!blob) return false;
    const objUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
    return true;
  }

  try {
    if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('/')) {
      const resp = await fetch(uri);
      if (resp.ok) {
        const blob = await resp.blob();
        const objUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
        return true;
      }
    }
  } catch {
    // Fallback to direct anchor href
  }

  const link = document.createElement('a');
  link.href = uri;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
