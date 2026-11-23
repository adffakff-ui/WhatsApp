import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { WASIL_DEFAULT_VERCEL_URL, normalizeOriginUrl } from './src/lib/appPackageConfig.ts';
import { buildIosMobileConfigXml } from './src/lib/mobileConfig.ts';
import {
  getTranslationLanguageMeta,
  parseGoogleTranslateSingleResponse,
  type TranslationLangCode
} from './src/lib/translation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_LANGS = new Set<string>([
  'ar',
  'en',
  'fr',
  'es',
  'de',
  'tr',
  'ur',
  'id',
  'ru',
  'zh-CN'
]);

const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    })
  : null;

const SERVER_STARTED_AT = Date.now();

// Sliding-window in-memory rate limiter for /api/* routes to sustain high scale cleanly
const API_RATE_WINDOW_MS = 60_000;
const API_RATE_MAX_REQUESTS = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function apiRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 64);
  const now = Date.now();
  let bucket = rateBuckets.get(clientIp);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + API_RATE_WINDOW_MS };
    rateBuckets.set(clientIp, bucket);
  } else {
    bucket.count += 1;
  }

  // Prevent unbounded Map growth under high traffic
  if (rateBuckets.size > 5000) {
    for (const [key, entry] of rateBuckets) {
      if (now >= entry.resetAt) {
        rateBuckets.delete(key);
      }
    }
  }

  res.setHeader('X-RateLimit-Limit', String(API_RATE_MAX_REQUESTS));
  res.setHeader(
    'X-RateLimit-Remaining',
    String(Math.max(0, API_RATE_MAX_REQUESTS - bucket.count))
  );

  if (bucket.count > API_RATE_MAX_REQUESTS) {
    res.status(429).json({
      error: 'تم تجاوز الحد المسموح للطلبات المؤقت، يرجى الانتظار قليلاً والمحاولة مجدداً.'
    });
    return;
  }
  next();
}

function gzipResponseMiddleware(req: Request, res: Response, next: NextFunction) {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/i.test(acceptEncoding)) {
    next();
    return;
  }

  const originalEnd = res.end.bind(res);
  const chunks: Buffer[] = [];
  let skipCompression = false;

  const originalWrite = res.write.bind(res);

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
    if (skipCompression) {
      return originalWrite(
        chunk as string | Uint8Array,
        encoding as BufferEncoding,
        cb as (err?: Error | null) => void
      );
    }
    if (chunk) {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf-8');
      chunks.push(buf);
    }
    if (typeof encoding === 'function') {
      (encoding as () => void)();
    } else if (typeof cb === 'function') {
      (cb as () => void)();
    }
    return true;
  }) as typeof res.write;

  res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown): Response => {
    if (chunk && typeof chunk !== 'function') {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf-8');
      chunks.push(buf);
    }

    const contentType = String(res.getHeader('Content-Type') || '').toLowerCase();
    const alreadyEncoded = Boolean(res.getHeader('Content-Encoding'));
    const isCompressible =
      !alreadyEncoded &&
      chunks.length > 0 &&
      /(text\/|application\/json|application\/javascript|application\/manifest\+json|image\/svg\+xml|application\/x-apple-aspen-config)/.test(
        contentType
      );

    const combined = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);

    if (!isCompressible || combined.length < 1024) {
      skipCompression = true;
      return originalEnd(
        combined.length > 0 ? combined : undefined,
        typeof chunk === 'function' ? (chunk as () => void) : (cb as () => void)
      );
    }

    const compressed = zlib.gzipSync(combined, { level: zlib.constants.Z_BEST_SPEED });
    res.removeHeader('Content-Length');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    return originalEnd(
      compressed,
      typeof chunk === 'function' ? (chunk as () => void) : (cb as () => void)
    );
  }) as typeof res.end;

  next();
}

async function translateViaGoogleCloud(text: string, targetLang: TranslationLangCode) {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        format: 'text'
      })
    }
  );
  if (!res.ok) return null;
  const payload = (await res.json()) as {
    data?: { translations?: Array<{ translatedText?: string; detectedSourceLanguage?: string }> };
  };
  const item = payload?.data?.translations?.[0];
  if (!item?.translatedText) return null;
  return {
    translatedText: item.translatedText.trim(),
    detectedSourceLang: item.detectedSourceLanguage || 'auto',
    targetLang,
    provider: 'google-cloud' as const
  };
}

async function translateViaGoogleTranslateGtx(text: string, targetLang: TranslationLangCode) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    targetLang
  )}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const raw: unknown = await res.json();
  const parsed = parseGoogleTranslateSingleResponse(raw, targetLang);
  if (!parsed) return null;
  return {
    translatedText: parsed.translatedText,
    detectedSourceLang: parsed.detectedSourceLang,
    targetLang,
    provider: 'google-translate' as const
  };
}

