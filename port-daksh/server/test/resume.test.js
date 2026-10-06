import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import JSZip from 'jszip';
import { startServer } from './helpers.js';

const XML = '<?xml version="1.0" encoding="UTF-8"?>';

/** A minimal but valid .docx containing the given paragraphs. */
async function makeDocx(paragraphs) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('resume upload', () => {
  let s;
  let u;
  before(async () => { s = await startServer(); u = await s.signup(); });
  after(() => s.close());

  const upload = async (name, content, type = 'application/octet-stream') => {
    const form = new FormData();
    form.append('file', new Blob([content], { type }), name);
    const res = await fetch(`${s.base}/api/resume/extract`, { method: 'POST', body: form, headers: { cookie: u.cookie, 'x-requested-with': 'waypoint' } });
    return { status: res.status, body: await res.json() };
  };

  it('extracts and normalises plain text', async () => {
    const r = await upload('resume.txt', 'Jane Doe  \r\n\r\n\r\n\r\nSUMMARY\r\nBackend developer with five years of experience.');
    assert.equal(r.status, 200);
    assert.equal(r.body.text, 'Jane Doe\n\nSUMMARY\nBackend developer with five years of experience.');
  });

  it('extracts text from a DOCX', async () => {
    const r = await upload('resume.docx', await makeDocx(['Jane Doe', 'Backend developer with five years of experience.']));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.text, /Jane Doe\s+Backend developer with five years of experience\./);
  });

  it('extracts text from a real PDF', async (t) => {
    // pdf-parse ships sample PDFs with its tests; reuse one rather than vendoring a binary fixture.
    const pkg = createRequire(import.meta.url).resolve('pdf-parse/package.json');
    const sample = path.join(path.dirname(pkg), 'test', 'data', '05-versions-space.pdf');
    if (!fs.existsSync(sample)) return t.skip('pdf-parse sample not present');
    const r = await upload('resume.pdf', fs.readFileSync(sample), 'application/pdf');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.text, /v.0.01/);
  });

  it('requires login', async () => {
    const form = new FormData();
    form.append('file', new Blob(['hello world resume text']), 'r.txt');
    const res = await fetch(`${s.base}/api/resume/extract`, { method: 'POST', body: form, headers: { 'x-requested-with': 'waypoint' } });
    assert.equal(res.status, 401);
  });

  it('rejects unsupported file types', async () => {
    const r = await upload('photo.png', 'not really a png');
    assert.equal(r.status, 415);
    assert.match(r.body.error.message, /PDF, DOCX or TXT/);
  });

  it('reports files that cannot be parsed', async () => {
    const r = await upload('broken.pdf', 'this is not a pdf');
    assert.equal(r.status, 422);
    assert.match(r.body.error.message, /Paste the resume text/);
  });

  it('reports empty uploads and a missing file', async () => {
    assert.equal((await upload('empty.txt', '   ')).status, 422);
    const res = await fetch(`${s.base}/api/resume/extract`, { method: 'POST', body: new FormData(), headers: { cookie: u.cookie, 'x-requested-with': 'waypoint' } });
    assert.equal(res.status, 400);
  });

  it('enforces the 5 MB limit', async () => {
    const r = await upload('big.txt', 'a'.repeat(5 * 1024 * 1024 + 10));
    assert.equal(r.status, 413);
    assert.match(r.body.error.message, /5 MB/);
  });
});
