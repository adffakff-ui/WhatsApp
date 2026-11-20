import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

test('Dirty Dozen security invariants are enforced in firestore.rules', () => {
  // 1. Global deny catch-all
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);

  // 2. Email verified check for standard writes
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);

  // 3. Identity spoofing prevented on messages & calls
  assert.match(rulesContent, /incoming\(\)\.senderId == request\.auth\.uid/);
  assert.match(rulesContent, /incoming\(\)\.callerId == request\.auth\.uid/);

  // 4. Shadow/ghost field protection via hasOnly
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly\(/);

  // 5. PII isolation on private/info
  assert.match(rulesContent, /match \/users\/\{userId\}\/private\/\{docId\}[\s\S]*allow get: if isOwner\(userId\)/);

  // 6. Master gate membership on chats & messages
  assert.match(rulesContent, /isChatMember\(chatId\)/);

  // 7. ID poisoning guard
  assert.match(rulesContent, /isValidId\(/);

  // 8. Temporal integrity on createdAt/updatedAt
  assert.match(rulesContent, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);

  // 9. Terminal state locking on calls
  assert.match(rulesContent, /!\(existing\(\)\.status in \['ended', 'declined', 'missed'\]\)/);

  // 10. Group admin role escalation protection
  assert.match(rulesContent, /incoming\(\)\.role == existing\(\)\.role/);

  // 11. Zero get()/exists() inside allow list blocks
  const listRules = rulesContent.match(/allow list:[^;]+;/g) || [];
  assert.ok(listRules.length > 0, 'Expected allow list rules');
  for (const rule of listRules) {
    assert.equal(rule.includes('get('), false, `allow list must not use get(): ${rule}`);
    assert.equal(rule.includes('exists('), false, `allow list must not use exists(): ${rule}`);
  }

  // 12. Scoped message receipt & typing fields
  assert.match(rulesContent, /'deliveredToIds'/);
  assert.match(rulesContent, /'readByIds'/);
  assert.match(rulesContent, /'lastMessageDeliveredToIds'/);
  assert.match(rulesContent, /'lastMessageReadByIds'/);
  assert.match(rulesContent, /'isTyping'/);

  // 13. Multi-device session isolation & owner-only E2EE key sync
  assert.match(rulesContent, /match \/users\/\{userId\}\/devices\/\{deviceId\}/);
  assert.match(rulesContent, /isValidDeviceSession/);
  assert.match(rulesContent, /'identityPrivateKeyJwk'/);

  // 14. Per-chat wallpaper preference strictly validated & owner-isolated
  assert.match(rulesContent, /isValidWallpaper/);
  assert.match(rulesContent, /'wallpaper'/);
  assert.match(rulesContent, /val\.size\(\) <= 65536/);

  // 15. Blocked contacts list is owner-isolated & enforced on direct messages & calls
  assert.match(rulesContent, /match \/users\/\{userId\}\/blockedUsers\/\{blockedUid\}/);
  assert.match(rulesContent, /isValidBlockedContact/);
  assert.match(rulesContent, /incoming\(\)\.blockedUid != request\.auth\.uid/);
  assert.match(rulesContent, /!isDirectPeerBlockedAfter\(chatId\)/);
  assert.match(rulesContent, /!isBlockedBetween\(request\.auth\.uid, incoming\(\)\.calleeId\)/);
});