async function translateViaGemini(text: string, targetLang: TranslationLangCode) {
  if (!geminiClient) return null;
  const langMeta = getTranslationLanguageMeta(targetLang);
  const response = await geminiClient.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Translate the following chat message accurately and naturally into ${langMeta.nativeName} (${targetLang}). Preserve emojis, line breaks, and tone without adding commentary.\n\nMessage:\n${text}`,
    config: {
      systemInstruction:
        'You are a precise neural translator. Return only JSON matching the schema with translatedText and detectedSourceLang (ISO-639-1 code).',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translatedText: { type: Type.STRING },
          detectedSourceLang: { type: Type.STRING }
        },
        required: ['translatedText', 'detectedSourceLang']
      }
    }
  });
  const jsonText = (response.text ?? '').trim();
  if (!jsonText) return null;
  const parsed = JSON.parse(jsonText) as {
    translatedText?: string;
    detectedSourceLang?: string;
  };
  if (!parsed.translatedText?.trim()) return null;
  return {
    translatedText: parsed.translatedText.trim(),
    detectedSourceLang: parsed.detectedSourceLang || 'auto',
    targetLang,
    provider: 'gemini' as const
  };
}

async function resolveDownloadsDir(): Promise<string> {
  const distDownloads = path.resolve(__dirname, 'dist', 'downloads');
  const publicDownloads = path.resolve(__dirname, 'public', 'downloads');
  if (process.env.NODE_ENV === 'production') {
    const existsDist = await fsPromises
      .stat(distDownloads)
      .then((s) => s.isDirectory())
      .catch(() => false);
    if (existsDist) return distDownloads;
  }
  return publicDownloads;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers compatible with Google Workspace OAuth popups & PWA service workers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  app.use(gzipResponseMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', apiRateLimitMiddleware);

  // Health & readiness probe for load balancers / large-scale deployments
  app.get('/api/health', async (_req, res) => {
    const downloadsDir = await resolveDownloadsDir();
    const manifestPath = path.join(downloadsDir, 'package-manifest.json');
    const manifestReady = await fsPromises
      .stat(manifestPath)
      .then((s) => s.isFile())
      .catch(() => false);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      status: 'healthy',
      uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
      packagesReady: manifestReady,
      timestamp: new Date().toISOString()
    });
  });

  // Live package inventory hosted on server
  app.get('/api/packages', async (_req, res) => {
    try {
      const downloadsDir = await resolveDownloadsDir();
      const manifestRaw = await fsPromises.readFile(
        path.join(downloadsDir, 'package-manifest.json'),
        'utf-8'
      );
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.type('application/json').send(manifestRaw);
    } catch {
      res.status(404).json({ error: 'حزم التثبيت غير متوفرة حالياً على الخادم.' });
    }
  });

  // Dynamic Apple iOS/iPadOS .mobileconfig WebClip profile generator
  app.get('/api/packages/ios.mobileconfig', async (req, res) => {
    try {
      const rawOrigin = typeof req.query.origin === 'string' ? req.query.origin : '';
      const requestOrigin =
        req.headers.host && req.protocol
          ? `${req.protocol}://${req.headers.host}`
          : WASIL_DEFAULT_VERCEL_URL;
      const safeOrigin = normalizeOriginUrl(rawOrigin || requestOrigin);

      const iconPath = path.resolve(__dirname, 'public', 'apple-touch-icon.png');
      const iconBase64 = await fsPromises
        .readFile(iconPath)
        .then((buf) => buf.toString('base64'))
        .catch(() => undefined);

      const xml = buildIosMobileConfigXml({
        originUrl: safeOrigin,
        iconBase64
      });

      res.setHeader('Content-Type', 'application/x-apple-aspen-config; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="wasil-ios.mobileconfig"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(xml);
    } catch {
      res.status(500).json({ error: 'تعذر توليد ملف التثبيت لجهاز iOS.' });
    }
  });

  // Serve hosted installation packages cleanly with proper MIME & download headers
  const downloadsDir = await resolveDownloadsDir();
  app.use(
    '/downloads',
    express.static(downloadsDir, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        const lower = filePath.toLowerCase();
        if (lower.endsWith('.apk')) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        } else if (lower.endsWith('.mobileconfig')) {
          res.setHeader('Content-Type', 'application/x-apple-aspen-config; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        } else if (lower.endsWith('.zip')) {
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        } else if (lower.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      }
    })
  );

  app.post('/api/translate', async (req, res) => {
    try {
      const body = req.body as { text?: unknown; targetLang?: unknown };
      const rawText = typeof body?.text === 'string' ? body.text.trim() : '';
      const targetLang = (
        typeof body?.targetLang === 'string' && ALLOWED_LANGS.has(body.targetLang)
          ? body.targetLang
          : 'ar'
      ) as TranslationLangCode;

      if (!rawText) {
        res.status(400).json({ error: 'النص المطلوب ترجمته غير صالح.' });
        return;
      }

      const boundedText = rawText.slice(0, 5000);

      const cloudResult = await translateViaGoogleCloud(boundedText, targetLang).catch(() => null);
      if (cloudResult) {
        res.json(cloudResult);
        return;
      }

      const gtxResult = await translateViaGoogleTranslateGtx(boundedText, targetLang).catch(
        () => null
      );
      if (gtxResult) {
        res.json(gtxResult);
        return;
      }

      const geminiResult = await translateViaGemini(boundedText, targetLang).catch(() => null);
      if (geminiResult) {
        res.json(geminiResult);
        return;
      }

      res.status(502).json({ error: 'تعذر الوصول إلى خدمة الترجمة حالياً.' });
    } catch {
      res.status(500).json({ error: 'حدث خطأ غير متوقع أثناء الترجمة.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        port,
        middlewareMode: { server: httpServer },
        ws: { server: httpServer },
        allowedHosts: true
      },
      appType: 'spa'
    });
    app.get(['/install', '/install/', '/install/index.html'], async (req, res, next) => {
      try {
        const installHtmlPath = path.resolve(__dirname, 'install/index.html');
        const rawHtml = await fsPromises.readFile(installHtmlPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(transformed);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        maxAge: '365d',
        immutable: true
      })
    );
    app.use(
      express.static(distDir, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
          }
        }
      })
    );
    app.get(['/install', '/install/', '/install/index.html'], (_req, res) => {
      res.sendFile(path.join(distDir, 'install', 'index.html'));
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
