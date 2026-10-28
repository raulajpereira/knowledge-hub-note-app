-- Alocações v2 (alloc2).
-- 1. Management data belongs to the user who created it (D-alloc2): teams,
--    people, projects, allocations, timesheets, requests and settings get an
--    owner_id and RLS checks tenant + owner, like notes and tickets. Existing
--    rows go to the tenant's account owner: its earliest active admin (else
--    its earliest active user, else its earliest user); rows of a tenant
--    without users (nobody could open them) are removed. mg_clients stay
--    shared by the tenant (SAP Systems, Transports and Tickets use them).
-- 2. New model: mg_bookings (range + effort rule, person or a role "Por
--    atribuir", confirmed / tentative), mg_booking_days (days typed by hand),
--    mg_absences (vacation, sickness, training, other). Holidays are
--    computed in code (src/lib/alloc.ts). mg_people.cap is the person's
--    weekly hours ("Horas semanais").
-- 3. mg_allocs is converted to mg_bookings (same ids) and kept for rollback.
-- Idempotent: safe to run twice.

-- ── 1. Owners ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION kh_tmp_mg_owner(t uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT u.id FROM users u WHERE u.tenant_id = t
  ORDER BY (u.status = 'active' AND u.role_in_tenant = 'admin') DESC, (u.status = 'active') DESC, u.created_at, u.id
  LIMIT 1
$$;--> statement-breakpoint
DO $$
DECLARE tb text;
BEGIN
  FOREACH tb IN ARRAY ARRAY['mg_settings','mg_teams','mg_people','mg_projects','mg_allocs','mg_timesheets','mg_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "owner_id" uuid', tb);
    EXECUTE format('UPDATE %I SET "owner_id" = kh_tmp_mg_owner("tenant_id") WHERE "owner_id" IS NULL', tb);
    EXECUTE format('DELETE FROM %I WHERE "owner_id" IS NULL', tb);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "owner_id" SET NOT NULL', tb);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = tb || '_owner_id_users_id_fk') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action', tb, tb || '_owner_id_users_id_fk');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING btree ("tenant_id","owner_id")', tb || '_owner_idx', tb);
  END LOOP;
END $$;--> statement-breakpoint
DROP FUNCTION IF EXISTS kh_tmp_mg_owner(uuid);--> statement-breakpoint
-- settings: one row per manager (was one per tenant)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conname = 'mg_settings_pkey' AND a.attname = 'tenant_id'
  ) THEN
    ALTER TABLE "mg_settings" DROP CONSTRAINT "mg_settings_pkey";
    ALTER TABLE "mg_settings" ADD CONSTRAINT "mg_settings_pkey" PRIMARY KEY ("owner_id");
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE tb text;
BEGIN
  FOREACH tb IN ARRAY ARRAY['mg_settings','mg_teams','mg_people','mg_projects','mg_allocs','mg_timesheets','mg_requests'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tb || '_tenant', tb);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = tb AND policyname = tb || '_owner') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO kh_app USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id()) WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())', tb || '_owner', tb);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint

-- ── 2. New tables ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mg_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"person_id" uuid,
	"project_id" uuid NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"mode" text DEFAULT 'hpd' NOT NULL,
	"value" double precision NOT NULL,
	"mask" smallint DEFAULT 31 NOT NULL,
	"hol" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"need" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "mg_bookings_status_chk" CHECK ("status" in ('confirmed','tentative')),
	CONSTRAINT "mg_bookings_mode_chk" CHECK ("mode" in ('hpd','hpw','pct','fte','total')),
	CONSTRAINT "mg_bookings_range_chk" CHECK ("from_date" <= "to_date"),
	CONSTRAINT "mg_bookings_mask_chk" CHECK ("mask" between 1 and 127),
	CONSTRAINT "mg_bookings_value_chk" CHECK ("value" >= 0)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mg_booking_days" (
	"booking_id" uuid NOT NULL,
	"day" date NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"hours" double precision NOT NULL,
	CONSTRAINT "mg_booking_days_pk" PRIMARY KEY ("booking_id","day"),
	CONSTRAINT "mg_booking_days_hours_chk" CHECK ("hours" >= 0 AND "hours" <= 24)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mg_absences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"type" text DEFAULT 'ferias' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"hours" double precision,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "mg_absences_type_chk" CHECK ("type" in ('ferias','doenca','formacao','outra')),
	CONSTRAINT "mg_absences_range_chk" CHECK ("from_date" <= "to_date")
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mg_bookings_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "mg_bookings" ADD CONSTRAINT "mg_bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "mg_bookings" ADD CONSTRAINT "mg_bookings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "mg_bookings" ADD CONSTRAINT "mg_bookings_person_id_mg_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."mg_people"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "mg_bookings" ADD CONSTRAINT "mg_bookings_project_id_mg_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."mg_projects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mg_booking_days_booking_id_mg_bookings_id_fk') THEN
    ALTER TABLE "mg_booking_days" ADD CONSTRAINT "mg_booking_days_booking_id_mg_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."mg_bookings"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "mg_booking_days" ADD CONSTRAINT "mg_booking_days_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "mg_booking_days" ADD CONSTRAINT "mg_booking_days_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mg_absences_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "mg_absences" ADD CONSTRAINT "mg_absences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "mg_absences" ADD CONSTRAINT "mg_absences_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "mg_absences" ADD CONSTRAINT "mg_absences_person_id_mg_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."mg_people"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
