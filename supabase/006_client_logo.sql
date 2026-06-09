-- Logo del cliente para reportes
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url TEXT;
