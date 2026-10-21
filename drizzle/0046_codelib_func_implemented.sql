-- Code Library SAP (D65): function modules become objects of their own (type
-- FUNC, SE37) instead of nodes of a function group, and every object gets an
-- "Implementado @" text (where / at which client it was built, ≤ 40 chars).
-- Idempotent: a second run finds no function module left inside a group.
ALTER TABLE "sap_objects" ADD COLUMN IF NOT EXISTS "implemented_at" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sap_objects" DROP CONSTRAINT IF EXISTS "sap_objects_type_chk";--> statement-breakpoint
ALTER TABLE "sap_objects" ADD CONSTRAINT "sap_objects_type_chk" CHECK ("sap_objects"."type" in ('PROG','FUGR','FUNC','CLAS','INTF','TABL','STRU','DTEL','DOMA','SNIP'));--> statement-breakpoint
ALTER TABLE "sap_objects" DROP CONSTRAINT IF EXISTS "sap_objects_impl_len";--> statement-breakpoint
ALTER TABLE "sap_objects" ADD CONSTRAINT "sap_objects_impl_len" CHECK (char_length("sap_objects"."implemented_at") <= 40);--> statement-breakpoint
-- Each FM node (g = 'fm') of a live function group becomes a FUNC object of
-- the same tenant / author / creation date: name = the FM name, description =
-- its short text, one node 'fm' with the same tabs, the attributes form
-- gaining fugr = the group's name. Then the FM nodes leave the group. One
-- statement (a data-modifying CTE always runs to completion, even unread),
-- so both happen or neither.
WITH fms AS (
  SELECT o.id AS gid, o.tenant_id, o.created_by, o.created_at, o.name AS gname, e.n, e.i
  FROM "sap_objects" o
  CROSS JOIN LATERAL jsonb_array_elements(o.nodes) WITH ORDINALITY AS e(n, i)
  WHERE o.type = 'FUGR' AND o.deleted_at IS NULL AND jsonb_typeof(o.nodes) = 'array'
    AND e.n ->> 'g' = 'fm'
), moved AS (
  INSERT INTO "sap_objects" (tenant_id, type, name, description, tags, nodes, created_by, created_at, updated_at)
  SELECT
    f.tenant_id,
    'FUNC',
    left(coalesce(f.n ->> 'label', ''), 120),
    left(coalesce((
      SELECT regexp_replace(t -> 'vals' ->> 'text', '[\r\n]+', ' ', 'g')
      FROM jsonb_array_elements(f.n -> 'tabs') AS t
      WHERE t ->> 'view' = 'form' AND t ->> 'k' = 'attr' AND jsonb_typeof(t -> 'vals' -> 'text') = 'string'
      LIMIT 1), ''), 500),
    '{}'::text[],
    jsonb_build_array(jsonb_build_object(
      'id', 'fm',
      'g', 'fm',
      'label', left(coalesce(f.n ->> 'label', ''), 80),
      'tabs', (
        SELECT coalesce(jsonb_agg(
          CASE WHEN t ->> 'view' = 'form' AND t ->> 'k' = 'attr' AND jsonb_typeof(t -> 'vals') = 'object'
            THEN jsonb_set(t, '{vals,fugr}', to_jsonb(left(f.gname, 2000)))
            ELSE t END ORDER BY ti), '[]'::jsonb)
        FROM jsonb_array_elements(f.n -> 'tabs') WITH ORDINALITY AS x(t, ti)))),
    f.created_by,
    f.created_at,
    now()
  FROM fms f
  ORDER BY f.gid, f.i
  RETURNING id
)
UPDATE "sap_objects" o
SET nodes = (
    SELECT coalesce(jsonb_agg(e.n ORDER BY e.i), '[]'::jsonb)
    FROM jsonb_array_elements(o.nodes) WITH ORDINALITY AS e(n, i)
    WHERE e.n ->> 'g' IS DISTINCT FROM 'fm'),
  updated_at = now()
WHERE o.id IN (SELECT DISTINCT gid FROM fms);
