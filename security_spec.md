# Security Specification & Hardening Audit — Wasil Messenger

## 1. Data Invariants
1. **PII Isolation**: User email and phone reside strictly in `/users/{userId}/private/info` and are readable/writable ONLY by the authenticated owner (`request.auth.uid == userId`). Public messaging metadata (`/users/{userId}/public/profile`) contains zero PII.
2. **E2EE Message Confidentiality**: Messages under `/chats/{chatId}/messages/{messageId}` store only `ciphertext`, `iv`, and `algorithm: 'AES-GCM-256'`. No plaintext message body is persisted in Firestore.
3. **Master Gate Membership**: Every access to `/chats/{chatId}` or `/chats/{chatId}/messages/{messageId}` verifies active membership in `/chats/{chatId}/members/{request.auth.uid}` (`get` / `create` / `update` / `delete`) and `request.auth.uid in resource.data.viewerIds` (bounded `<= 50`) for `list` queries without `get()` loops.
4. **Atomicity Guarantee**: Creating `/chats/{chatId}` enforces `existsAfter(/databases/$(database)/documents/chats/$(chatId)/members/$(request.auth.uid))` so orphaned chats without an admin member cannot exist.
5. **Terminal State Locking**: Once a `/calls/{callId}` document transitions to `'ended'`, `'declined'`, or `'missed'`, all further updates are rejected.
6. **Temporal Integrity & Verified Auth**: All writes require `request.auth.token.email_verified == true` and enforce `createdAt == request.time` / `updatedAt == request.time` with immutable `createdAt` and creator/owner UIDs.
7. **Scoped Member Action Updates**: Chat members may only acknowledge delivery/read receipts (`deliveredToIds`, `readByIds`), toggle reactions/stars/poll votes, or update their own `isTyping` indicator without mutating message ciphertext, `senderId`, or admin roles.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Message Read**: `get` on `/chats/chat_1/messages/msg_1` with `auth: null` -> `PERMISSION_DENIED`.
2. **Email Unverified Write**: `create` on `/chats/chat_1/messages/msg_1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Message**: `create` on `/chats/chat_1/messages/msg_1` by `uid: 'user_a'` with `senderId: 'user_b'` -> `PERMISSION_DENIED`.
4. **Shadow / Ghost Field Injection**: `create` on `/users/user_a/public/profile` with extra `isAdmin: true` -> `PERMISSION_DENIED`.
5. **PII Blanket Read**: `get` on `/users/user_a/private/info` by `uid: 'user_b'` -> `PERMISSION_DENIED`.
6. **Non-Member Chat Hijack**: `get` or `create` on `/chats/chat_1/messages/msg_2` by `uid: 'outsider'` -> `PERMISSION_DENIED`.
7. **ID Poisoning (Oversized/Invalid ID)**: `create` on `/chats/bad$$id_exceeding_chars.../members/user_a` -> `PERMISSION_DENIED`.
8. **Timestamp Forgery**: `create` on `/calls/call_1` with client-backdated `createdAt` (`!= request.time`) -> `PERMISSION_DENIED`.
9. **Terminal Call Tampering**: `update` on `/calls/call_1` where `existing().status == 'ended'` trying to set `status: 'connected'` -> `PERMISSION_DENIED`.
10. **Value Poisoning on Update**: `update` on `/chats/chat_1` trying to set `title: 12345` (non-string) or `> 100` chars -> `PERMISSION_DENIED`.
11. **Privilege Escalation in Group**: `update` on `/chats/chat_1/members/user_b` by non-admin `user_b` changing `role` from `'member'` to `'admin'` -> `PERMISSION_DENIED`.
12. **Blanket List Query Scraping**: `list` on `/statuses` or `/calls` where `uid` is neither author/participant nor in `viewerIds` -> `PERMISSION_DENIED`.
