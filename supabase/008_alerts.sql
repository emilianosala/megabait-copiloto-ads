-- P8: Sistema de alertas personalizadas
-- Correr en Supabase Dashboard → SQL Editor

CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value NUMERIC NOT NULL,
  date_preset TEXT NOT NULL DEFAULT 'last_7d',
  notify_email BOOLEAN NOT NULL DEFAULT true,
  notify_inapp BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ
);

CREATE TABLE public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  message TEXT NOT NULL,
  metric_value NUMERIC,
  read BOOLEAN NOT NULL DEFAULT false,
  email_sent BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_alerts_client ON public.alerts(client_id);
CREATE INDEX idx_alerts_org ON public.alerts(organization_id);
CREATE INDEX idx_alert_notifications_org ON public.alert_notifications(organization_id);
CREATE INDEX idx_alert_notifications_unread ON public.alert_notifications(organization_id, read) WHERE read = false;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read alerts"
  ON public.alerts FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org members can read notifications"
  ON public.alert_notifications FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_notifications TO authenticated;
