/**
 * The document view of a resume.
 *
 * The page is drawn from the resume's plain text, one block per line, and read back from those blocks
 * after an edit. Text is the only thing stored, so the text and document views can never disagree and
 * every analysis sees exactly what is on the page.
 */

const SECTION =
  /^(summary|profile|objective|career objective|professional summary|about( me)?|experience|work experience|professional experience|employment( history)?|education|skills|technical skills|key skills|core competencies|projects|personal projects|certifications?|achievements|awards|publications|languages|interests|hobbies|references|internships?|training|courses|volunteer(ing)?( experience)?|contact|links)\s*:?$/i;
const BULLET = /^(\s*[-–—•●▪■◦·*]\s+)(.*)$/;
const CONTACT = /@|https?:|www\.|linkedin|github|\+?\d[\d\s().-]{7,}\d/i;
const LABEL = /^([A-Z][\w &/+.#-]{1,38}:)(\s.*)$/; // "Databases: PostgreSQL, Redis"

const isSection = (t) => SECTION.test(t) || (t.length <= 40 && /[A-Z]{3}/.test(t) && t === t.toUpperCase() && !/[.,;@\d]/.test(t));
const isName = (t) => t.length <= 60 && t.split(/\s+/).length <= 5 && !/[@\d:|]/.test(t) && !SECTION.test(t);

/**
 * Classify each line: { kind, prefix, text }. `prefix` is what the page doesn't show (indentation, the
 * bullet marker) and `prefix + text` is always the original line, so reading the blocks back is exact.
 */
export function blocksOf(source) {
  let first = true; // the first line with text may be the name
  let masthead = false; // between the name and the first blank line or section: contact details
  return String(source).split('\n').map((line) => {
    const lead = line.match(/^\s*/)[0];
    const text = line.slice(lead.length);
    const wasFirst = first;
    if (text) first = false;

    const bullet = line.match(BULLET);
    if (!text || bullet || isSection(text.trim())) masthead = false;
    if (!text) return { kind: 'gap', prefix: '', text: '' };
    if (bullet) return { kind: 'bullet', prefix: bullet[1], text: bullet[2] };
    if (wasFirst && isName(text)) {
      masthead = true;
      return { kind: 'name', prefix: lead, text };
    }
    if (isSection(text.trim())) return { kind: 'section', prefix: lead, text };
    return { kind: masthead && CONTACT.test(text) ? 'contact' : 'para', prefix: lead, text };
  });
}

function nodeOf({ kind, prefix, text }) {
  const el = document.createElement('div');
  el.className = `doc__${kind}`;
  if (prefix) el.dataset.p = prefix;
  const label = (kind === 'para' || kind === 'bullet') && text.match(LABEL);
  if (label) {
    const b = document.createElement('b');
    b.textContent = label[1];
    el.append(b, label[2]);
  } else if (text) el.textContent = text;
  else el.append(document.createElement('br')); // an empty block needs one to keep its height and take the caret
  return el;
}

/** Draw `text` into the page element. */
export function renderDoc(page, text) {
  page.replaceChildren(...blocksOf(text).map(nodeOf));
}

function innerText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue;
    else if (child.nodeName === 'BR') out += '\n';
    else if (child.nodeName === 'DIV' || child.nodeName === 'P') out += `${out && !out.endsWith('\n') ? '\n' : ''}${innerText(child)}\n`;
    else out += innerText(child);
  }
  return out;
}

/** Read the page back as plain text, after the browser has edited it (split, merged or emptied blocks). */
export function textOf(page) {
  const lines = [];
  for (const node of page.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) lines.push(...node.nodeValue.split('\n'));
    else if (node.nodeName === 'BR') lines.push('');
    else {
      const prefix = node.dataset?.p || '';
      const own = innerText(node).replace(/\n$/, '').split('\n');
      lines.push(...own.map((line, i) => (i === 0 && line ? prefix + line : line)));
    }
  }
  return lines.join('\n').replace(/ /g, ' '); // browsers insert non-breaking spaces while typing
}

export const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);
