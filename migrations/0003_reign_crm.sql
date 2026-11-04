CREATE TABLE reign_crm_profiles (
 lead_id integer PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
 contact_type text NOT NULL DEFAULT 'lead' CHECK (contact_type IN ('lead','client')),
 company text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
 assigned_to integer REFERENCES users(id) ON DELETE SET NULL,
 next_follow_up_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reign_contact_activity (
 id bigserial PRIMARY KEY, lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('note','call','email','meeting','site_visit')),
 subject text NOT NULL, body text NOT NULL DEFAULT '', outcome text NOT NULL DEFAULT '',
 created_by integer REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX reign_contact_activity_lead ON reign_contact_activity(lead_id,created_at);
--> statement-breakpoint
CREATE TABLE reign_deals (
 id bigserial PRIMARY KEY, lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 title text NOT NULL, stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','qualified','assessment','proposal','negotiation','won','lost')),
 value_cents bigint NOT NULL DEFAULT 0 CHECK (value_cents BETWEEN 0 AND 1000000000000),
 assigned_to integer REFERENCES users(id) ON DELETE SET NULL, expected_close date, notes text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reign_projects (
 id bigserial PRIMARY KEY, lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 title text NOT NULL, stage text NOT NULL DEFAULT 'planning' CHECK (stage IN ('planning','in_progress','on_hold','complete')),
 budget_cents bigint CHECK (budget_cents BETWEEN 0 AND 1000000000000),
 spent_cents bigint CHECK (spent_cents BETWEEN 0 AND 1000000000000),
 start_date date, due_date date, assigned_to integer REFERENCES users(id) ON DELETE SET NULL,
 notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
);
--> statement-breakpoint
CREATE TABLE reign_project_tasks (
 id bigserial PRIMARY KEY, project_id bigint NOT NULL REFERENCES reign_projects(id) ON DELETE CASCADE,
 title text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','complete')),
 priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
 assigned_to integer REFERENCES users(id) ON DELETE SET NULL, due_date date,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reign_crm_keys (
 id uuid PRIMARY KEY, name text NOT NULL, token_hash text NOT NULL UNIQUE,
 token_prefix text NOT NULL, created_by integer REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz
);
--> statement-breakpoint
CREATE TABLE reign_crm_ingestion (
 key_id uuid NOT NULL REFERENCES reign_crm_keys(id), event_id text NOT NULL,
 payload_hash text NOT NULL, lead_id integer NOT NULL REFERENCES leads(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(key_id,event_id)
);
