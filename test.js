import assert from 'node:assert/strict';

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

assert.equal(csvEscape('simple'), 'simple');
assert.equal(csvEscape('a,b'), '"a,b"');
assert.equal(csvEscape('with "quote"'), '"with ""quote"""');
assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');

console.log('csvEscape tests passed');
