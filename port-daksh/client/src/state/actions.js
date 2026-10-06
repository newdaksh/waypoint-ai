import { useCallback } from 'react';
import { api } from '../api.js';
import { activeJobOf } from '../lib/derive.js';
import { useTasks } from './TaskContext.jsx';
import { useWorkspace } from './WorkspaceContext.jsx';

/**
 * AI actions needed by more than one screen. Single-use actions live in their own page.
 * Each returns a promise resolving to true when the task succeeded.
 */
export function useResumeActions() {
  const { ws } = useWorkspace();
  const tasks = useTasks();

  const analyzeResume = useCallback(
    () =>
      tasks.ai(
        'Analyzing resume…',
        ['Extracting content', 'Understanding experience', 'Matching skills', 'Detecting red flags', 'Generating recommendations'],
        'resume-analysis',
      ),
    [tasks],
  );

  const runAts = useCallback(
    (jobId) =>
      tasks.ai(
        'Comparing resume with the job…',
        ['Reading the job description', 'Extracting required keywords', 'Checking resume structure', 'Scoring coverage and fit'],
        'ats',
        { jobId: typeof jobId === 'string' ? jobId : activeJobOf(ws)?.id }, // (a click event is not a job id)
      ),
    [tasks, ws],
  );

  /** The text of a chosen resume file, or null if it couldn't be read. .txt/.md are read in the browser; PDF/DOCX on the server. */
  const readResumeFile = useCallback(
    async (file) => {
      if (!file) return null;
      if (file.size > 5 * 1024 * 1024) {
        tasks.fail('File is larger than 5 MB.');
        return null;
      }
      if (/\.(txt|md)$/i.test(file.name)) return file.text();
      let text = null;
      await tasks.run('Reading file…', ['Extracting text'], async () => {
        ({ text } = await api.extractResume(file));
      });
      return text;
    },
    [tasks],
  );

  return { analyzeResume, runAts, readResumeFile };
}