-- range queries: the owner's bookings / absences overlapping [from, to]
CREATE INDEX IF NOT EXISTS "mg_bookings_range_idx" ON "mg_bookings" USING btree ("tenant_id","owner_id","to_date","from_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mg_bookings_person_idx" ON "mg_bookings" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mg_bookings_project_idx" ON "mg_bookings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mg_absences_range_idx" ON "mg_absences" USING btree ("tenant_id","owner_id","to_date","from_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mg_absences_person_idx" ON "mg_absences" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "mg_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mg_booking_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mg_absences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE tb text;
BEGIN
  FOREACH tb IN ARRAY ARRAY['mg_bookings','mg_booking_days','mg_absences'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = tb AND policyname = tb || '_owner') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO kh_app USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id()) WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())', tb || '_owner', tb);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "mg_bookings", "mg_booking_days", "mg_absences" TO kh_app;--> statement-breakpoint

-- ── 3. mg_allocs → mg_bookings ───────────────────────────────────────────────
-- Old rule (store.tsx aDay): Mon–Fri of the weeks from..to; a day typed in
-- extra.dov wins, else the week's extra.ovr, else `hours`, divided by 5.
-- New: allocations made with the side panel (extra.start/hpd/mask, dov
-- covering every weekday) become h/dia from `start` to the last day with
-- hours; the others h/semana over Monday..Friday of from..to. A day whose old
-- value differs from the new rule is kept as a typed day (mg_booking_days),
-- except where the new rule gives 0 because of a national holiday (the
-- difference expected — see scripts/alloc-regression.ts).
CREATE OR REPLACE FUNCTION kh_tmp_easter(y int) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; dy int;
BEGIN
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451; mo := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(y, mo, dy);
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_tmp_holiday(d date) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(d, 'MM-DD') IN ('01-01','04-25','05-01','06-10','08-15','10-05','11-01','12-01','12-08','12-25')
      OR d IN (kh_tmp_easter(extract(year FROM d)::int) - 2, kh_tmp_easter(extract(year FROM d)::int),
               kh_tmp_easter(extract(year FROM d)::int) + 60)
$$;--> statement-breakpoint
-- share of weekday k (0..4) of `total` hours spread over 5 days in half hours (alloc.ts spread())
CREATE OR REPLACE FUNCTION kh_tmp_share(total double precision, k int) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT floor(total / 5 * 2 + 1e-9) / 2
       + CASE WHEN k < floor((total - 5 * (floor(total / 5 * 2 + 1e-9) / 2)) * 2 + 1e-9) THEN 0.5 ELSE 0 END
       + CASE WHEN k = 0 AND total > 0 THEN round(((total - 5 * (floor(total / 5 * 2 + 1e-9) / 2))
              - floor((total - 5 * (floor(total / 5 * 2 + 1e-9) / 2)) * 2 + 1e-9) * 0.5)::numeric, 3)::double precision
              ELSE 0 END
$$;--> statement-breakpoint
DO $$
DECLARE
  a record; ex jsonb; dov jsonb; ovr jsonb; is_plan boolean; mask int; hpd double precision;
  f date; t date; d date; k int; want double precision; rule double precision; v text; wk text; covered int;
