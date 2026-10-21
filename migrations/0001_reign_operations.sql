CREATE TABLE reign_measurements (
 id serial PRIMARY KEY, lead_id integer NOT NULL REFERENCES leads(id),
 label text NOT NULL, points jsonb NOT NULL, source text NOT NULL,
 area_sq_ft numeric NOT NULL CHECK(area_sq_ft>0), perimeter_ft numeric NOT NULL,
 verified boolean NOT NULL DEFAULT false, created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reign_proposals (
 id serial PRIMARY KEY, lead_id integer NOT NULL REFERENCES leads(id),
 document jsonb NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted','declined','withdrawn')),
 version integer NOT NULL DEFAULT 1, created_by integer NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz, decided_by text
);
CREATE INDEX reign_proposals_lead_idx ON reign_proposals(lead_id);
--> statement-breakpoint
CREATE TABLE reign_portal_access (
 id serial PRIMARY KEY, lead_id integer NOT NULL UNIQUE REFERENCES leads(id),
 token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL,
 created_by integer NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reign_audit (
 id bigserial PRIMARY KEY, actor_id integer REFERENCES users(id),
 action text NOT NULL, resource text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reign_agent_actions (
 id text PRIMARY KEY, actor_id integer NOT NULL REFERENCES users(id),
 action jsonb NOT NULL, context_version text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reign_ai_budget (
 day date PRIMARY KEY, requests integer NOT NULL DEFAULT 0
);
