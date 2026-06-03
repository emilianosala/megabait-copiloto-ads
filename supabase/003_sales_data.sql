-- P2: Datos de ventas reales por cliente
-- Correr en Supabase Dashboard → SQL Editor

CREATE TABLE public.sales_data (
  id              UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ    DEFAULT NOW(),
  client_id       UUID           REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID           REFERENCES public.organizations(id) NOT NULL,
  date            DATE           NOT NULL,
  amount          NUMERIC(14, 2) NOT NULL,
  currency        TEXT           NOT NULL DEFAULT 'USD',
  source          TEXT           NOT NULL DEFAULT 'csv',
  product         TEXT
);

CREATE INDEX ON public.sales_data (client_id, date);
CREATE INDEX ON public.sales_data (organization_id);

ALTER TABLE public.sales_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_all" ON public.sales_data FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = sales_data.client_id AND om.user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_data TO authenticated;
