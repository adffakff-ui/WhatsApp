import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTranslatableMessageText,
  getTranslationLanguageMeta,
  parseGoogleTranslateSingleResponse,
  SUPPORTED_TRANSLATION_LANGUAGES
} from './translation';
import type { DecryptedMessage } from '../types/chat';

function makeMsg(overrides: Partial<DecryptedMessage>): DecryptedMessage {
  return {
    id: 'm1',
    chatId: 'c1',
    senderId: 'u1',
    senderName: 'أحمد',
    type: 'text',
    payload: { text: 'Hello world' },
    ciphertext: 'ct',
    iv: 'iv',
    algorithm: 'AES-GCM-256',
    reactions: {},
    reactionsCount: 0,
    starredBy: [],
    isDeleted: false,
    status: 'delivered',
    createdAtMs: 1000,
    ...overrides
  };
}

test('SUPPORTED_TRANSLATION_LANGUAGES and getTranslationLanguageMeta resolve preferred languages', () => {
  assert.ok(SUPPORTED_TRANSLATION_LANGUAGES.length >= 8);
  assert.equal(getTranslationLanguageMeta('ar').arabicName, 'العربية');
  assert.equal(getTranslationLanguageMeta('en').dir, 'ltr');
  assert.equal(getTranslationLanguageMeta('unknown-code').code, 'ar');
});

test('getTranslatableMessageText extracts text/poll question and skips deleted messages', () => {
  assert.equal(getTranslatableMessageText(makeMsg({ payload: { text: '  Bonjour!  ' } })), 'Bonjour!');
  assert.equal(
    getTranslatableMessageText(
      makeMsg({
        type: 'poll',
        payload: { text: 'استطلاع: Best time?', pollQuestion: 'Best meeting time?' }
      })
    ),
    'Best meeting time?'
  );
  assert.equal(getTranslatableMessageText(makeMsg({ isDeleted: true })), '');
});

test('parseGoogleTranslateSingleResponse joins multi-sentence segments and reads detected language', () => {
  const samplePayload = [
    [
      ['مرحباً بكم في تطبيق تواصل. ', 'Welcome to Wasil. ', null, null, 10],
      ['كيف حالك اليوم؟', 'How are you today?', null, null, 10]
    ],
    null,
    'en'
  ];

  const parsed = parseGoogleTranslateSingleResponse(samplePayload, 'ar');
  assert.ok(parsed);
  assert.equal(parsed.translatedText, 'مرحباً بكم في تطبيق تواصل. كيف حالك اليوم؟');
  assert.equal(parsed.detectedSourceLang, 'en');
  assert.equal(parseGoogleTranslateSingleResponse({}, 'ar'), null);
});
