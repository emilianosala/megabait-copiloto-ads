-- Índice para la query de rate limiting:
-- SELECT COUNT(*) FROM api_audit_log WHERE organization_id = $1 AND platform = $2 AND created_at > $3
CREATE INDEX IF NOT EXISTS api_audit_log_rate_limit_idx
  ON api_audit_log (organization_id, platform, created_at DESC);
