-- P7: Reportes interactivos generados por Jair
CREATE TABLE public.reports (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  client_id       UUID        REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID        REFERENCES public.organizations(id) NOT NULL,
  created_by      UUID        REFERENCES auth.users(id) NOT NULL,
  title           TEXT        NOT NULL,
  is_public       BOOLEAN     DEFAULT true,
  initial_since   DATE        NOT NULL,
  initial_until   DATE        NOT NULL,
  sources         TEXT[]      NOT NULL,
  sections        JSONB       NOT NULL
);

CREATE INDEX ON public.reports (client_id);
CREATE INDEX ON public.reports (organization_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Autenticados pueden ver/crear reportes de su org
CREATE POLICY "org_members_all" ON public.reports FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = reports.client_id AND om.user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
-- Los reportes públicos se leen vía admin client en la API, sin RLS
