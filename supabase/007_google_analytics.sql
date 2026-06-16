-- P: Google Analytics integration
-- Agrega el campo google_analytics_property_id a la tabla clients
-- Correr en Supabase Dashboard → SQL Editor

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS google_analytics_property_id TEXT;
