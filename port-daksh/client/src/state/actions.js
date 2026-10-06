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
  const { ws, set } = useWorkspace();
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

  /** Load a chosen resume file into the master resume. .txt/.md are read in the browser; PDF/DOCX on the server. */
  const loadResumeFile = useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return tasks.fail('File is larger than 5 MB.');
      if (/\.(txt|md)$/i.test(file.name)) {
        set({ resumeText: await file.text() });
        return;
      }
      await tasks.run('Reading file…', ['Extracting text'], async () => {
        const { text } = await api.extractResume(file);
        set({ resumeText: text });
      });
    },
    [tasks, set],
  );

  return { analyzeResume, runAts, loadResumeFile };
}
