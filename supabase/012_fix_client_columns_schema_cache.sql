-- Fix drift de esquema en prod: las migraciones 006 y 007 nunca se aplicaron a
-- la base de producción, así que las columnas logo_url y google_analytics_property_id
-- no existían en public.clients. El PATCH /api/clients/[clientId] manda un UPDATE
-- que nombra logo_url explícitamente -> PostgREST lo rechaza con 500:
--   "Could not find the 'logo_url' column of 'clients' in the schema cache".
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Si las columnas ya existieran pero el
-- cache de PostgREST estuviera viejo, el NOTIFY final lo recarga.
-- Correr en Supabase Dashboard -> SQL Editor.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS google_analytics_property_id TEXT;

-- Forzar a PostgREST a recargar el cache de esquema (por si las columnas ya
-- existían y el problema era solo el cache desactualizado).
NOTIFY pgrst, 'reload schema';
