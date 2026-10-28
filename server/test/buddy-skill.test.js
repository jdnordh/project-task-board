import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'skills', 'buddy');
const SECTIONS = ['Title', 'Needs', 'Skip when', 'Gather', 'Write'];

test('SKILL.md is the buddy skill', () => {
  const md = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(md, /^---\r?\nname: buddy\r?\n/);
  assert.match(md, /\ndescription: .+/);
});

test('briefing sources run in file-name order and have every section', () => {
  const files = fs.readdirSync(path.join(SKILL, 'sources')).filter((f) => f.endsWith('.md')).sort();
  assert.deepEqual(files.slice(0, 3), ['10-meetings.md', '20-unfinished.md', '30-features.md']);
  for (const f of files) {
    const md = fs.readFileSync(path.join(SKILL, 'sources', f), 'utf8');
    for (const s of SECTIONS) assert.match(md, new RegExp(`^## ${s}\\s*$`, 'm'), `${f} is missing "## ${s}"`);
  }
});
