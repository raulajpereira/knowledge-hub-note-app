-- Review 10/11: the person's own rows outside the tenant data (preferences
-- and profile/background/logo images) get RLS too: a row is seen and changed
-- only by its owner (app.user_id, set by asSelf()). Before, only the code's
-- WHERE user_id = … kept them apart. Nothing is deleted or changed.
ALTER TABLE user_prefs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS user_prefs_self ON user_prefs;--> statement-breakpoint
CREATE POLICY user_prefs_self ON user_prefs
  USING (user_id = kh_user_id())
  WITH CHECK (user_id = kh_user_id());--> statement-breakpoint
DROP POLICY IF EXISTS user_assets_self ON user_assets;--> statement-breakpoint
CREATE POLICY user_assets_self ON user_assets
  USING (user_id = kh_user_id())
  WITH CHECK (user_id = kh_user_id());
