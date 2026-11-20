import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVirtualWindow } from './virtualList';

test('computeVirtualWindow handles empty and small lists without unnecessary clipping', () => {
  const empty = computeVirtualWindow({
    totalCount: 0,
    itemHeight: 74,
    viewportHeight: 600,
    scrollTop: 0
  });
  assert.deepEqual(empty, {
    startIndex: 0,
    endIndex: 0,
    topSpacerHeight: 0,
    bottomSpacerHeight: 0,
    totalHeight: 0
  });

  const small = computeVirtualWindow({
    totalCount: 5,
    itemHeight: 74,
    viewportHeight: 600,
    scrollTop: 0
  });
  assert.equal(small.startIndex, 0);
  assert.equal(small.endIndex, 5);
  assert.equal(small.topSpacerHeight, 0);
  assert.equal(small.bottomSpacerHeight, 0);
});

test('computeVirtualWindow slices large lists cleanly and preserves exact totalHeight', () => {
  const totalCount = 5000;
  const itemHeight = 74;
  const win = computeVirtualWindow({
    totalCount,
    itemHeight,
    viewportHeight: 600,
    scrollTop: 7400,
    overscan: 6
  });

  assert.equal(win.startIndex, 94);
  assert.equal(win.endIndex, 115);
  assert.equal(win.topSpacerHeight, 94 * 74);
  assert.equal(win.bottomSpacerHeight, (5000 - 115) * 74);
  assert.equal(
    win.topSpacerHeight + (win.endIndex - win.startIndex) * itemHeight + win.bottomSpacerHeight,
    totalCount * itemHeight
  );
});

test('computeVirtualWindow clamps scrollTop within valid document bounds', () => {
  const win = computeVirtualWindow({
    totalCount: 100,
    itemHeight: 74,
    viewportHeight: 500,
    scrollTop: 999999,
    overscan: 4
  });

  assert.equal(win.endIndex, 100);
  assert.equal(win.bottomSpacerHeight, 0);
  assert.ok(win.startIndex >= 85 && win.startIndex < 100);
});
