-- P3: Audit log de todas las llamadas a Meta y Google APIs
-- Correr en Supabase Dashboard → SQL Editor

CREATE TABLE api_audit_log (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  user_id        UUID        REFERENCES auth.users(id) NOT NULL,
  client_id      UUID        REFERENCES clients(id),
  platform       TEXT        NOT NULL CHECK (platform IN ('meta', 'google')),
  tool_name      TEXT,
  endpoint       TEXT        NOT NULL,
  request_params JSONB,
  response_ok    BOOLEAN     NOT NULL,
  response_status INTEGER,
  error_message  TEXT,
  triggered_by   TEXT        NOT NULL DEFAULT 'tool_use'
                             CHECK (triggered_by IN ('tool_use', 'system_prompt', 'manual'))
);

ALTER TABLE api_audit_log ENABLE ROW LEVEL SECURITY;

-- Los analistas solo ven sus propios logs
CREATE POLICY "users_select_own_logs" ON api_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Los inserts vienen del servidor via service role key (no necesitan policy de INSERT)
