import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { buildZipArchive, crc32 } from './zipBuilder.ts';

test('crc32 matches standard IEEE 802.3 vector', () => {
  assert.equal(crc32(Buffer.from('123456789', 'utf-8')), 0xcbf43926);
});

test('buildZipArchive produces valid PKZIP headers and roundtrips deflated + stored entries', () => {
  const repeatedText = 'Wasil Messenger Encrypted Backup & Installer! '.repeat(20);
  const tinyBinary = Uint8Array.from([1, 2, 3, 4]);

  const archive = buildZipArchive([
    { name: 'folder/readme.txt', data: repeatedText, mtime: new Date('2026-01-01T12:00:00Z') },
    { name: 'icon.bin', data: tinyBinary, mtime: new Date('2026-01-01T12:00:00Z') }
  ]);

  // Verify Local File Header signature at offset 0
  assert.equal(archive.readUInt32LE(0), 0x04034b50);

  // Verify End of Central Directory signature at the end (22 bytes)
  const eocdOffset = archive.length - 22;
  assert.equal(archive.readUInt32LE(eocdOffset), 0x06054b50);
  assert.equal(archive.readUInt16LE(eocdOffset + 8), 2); // entry count
  assert.equal(archive.readUInt16LE(eocdOffset + 10), 2);

  // Verify Central Directory signature at offset stored in EOCD
  const cdOffset = archive.readUInt32LE(eocdOffset + 16);
  assert.equal(archive.readUInt32LE(cdOffset), 0x02014b50);

  // Parse and verify first entry decompression
  const method1 = archive.readUInt16LE(8);
  const compSize1 = archive.readUInt32LE(18);
  const nameLen1 = archive.readUInt16LE(26);
  const name1 = archive.subarray(30, 30 + nameLen1).toString('utf-8');
  assert.equal(name1, 'folder/readme.txt');
  assert.equal(method1, 8); // deflated
  const payload1 = archive.subarray(30 + nameLen1, 30 + nameLen1 + compSize1);
  assert.equal(zlib.inflateRawSync(payload1).toString('utf-8'), repeatedText);

  // Parse second entry
  const offset2 = 30 + nameLen1 + compSize1;
  assert.equal(archive.readUInt32LE(offset2), 0x04034b50);
  const method2 = archive.readUInt16LE(offset2 + 8);
  const compSize2 = archive.readUInt32LE(offset2 + 18);
  const nameLen2 = archive.readUInt16LE(offset2 + 26);
  const payload2 = archive.subarray(offset2 + 30 + nameLen2, offset2 + 30 + nameLen2 + compSize2);
  const decoded2 = method2 === 8 ? zlib.inflateRawSync(payload2) : payload2;
  assert.deepEqual(new Uint8Array(decoded2), tinyBinary);
});
