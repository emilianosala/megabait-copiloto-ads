-- Destinatarios de email configurables por alerta
-- Correr en Supabase Dashboard → SQL Editor

ALTER TABLE public.alerts
  ADD COLUMN notify_emails text[] NOT NULL DEFAULT '{}';