BEGIN
  FOR a IN SELECT * FROM mg_allocs al WHERE NOT EXISTS (SELECT 1 FROM mg_bookings b WHERE b.id = al.id) LOOP
    ex := coalesce(a.extra, '{}'::jsonb);
    dov := CASE WHEN jsonb_typeof(ex->'dov') = 'object' THEN ex->'dov' ELSE '{}'::jsonb END;
    ovr := CASE WHEN jsonb_typeof(ex->'ovr') = 'object' THEN ex->'ovr' ELSE '{}'::jsonb END;
    is_plan := false;
    IF ex ? 'start' AND ex ? 'hpd' AND jsonb_typeof(ex->'mask') = 'array' THEN
      SELECT count(*) INTO covered FROM generate_series(a.from_date, a.to_date + 4, interval '1 day') g(x)
        WHERE extract(isodow FROM g.x) < 6 AND dov ? to_char(g.x, 'YYYY-MM-DD') AND (dov->>to_char(g.x, 'YYYY-MM-DD')) <> '';
      is_plan := covered = ((a.to_date - a.from_date) / 7 + 1) * 5;
    END IF;
    IF is_plan THEN
      mask := 0;
      FOR k IN 0..4 LOOP
        IF coalesce((ex->'mask'->>k)::int, 0) = 1 THEN mask := mask | (1 << k); END IF;
      END LOOP;
      IF mask = 0 THEN mask := 31; END IF;
      hpd := coalesce((ex->>'hpd')::double precision, 0);
      f := greatest(a.from_date, (ex->>'start')::date);
      SELECT max(key::date) INTO t FROM jsonb_each_text(dov) WHERE value <> '' AND value::double precision > 0
        AND key::date BETWEEN a.from_date AND a.to_date + 4;
      t := greatest(f, coalesce(t, f));
      INSERT INTO mg_bookings (id, tenant_id, owner_id, person_id, project_id, role, status, from_date, to_date, mode, value, mask, created_at, updated_at)
      VALUES (a.id, a.tenant_id, a.owner_id, a.person_id, a.project_id, left(coalesce(ex->>'fn', ''), 120), 'confirmed', f, t, 'hpd', hpd, mask, a.created_at, date_trunc('milliseconds', now()));
      FOR d IN SELECT g.x::date FROM generate_series(f, t, interval '1 day') g(x) LOOP
        k := extract(isodow FROM d)::int - 1;
        IF k > 4 THEN CONTINUE; END IF;
        v := dov->>to_char(d, 'YYYY-MM-DD');
        want := CASE WHEN v IS NULL OR v = '' THEN 0 ELSE v::double precision END;
        rule := CASE WHEN mask & (1 << k) <> 0 THEN hpd ELSE 0 END;
        IF kh_tmp_holiday(d) AND want = rule THEN CONTINUE; END IF;
        IF want <> rule THEN
          INSERT INTO mg_booking_days (booking_id, day, tenant_id, owner_id, hours)
          VALUES (a.id, d, a.tenant_id, a.owner_id, least(24, greatest(0, want))) ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    ELSE
      INSERT INTO mg_bookings (id, tenant_id, owner_id, person_id, project_id, role, status, from_date, to_date, mode, value, mask, created_at, updated_at)
      VALUES (a.id, a.tenant_id, a.owner_id, a.person_id, a.project_id, left(coalesce(ex->>'fn', ''), 120), 'confirmed', a.from_date, a.to_date + 4, 'hpw', greatest(0, a.hours), 31, a.created_at, date_trunc('milliseconds', now()));
      FOR d IN SELECT g.x::date FROM generate_series(a.from_date, a.to_date + 4, interval '1 day') g(x) LOOP
        k := extract(isodow FROM d)::int - 1;
        IF k > 4 THEN CONTINUE; END IF;
        v := dov->>to_char(d, 'YYYY-MM-DD');
        wk := to_char(d - k, 'YYYY-MM-DD');
        rule := kh_tmp_share(greatest(0, a.hours), k);
        IF v IS NOT NULL AND v <> '' THEN
          want := v::double precision;
        ELSIF ovr ? wk AND (ovr->>wk) <> '' THEN
          IF kh_tmp_holiday(d) THEN CONTINUE; END IF;
          want := kh_tmp_share(greatest(0, (ovr->>wk)::double precision), k);
        ELSE
          CONTINUE;
        END IF;
        IF want <> rule OR kh_tmp_holiday(d) THEN
          INSERT INTO mg_booking_days (booking_id, day, tenant_id, owner_id, hours)
          VALUES (a.id, d, a.tenant_id, a.owner_id, least(24, greatest(0, want))) ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
DROP FUNCTION IF EXISTS kh_tmp_share(double precision, int);--> statement-breakpoint
DROP FUNCTION IF EXISTS kh_tmp_holiday(date);--> statement-breakpoint
DROP FUNCTION IF EXISTS kh_tmp_easter(int);
