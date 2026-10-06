import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
// Import the implementation file directly: the package entry runs a debug routine on import.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { HttpError } from '../errors.js';

const MAX_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

const clean = (text) =>
  String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Turn an uploaded resume file into plain text. */
export async function extractText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.txt' || ext === '.md') return clean(file.buffer.toString('utf8'));
  if (ext === '.pdf') return clean((await pdfParse(file.buffer)).text);
  if (ext === '.docx') return clean((await mammoth.extractRawText({ buffer: file.buffer })).value);
  throw new HttpError(415, 'Unsupported file type. Upload a PDF, DOCX or TXT file, or paste the text.');
}

/** POST /api/resume/extract — multipart `file` → { text } */
export function resumeRoutes() {
  const router = Router();

  router.post('/extract', upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
    let text;
    try {
      text = await extractText(req.file);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, `${req.file.originalname}: couldn't read this file. Paste the resume text instead.`, { canRetry: false });
    }
    if (text.length < 20) {
      throw new HttpError(422, `${req.file.originalname}: no text could be extracted (scanned PDFs need OCR). Paste the resume text instead.`, { canRetry: false });
    }
    res.json({ text });
  });

  return router;
}
