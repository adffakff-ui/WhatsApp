import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTKEYS_CATALOG,
  getNextChatId,
  isHotkeyMatch,
  isApplePlatform
} from './hotkeys.ts';

test('HOTKEYS_CATALOG contains primary desktop shortcuts with labels and keys', () => {
  assert.ok(HOTKEYS_CATALOG.length >= 8);
  const newChat = HOTKEYS_CATALOG.find((h) => h.id === 'new-chat');
  assert.ok(newChat);
  assert.deepEqual(newChat?.keys, ['Ctrl', 'N']);

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

test('isHotkeyMatch accurately evaluates modifier keys and key values', () => {
  const ctrlKEvent = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: 'k'
  } as unknown as KeyboardEvent;

  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: true, key: 'k' }), true);
  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: true, key: 'n' }), false);
  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: false, key: 'k' }), false);
  assert.equal(isHotkeyMatch(ctrlKEvent, { ctrlOrMeta: true, shift: true, key: 'k' }), false);

  const metaEnterEvent = {
    ctrlKey: false,
    metaKey: true,
    shiftKey: false,
    altKey: false,
    key: 'Enter'
  } as unknown as KeyboardEvent;

  assert.equal(isHotkeyMatch(metaEnterEvent, { ctrlOrMeta: true, key: 'Enter' }), true);

  const altArrowDownEvent = {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: true,
    key: 'ArrowDown'
  } as unknown as KeyboardEvent;

  assert.equal(isHotkeyMatch(altArrowDownEvent, { alt: true, key: 'ArrowDown' }), true);
  assert.equal(isHotkeyMatch(altArrowDownEvent, { alt: false, key: 'ArrowDown' }), false);
});

test('isApplePlatform returns a boolean without throwing in test environment', () => {
  assert.equal(typeof isApplePlatform(), 'boolean');
});
