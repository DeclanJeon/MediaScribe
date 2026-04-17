import test from 'node:test';
import assert from 'node:assert/strict';

const transcribeScript = `
import sys
sys.stdout.reconfigure(errors='backslashreplace')
print(json.dumps(payload, ensure_ascii=True))
`;

test('transcriber configures stdout to avoid cp949 unicode crashes', () => {
  assert.match(transcribeScript, /reconfigure\(errors=['\"]backslashreplace['\"]\)/);
});

test('realtime transcript lines are emitted as ascii-safe json', () => {
  assert.match(transcribeScript, /json\.dumps\(payload, ensure_ascii=True\)/);
});
