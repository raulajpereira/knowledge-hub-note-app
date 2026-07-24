import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { getIssueAlerts } from '../lib/issueAlerts.js';

const CountsContext = createContext(null);

export function CountsProvider({ children }) {
  const [counts, setCounts] = useState({});
  const [issueAlerts, setIssueAlerts] = useState([]);

  const refresh = useCallback(async () => {
    const [notesR, voiceR, tasksR, tagsR, artifactsR, issuesR, codeFoldersR, trashedNotesR, trashedTasksR, trashedVoiceR] = await Promise.all([
      api.listNotes(),
      api.listVoiceNotes(),
      api.listTasks(),
      api.listTags(),
      api.listArtifacts(),
      api.listIssues(),
      api.listCodeFolders(),
      api.listNotes(true),
      api.listTasks(true),
      api.listVoiceNotes(true),
    ]);
    setCounts({
      notes: notesR.notes.length,
      voice: voiceR.voiceNotes.length,
      tasks: tasksR.tasks.length,
      tags: tagsR.tags.length,
      artifacts: artifactsR.artifacts.length,
      issues: issuesR.issues.length,
      codeLibrary: codeFoldersR.folders.length,
      trash: trashedNotesR.notes.length + trashedTasksR.tasks.length + trashedVoiceR.voiceNotes.length,
    });
    // Computed from the same issues list already fetched above, so every
    // place that already calls refresh() after an issue mutation (create,
    // delete, status/due changes) keeps the notification bell in sync too,
    // instead of it drifting from data shown elsewhere.
    setIssueAlerts(getIssueAlerts(issuesR.issues));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <CountsContext.Provider value={{ counts, issueAlerts, refresh }}>{children}</CountsContext.Provider>;
}

export function useCounts() {
  const ctx = useContext(CountsContext);
  if (!ctx) throw new Error('useCounts must be used within CountsProvider');
  return ctx;
}
