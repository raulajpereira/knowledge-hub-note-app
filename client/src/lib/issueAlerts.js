export function parseDueDate(due) {
  if (!due || !due.trim()) return null;
  let d = new Date(due);
  if (isNaN(d.getTime())) {
    d = new Date(`${due} ${new Date().getFullYear()}`);
    if (isNaN(d.getTime())) return null;
  }
  return d;
}

// Real, non-fabricated notifications derived from Project Issues due dates —
// no backend notification system exists, so this stays purely computed from
// data the user already has.
export function getIssueAlerts(issues, { soonDays = 3 } = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alerts = [];
  for (const issue of issues) {
    if (issue.status === 'Done') continue;
    const due = parseDueDate(issue.due);
    if (!due) continue;
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) alerts.push({ issue, kind: 'overdue', days: Math.abs(diffDays) });
    else if (diffDays <= soonDays) alerts.push({ issue, kind: 'soon', days: diffDays });
  }

  alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'overdue' ? -1 : 1;
    return a.kind === 'overdue' ? b.days - a.days : a.days - b.days;
  });
  return alerts;
}
