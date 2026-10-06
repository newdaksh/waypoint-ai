import { useLayoutEffect, useRef, useState } from 'react';
import { renderDoc, textOf, wordCount } from '../lib/resumeDoc.js';
import { Button, Card, Row, Spacer, Split, Stack, TextArea } from './ui.jsx';

const paneTitle = { fontWeight: 600, fontSize: 14 };
const paneHint = { fontSize: 12, color: '#8b93a1' };

/** The resume laid out as a page. Editing the page edits the text (see lib/resumeDoc.js). */
function DocPage({ text, editing, onChange }) {
  const page = useRef(null);
  const drawn = useRef(null); // the text the page currently shows

  // Redraw when the text changed somewhere else. Our own edits are already on the page, and redrawing
  // them would throw the caret back to the start.
  useLayoutEffect(() => {
    if (drawn.current === text) return;
    renderDoc(page.current, text);
    drawn.current = text;
  }, [text]);

  const read = () => {
    drawn.current = textOf(page.current);
    onChange(drawn.current);
  };

  return (
    <div className="doc-desk resume-pane">
      <div
        ref={page}
        className="doc"
        role="textbox"
        aria-multiline="true"
        aria-label="Resume as a document"
        aria-readonly={!editing}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={editing}
        onInput={read}
        // A line may have become a heading or a bullet while it was typed: lay the page out again.
        onBlur={() => renderDoc(page.current, drawn.current)}
        onPaste={(e) => {
          e.preventDefault(); // text only: formatting lives in the layout, not in the resume
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
      />
    </div>
  );
}

/**
 * A resume shown twice, side by side: its plain text (what every analysis reads) and the same text laid
 * out as a document. Both are locked until "Edit" is chosen; a change in either shows in the other.
 */
export default function ResumeEditor({ title, text, onChange, startEditing = false, actions }) {
  const [editing, setEditing] = useState(startEditing);
  return (
    <Stack gap={10}>
      <Row gap={10} wrap>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
        <span style={paneHint}>{wordCount(text)} words</span>
        <Spacer />
        {actions}
        <Button variant={editing ? 'primary' : 'outline'} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done editing' : 'Edit'}
        </Button>
      </Row>
      <Split cols="minmax(0,1fr) minmax(0,1fr)">
        <Card pad={16} gap={10}>
          <Row justify="space-between" gap={10}>
            <span style={paneTitle}>Plain text (.txt)</span>
            <span style={paneHint}>{editing ? 'Editable' : 'Locked · choose Edit to change'}</span>
          </Row>
          <TextArea
            mono
            className="resume-pane"
            aria-label={`${title}: plain text`}
            placeholder={editing ? 'Paste or type the resume here' : 'Empty. Choose Edit to paste or type the resume, or upload a file.'}
            readOnly={!editing}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        </Card>
        <Card pad={16} gap={10} style={editing ? { borderColor: 'var(--acc-b)' } : undefined}>
          <Row justify="space-between" gap={10}>
            <span style={paneTitle}>Word view</span>
            <span style={paneHint}>{editing ? 'Editable · click into the page' : 'Laid out from the text'}</span>
          </Row>
          <DocPage text={text} editing={editing} onChange={onChange} />
        </Card>
      </Split>
    </Stack>
  );
}
