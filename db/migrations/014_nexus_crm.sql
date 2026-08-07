CREATE TABLE IF NOT EXISTS crm_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_key text NOT NULL UNIQUE,
  name text NOT NULL,
  organization_type text NOT NULL CHECK (organization_type IN (
    'client','prospect','supplier','manufacturer','distributor','partner',
    'bank','investor','administration','international-organization'
  )),
  country text,
  city text,
  address text,
  website text,
  phone text,
  whatsapp text,
  email text,
  linkedin text,
  sector text,
  products text[] NOT NULL DEFAULT '{}',
  projects text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  value_score integer NOT NULL DEFAULT 0 CHECK (value_score BETWEEN 0 AND 100),
  potential_score integer NOT NULL DEFAULT 0 CHECK (potential_score BETWEEN 0 AND 100),
  probability_score integer NOT NULL DEFAULT 0 CHECK (probability_score BETWEEN 0 AND 100),
  history_score integer NOT NULL DEFAULT 0 CHECK (history_score BETWEEN 0 AND 100),
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  priority_score integer NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  source_module text NOT NULL DEFAULT 'crm',
  source_reference text,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_organizations_type_idx ON crm_organizations(organization_type, status);
CREATE INDEX IF NOT EXISTS crm_organizations_country_idx ON crm_organizations(country);
CREATE INDEX IF NOT EXISTS crm_organizations_priority_idx ON crm_organizations(priority_score DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_organizations_tags_idx ON crm_organizations USING gin(tags);
CREATE INDEX IF NOT EXISTS crm_organizations_products_idx ON crm_organizations USING gin(products);

CREATE TABLE IF NOT EXISTS crm_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  job_title text,
  email text,
  phone text,
  whatsapp text,
  linkedin text,
  is_decision_maker boolean NOT NULL DEFAULT false,
  influence integer NOT NULL DEFAULT 0 CHECK (influence BETWEEN 0 AND 100),
  comments text NOT NULL DEFAULT '',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS crm_people_organization_idx ON crm_people(organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE CASCADE,
  person_id uuid REFERENCES crm_people(id) ON DELETE SET NULL,
  interaction_type text NOT NULL CHECK (interaction_type IN (
    'email','call','whatsapp','meeting','tender','contract','quote',
    'invoice','purchase-order','payment','document','note'
  )),
  direction text CHECK (direction IN ('inbound','outbound','internal')),
  subject text,
  summary text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_module text NOT NULL DEFAULT 'crm',
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_module, source_reference, interaction_type)
);

CREATE INDEX IF NOT EXISTS crm_interactions_org_idx ON crm_interactions(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_interactions_type_idx ON crm_interactions(interaction_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS crm_document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE CASCADE,
  vault_document_id uuid REFERENCES document_vault_documents(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','expired','missing','archived')),
  expires_on date,
  source_module text NOT NULL DEFAULT 'crm',
  source_reference text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, document_type, source_reference)
);

CREATE INDEX IF NOT EXISTS crm_document_links_org_idx ON crm_document_links(organization_id, status);

CREATE TABLE IF NOT EXISTS crm_role_assignments (
  email text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('administrator','executive','commercial','purchasing','read-only')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('create','update','archive','view','import','export','merge','sync')),
  entity_type text NOT NULL,
  entity_id uuid,
  actor_email text NOT NULL,
  source_module text NOT NULL DEFAULT 'crm',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_activity_created_idx ON crm_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS crm_activity_entity_idx ON crm_activity_log(entity_type, entity_id, created_at DESC);
