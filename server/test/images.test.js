import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sniffImage, imageIds, IMAGE_MAX_BYTES } from '../src/lib/images.js';
import { stripHtml } from '../src/lib/desc.js';
import { agentRules } from '../src/lib/agent.js';
import { startApi, TOKEN } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0ccc59e70000000049454e44ae426082', 'hex');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const GIF = Buffer.from('GIF89a\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

let t;
before(async () => { t = await startApi(); });
after(() => t.close());

test('sniffImage reads magic bytes and rejects svg/html', () => {
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(JPEG), 'image/jpeg');
  assert.equal(sniffImage(GIF), 'image/gif');
  assert.equal(sniffImage(WEBP), 'image/webp');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(Buffer.from('<html><script>x</script>')), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
});

test('imageIds finds /api/images ids in order, relative or absolute', () => {
  const html = '<p><img src="/api/images/img1"> and <img alt="x" src="http://localhost:3005/api/images/img2"></p><img src="https://evil/x.png">';
  assert.deepEqual(imageIds(html), ['img1', 'img2']);
  assert.deepEqual(imageIds(''), []);
});

test('stripHtml writes images as [image]', () => {
  assert.equal(stripHtml('<p>a<img src="/api/images/x">b</p>'), 'a[image]b');
});

test('worker rules cover images in MCP and CLI form', () => {
  const mcp = agentRules().join('\n');
  assert.match(mcp, /get_task_images/);
  assert.match(mcp, /upload_report_image/);
  const cli = agentRules({ cli: 'node "C:/r/scripts/grove.js"', id: 't1' }).join('\n');
  assert.match(cli, /task-images t1/);
  assert.match(cli, /task-image t1 <file>/);
});

test('POST /api/images stores bytes and GET serves them with the sniffed type', async () => {
  const up = await t.api('POST', '/api/images', PNG, { 'Content-Type': 'image/png' });
  assert.equal(up.status, 201);
  assert.match(up.body.url, /^\/api\/images\/img/);
  const got = await t.api('GET', up.body.url);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(got.buf.equals(PNG));
  assert.equal((await t.api('GET', '/api/images/nope')).status, 404);
});

test('POST /api/images refuses non-images and files over the cap', async () => {
  const bad = await t.api('POST', '/api/images', Buffer.from('<html>hi</html>'), { 'Content-Type': 'image/png' });
  assert.equal(bad.status, 400);
  const big = Buffer.concat([PNG, Buffer.alloc(IMAGE_MAX_BYTES)]);
  assert.equal((await t.api('POST', '/api/images', big, { 'Content-Type': 'image/png' })).status, 413);
});

test('task images list follows the description; report-image uploads a local file', async () => {
  const f = await t.feature();
  const a = (await t.api('POST', '/api/images', PNG, { 'Content-Type': 'image/png' })).body;
  const b = (await t.api('POST', '/api/images', JPEG, { 'Content-Type': 'image/jpeg' })).body;
  const task = (await t.api('POST', '/api/tasks', {
    title: 'Pics', feature: f.id, desc_html: `<p>see <img src="${b.url}"></p><p><img src="${a.url}"></p>`,
  })).body;
  assert.equal(task.desc, 'see [image]\n[image]');
  const list = (await t.api('GET', `/api/tasks/${task.id}/images`)).body;
  assert.deepEqual(list.map((i) => i.id), [b.id, a.id]);
  assert.equal(list[0].mime, 'image/jpeg');

  const auth = { Authorization: `Bearer ${TOKEN}` };
  const file = path.join(t.tmp, 'shot.png');
  fs.writeFileSync(file, PNG);
  const r = await t.api('POST', `/api/tasks/${task.id}/report-image`, { path: file, caption: 'Shot' }, auth);
  assert.equal(r.status, 201);
  assert.match(r.body.markdown, /^!\[Shot\]\(\/api\/images\/img[^)]+\)$/);
  const txt = path.join(t.tmp, 'a.txt');
  fs.writeFileSync(txt, 'x');
  assert.equal((await t.api('POST', `/api/tasks/${task.id}/report-image`, { path: txt }, auth)).status, 400);
  const fake = path.join(t.tmp, 'fake.png');
  fs.writeFileSync(fake, '<svg></svg>');
  assert.equal((await t.api('POST', `/api/tasks/${task.id}/report-image`, { path: fake }, auth)).status, 400);
  assert.equal((await t.api('POST', `/api/tasks/${task.id}/report-image`, { path: file })).status, 401);
});
