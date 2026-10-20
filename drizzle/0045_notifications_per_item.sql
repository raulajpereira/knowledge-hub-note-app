-- One notification per item: the generator's due / overdue / reminder / meeting
-- notifications were keyed per day, so an item still overdue showed once per
-- day. They now share one key per item ("task:<id>") and the occasion goes in
-- meta.stamp. Keeps the latest of each item, rekeys it. Idempotent.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, item_type, item_id ORDER BY created_at DESC, id DESC) AS rn
    FROM notifications
   WHERE kind IN ('task_due','task_overdue','task_reminder','issue_due','issue_overdue','meeting')
     AND item_id IS NOT NULL
)
DELETE FROM notifications n USING ranked r WHERE n.id = r.id AND r.rn > 1;--> statement-breakpoint
UPDATE notifications
   SET meta = meta || jsonb_build_object('stamp', substring(dedupe_key from '^[a-z_]+:[0-9a-f-]{36}:(.*)$')),
       dedupe_key = item_type || ':' || item_id::text
 WHERE kind IN ('task_due','task_overdue','task_reminder','issue_due','issue_overdue','meeting')
   AND item_id IS NOT NULL
   AND dedupe_key <> item_type || ':' || item_id::text;
