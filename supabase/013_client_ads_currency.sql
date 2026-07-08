-- Moneda de las cuentas de ads del cliente.
-- Se captura automáticamente de la cuenta que el analista selecciona en el
-- formulario de edición (Google y Meta ya devuelven currency_code/currency).
-- Jair la usa en el system prompt para no interpretar los importes como USD.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. El PATCH /api/clients/[clientId]
-- nombra estas columnas explícitamente, así que TIENEN que existir en prod
-- antes de desplegar el código que las escribe (si no, PostgREST devuelve 500).
-- Correr en Supabase Dashboard -> SQL Editor.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS google_ads_currency TEXT;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS meta_ads_currency TEXT;

-- Forzar a PostgREST a recargar el cache de esquema.
NOTIFY pgrst, 'reload schema';
