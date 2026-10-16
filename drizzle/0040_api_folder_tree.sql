ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("parent_id");--> statement-breakpoint
-- API Playground subfolders. A folder's parent must be one of the same owner's
-- live folders of the same kind (RLS can't see across rows, as for notes in
-- 0005), only API folders nest, and a folder can't sit inside itself or one of
-- its descendants. The advisory lock serialises moves per owner, so two moves
-- running at once (A into B, B into A) can't form a loop between them.
-- Removing a parent: the service moves its children up first; ON DELETE SET
-- NULL is the fallback (they go to the top level).
CREATE OR REPLACE FUNCTION kh_folder_parent_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cur uuid;
  hops int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.kind <> 'api' THEN
    RAISE EXCEPTION 'only api folders nest' USING ERRCODE = 'KHF02';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kh_folder_tree:' || NEW.owner_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM folders f
    WHERE f.id = NEW.parent_id AND f.owner_id = NEW.owner_id AND f.tenant_id = NEW.tenant_id
      AND f.kind = NEW.kind AND f.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'folder not owned' USING ERRCODE = '23503';
  END IF;
  cur := NEW.parent_id;
  WHILE cur IS NOT NULL LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'folder cycle' USING ERRCODE = 'KHF01';
    END IF;
    hops := hops + 1;
    IF hops > 64 THEN
      RAISE EXCEPTION 'folder tree too deep' USING ERRCODE = 'KHF01';
    END IF;
    SELECT f.parent_id INTO cur FROM folders f WHERE f.id = cur;
  END LOOP;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER folders_parent_check BEFORE INSERT OR UPDATE OF parent_id, owner_id, tenant_id, kind ON "folders"
  FOR EACH ROW EXECUTE FUNCTION kh_folder_parent_check();
