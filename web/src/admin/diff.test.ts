import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines } from './diff';

test('diffLines 標出新增與刪除的行', () => {
  const d = diffLines('a\nb\nc', 'a\nc\nd');
  assert.deepEqual(d, [{ kind: 'same', text: 'a' }, { kind: 'del', text: 'b' }, { kind: 'same', text: 'c' }, { kind: 'add', text: 'd' }]);
});
test('內容相同時沒有差異', () => {
  assert.ok(diffLines('x\ny', 'x\ny').every((l) => l.kind === 'same'));
});
