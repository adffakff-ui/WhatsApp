const DB_NAME = 'wasil_video_wallpapers_db';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

export const MAX_LOCAL_VIDEO_BYTES = 12 * 1024 * 1024; // 12 MB
export const MAX_LOCAL_VIDEO_DURATION_SEC = 30;

export interface StoredVideoWallpaperRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  durationSec: number;
  name: string;
  createdAtMs: number;
}

function openVideoWallpaperDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('المتصفح لا يدعم تخزين مقاطع الفيديو محلياً.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('تعذر فتح قاعدة بيانات مقاطع الخلفية.'));
  });
}

function probeVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(duration);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('تعذر قراءة ملف الفيديو المختار. يرجى اختيار مقطع MP4 أو WebM صالح.'));
    };

    video.src = objectUrl;
  });
}

export async function validateAndSaveLocalVideoWallpaper(file: File): Promise<{
  videoId: string;
  durationSec: number;
}> {
  const mime = (file.type || '').toLowerCase();
  const isVideoMime =
    mime === 'video/mp4' ||
    mime === 'video/webm' ||
    mime === 'video/quicktime' ||
    mime.startsWith('video/');

  if (!isVideoMime) {
    throw new Error('يرجى اختيار مقطع فيديو صالح بصيغة MP4 أو WebM.');
  }

  if (file.size <= 0) {
    throw new Error('ملف الفيديو المختار فارغ.');
  }

  if (file.size > MAX_LOCAL_VIDEO_BYTES) {
    throw new Error('حجم المقطع يتجاوز الحد المسموح (12 ميجابايت). يرجى اختيار مقطع أقصر.');
  }

  const durationSec = await probeVideoDurationSeconds(file);
  if (durationSec > MAX_LOCAL_VIDEO_DURATION_SEC + 0.5) {
    throw new Error(
      `مدة المقطع (${Math.round(durationSec)} ث) أطول من الحد المسموح للخلفية (30 ثانية كحد أقصى).`
    );
  }

  const id = `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record: StoredVideoWallpaperRecord = {
    id,
    blob: file,
    mimeType: mime || 'video/mp4',
    size: file.size,
    durationSec: Math.max(1, Math.round(durationSec || 0)),
    name: file.name || 'video-wallpaper.mp4',
    createdAtMs: Date.now()
  };

  const db = await openVideoWallpaperDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('تعذر حفظ مقطع الفيديو في الجهاز.'));
  });
  db.close();

  return { videoId: id, durationSec: record.durationSec };
}

export async function loadLocalVideoWallpaperBlobUrl(videoId: string): Promise<string | null> {
  try {
    const db = await openVideoWallpaperDb();
    const record = await new Promise<StoredVideoWallpaperRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(videoId);
      req.onsuccess = () => resolve(req.result as StoredVideoWallpaperRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record?.blob) return null;
    return URL.createObjectURL(record.blob);
  } catch {
    return null;
  }
}

export async function deleteLocalVideoWallpaper(videoId: string): Promise<void> {
  try {
    const db = await openVideoWallpaperDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore deletion errors
  }
}
