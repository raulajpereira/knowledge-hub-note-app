-- Integrity the Drizzle schema can't express on its own.

-- users ↔ codes reference each other (codes.created_by → users).
ALTER TABLE users ADD CONSTRAINT users_registered_code_fk
  FOREIGN KEY (registered_with_code_id) REFERENCES codes(id) ON DELETE SET NULL;--> statement-breakpoint

-- Enumerated text columns: enforce the allowed values in the database too.
ALTER TABLE tenants ADD CONSTRAINT tenants_kind_chk CHECK (kind IN ('pack','individual'));--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_status_chk CHECK (status IN ('trial','active','suspended','canceled'));--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_cycle_chk CHECK (billing_cycle IN ('monthly','annual'));--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_role_chk CHECK (role_in_tenant IN ('admin','member'));--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_status_chk CHECK (status IN ('active','invited','paused','disabled'));--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_lang_chk CHECK (lang IN ('pt','en'));--> statement-breakpoint
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_purpose_chk CHECK (purpose IN ('verify','reset','setup'));--> statement-breakpoint
ALTER TABLE codes ADD CONSTRAINT codes_status_chk CHECK (status IN ('active','paused','revoked','expired'));--> statement-breakpoint
ALTER TABLE admins ADD CONSTRAINT admins_role_chk CHECK (role IN ('owner','admin','billing','support','readonly'));--> statement-breakpoint
ALTER TABLE admins ADD CONSTRAINT admins_status_chk CHECK (status IN ('active','paused'));--> statement-breakpoint
ALTER TABLE audit_log ADD CONSTRAINT audit_actor_kind_chk CHECK (actor_kind IN ('user','system'));--> statement-breakpoint
ALTER TABLE modules ADD CONSTRAINT modules_grp_chk CHECK (grp IN ('base','pro','mgmt','dev','sap','feat','custom'));--> statement-breakpoint

-- Only one console owner (the operator's own account).
CREATE UNIQUE INDEX admins_single_owner ON admins ((role)) WHERE role = 'owner';--> statement-breakpoint

-- Audit log is append-only for the application role.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM kh_app;
