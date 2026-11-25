import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTKEYS_CATALOG,
  MOBILE_SLASH_COMMANDS,
  getNextChatId,
  isHotkeyMatch,
  isApplePlatform,
  matchMobileSlashCommands
} from './hotkeys.ts';

test('HOTKEYS_CATALOG contains primary desktop and mobile shortcuts with labels and keys', () => {
  assert.ok(HOTKEYS_CATALOG.length >= 8);
  const newChat = HOTKEYS_CATALOG.find((h) => h.id === 'new-chat');
  assert.ok(newChat);
  assert.deepEqual(newChat?.keys, ['Ctrl', 'N']);
  assert.equal(newChat?.slashCommand, '/new');

  const searchChats = HOTKEYS_CATALOG.find((h) => h.id === 'search-chats');
  assert.ok(searchChats);
  assert.deepEqual(searchChats?.keys, ['Ctrl', 'K']);

  const sendMessage = HOTKEYS_CATALOG.find((h) => h.id === 'send-message');
  assert.ok(sendMessage);
  assert.deepEqual(sendMessage?.keys, ['Ctrl', 'Enter']);
});

test('getNextChatId navigates forward and backward cleanly with wrapping', () => {
  const rooms = [{ id: 'room-1' }, { id: 'room-2' }, { id: 'room-3' }];

  // Empty or invalid
  assert.equal(getNextChatId([], null, 'next'), null);
  assert.equal(getNextChatId(rooms, null, 'next'), 'room-1');

  // Next
  assert.equal(getNextChatId(rooms, 'room-1', 'next'), 'room-2');
  assert.equal(getNextChatId(rooms, 'room-2', 'next'), 'room-3');
  assert.equal(getNextChatId(rooms, 'room-3', 'next'), 'room-1'); // wraps around

  // Prev
  assert.equal(getNextChatId(rooms, 'room-1', 'prev'), 'room-3'); // wraps backwards
  assert.equal(getNextChatId(rooms, 'room-3', 'prev'), 'room-2');
  assert.equal(getNextChatId(rooms, 'room-2', 'prev'), 'room-1');
});

test('isHotkeyMatch evaluates modifier keys, e.key, and Arabic-layout e.code fallback', () => {
  const ctrlKEvent = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: 'k',
    code: 'KeyK'
  } as unknown as KeyboardEvent;

  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: true, key: 'k' }), true);
  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: true, key: 'n' }), false);
  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: false, key: 'k' }), false);
  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: true, shift: true, key: 'k' }), false);

  // Bilingual / Arabic keyboard layout where e.key is 'ن' but physical e.code is 'KeyN'
  const arabicCtrlNEvent = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: 'ن',
    code: 'KeyN'
  } as unknown as KeyboardEvent;

  assert.equal(isHotkeyMatch(arabicCtrlNEvent, { ctrlOrMeta: true, key: 'n' }), true);

  const metaEnterEvent = {
    ctrlKey: false,
    metaKey: true,
    shiftKey: false,
    altKey: false,
    key: 'Enter',
    code: 'Enter'
  } as unknown as KeyboardEvent;

  assert.equal(isHotkeyMatch(metaEnterEvent, { ctrlOrMeta: true, key: 'Enter' }), true);

  const altArrowDownEvent = {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: true,
    key: 'ArrowDown',
    code: 'ArrowDown'
  } as unknown as KeyboardEvent;

  assert.equal(isHotkeyMatch(altArrowDownEvent, { alt: true, key: 'ArrowDown' }), true);
  assert.equal(isHotkeyMatch(altArrowDownEvent, { alt: false, key: 'ArrowDown' }), false);
});

test('matchMobileSlashCommands returns matching commands for / queries only', () => {
  assert.equal(matchMobileSlashCommands('hello').length, 0);
  assert.equal(matchMobileSlashCommands('/lock extra').length, 0);
  assert.equal(matchMobileSlashCommands('/').length, MOBILE_SLASH_COMMANDS.length);

  const lockMatches = matchMobileSlashCommands('/lo');
  assert.equal(lockMatches.length, 1);
  assert.equal(lockMatches[0].id, 'lock-app');

  const arabicMatches = matchMobileSlashCommands('/قفل');
  assert.equal(arabicMatches.length, 1);
  assert.equal(arabicMatches[0].id, 'lock-app');
});

test('isApplePlatform returns a boolean without throwing in test environment', () => {
  assert.equal(typeof isApplePlatform(), 'boolean');
});

