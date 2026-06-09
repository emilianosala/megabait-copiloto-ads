-- P2: Nota opcional por upload de ventas
ALTER TABLE public.sales_data ADD COLUMN IF NOT EXISTS upload_note TEXT;
