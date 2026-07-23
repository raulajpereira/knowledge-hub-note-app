import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const CountsContext = createContext(null);

export function CountsProvider({ children }) {
  const [counts, setCounts] = useState({});

  const refresh = useCallback(async () => {
    const [notesR, voiceR, tasksR, tagsR, artifactsR, issuesR, trashedNotesR, trashedTasksR, trashedVoiceR] = await Promise.all([
      api.listNotes(),
      api.listVoiceNotes(),
      api.listTasks(),
      api.listTags(),
      api.listArtifacts(),
      api.listIssues(),
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
      trash: trashedNotesR.notes.length + trashedTasksR.tasks.length + trashedVoiceR.voiceNotes.length,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <CountsContext.Provider value={{ counts, refresh }}>{children}</CountsContext.Provider>;
}

export function useCounts() {
  const ctx = useContext(CountsContext);
  if (!ctx) throw new Error('useCounts must be used within CountsProvider');
  return ctx;
}
