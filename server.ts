import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
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

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

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
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
