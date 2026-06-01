-- P12 (adelantado): Arquitectura multi-tenant con propiedad explícita de datos
-- Correr en Supabase Dashboard → SQL Editor
-- ATENCIÓN: hace cambios destructivos en el schema. Leerlo completo antes de correr.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NUEVAS TABLAS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.organizations (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name       TEXT        NOT NULL,
  plan       TEXT        NOT NULL DEFAULT 'free'
                         CHECK (plan IN ('free', 'pro', 'agency'))
);

CREATE TABLE public.organization_members (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'member'
                              CHECK (role IN ('owner', 'member')),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX ON public.organization_members (user_id);
CREATE INDEX ON public.organization_members (organization_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. AGREGAR COLUMNAS NUEVAS (nullable por ahora, se hardean abajo)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clients
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- Hacer user_id nullable en connections para poder insertar filas nuevas (per-client)
-- antes de eliminar las filas viejas (per-user)
ALTER TABLE public.meta_connections   ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.google_connections ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.meta_connections   DROP CONSTRAINT IF EXISTS meta_connections_user_id_key;
ALTER TABLE public.google_connections DROP CONSTRAINT IF EXISTS google_connections_user_id_key;

ALTER TABLE public.meta_connections
  ADD COLUMN client_id    UUID REFERENCES public.clients(id),
  ADD COLUMN connected_by UUID REFERENCES auth.users(id);

ALTER TABLE public.google_connections
  ADD COLUMN client_id    UUID REFERENCES public.clients(id),
  ADD COLUMN connected_by UUID REFERENCES auth.users(id);

ALTER TABLE public.api_audit_log
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. MIGRAR DATOS EXISTENTES
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_id      UUID;
  v_org_id       UUID;
  v_meta_token   TEXT;
  v_google_token TEXT;
BEGIN
  FOR v_user_id IN SELECT id FROM auth.users LOOP
    INSERT INTO public.organizations (name) VALUES ('Mi organización')
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');

    -- Mover clients a la org
    UPDATE public.clients SET organization_id = v_org_id WHERE user_id = v_user_id;

    -- Obtener tokens viejos (per-user)
    SELECT access_token  INTO v_meta_token   FROM public.meta_connections   WHERE user_id = v_user_id LIMIT 1;
    SELECT refresh_token INTO v_google_token FROM public.google_connections  WHERE user_id = v_user_id LIMIT 1;

    -- Crear una meta_connection por cada cliente que tenga meta_ads_account_id
    IF v_meta_token IS NOT NULL THEN
      INSERT INTO public.meta_connections (client_id, connected_by, access_token)
      SELECT c.id, v_user_id, v_meta_token
      FROM public.clients c
      WHERE c.organization_id = v_org_id
        AND c.meta_ads_account_id IS NOT NULL;
    END IF;

    -- Crear una google_connection por cada cliente que tenga google_ads_account_id
    IF v_google_token IS NOT NULL THEN
      INSERT INTO public.google_connections (client_id, connected_by, refresh_token)
      SELECT c.id, v_user_id, v_google_token
      FROM public.clients c
      WHERE c.organization_id = v_org_id
        AND c.google_ads_account_id IS NOT NULL;
    END IF;

    -- Actualizar audit log
    UPDATE public.api_audit_log SET organization_id = v_org_id WHERE user_id = v_user_id;

  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. LIMPIAR FILAS VIEJAS Y FINALIZAR CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════════════

-- Eliminar filas per-user de connections (las que no tienen client_id)
DELETE FROM public.meta_connections   WHERE client_id IS NULL;
DELETE FROM public.google_connections WHERE client_id IS NULL;

-- Hacer NOT NULL las nuevas columnas
ALTER TABLE public.clients
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.meta_connections
  ALTER COLUMN client_id    SET NOT NULL,
  ALTER COLUMN connected_by SET NOT NULL;
ALTER TABLE public.meta_connections
  ADD CONSTRAINT meta_connections_client_id_key UNIQUE (client_id);

ALTER TABLE public.google_connections
  ALTER COLUMN client_id    SET NOT NULL,
  ALTER COLUMN connected_by SET NOT NULL;
ALTER TABLE public.google_connections
  ADD CONSTRAINT google_connections_client_id_key UNIQUE (client_id);

-- Eliminar columnas viejas
ALTER TABLE public.meta_connections   DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.meta_connections   DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.google_connections DROP COLUMN IF EXISTS user_id;
ALTER TABLE public.google_connections DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.clients            DROP COLUMN IF EXISTS user_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS — BORRAR POLÍTICAS VIEJAS Y CREAR NUEVAS
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('clients', 'conversations', 'meta_connections',
                        'google_connections', 'organizations', 'organization_members')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select" ON public.organizations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id AND om.user_id = auth.uid()
  ));

-- organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select" ON public.organization_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members om2
      WHERE om2.organization_id = organization_members.organization_id
        AND om2.user_id = auth.uid()
    )
  );

-- clients: miembros de la org pueden leer/escribir/borrar
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_all" ON public.clients FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = clients.organization_id AND om.user_id = auth.uid()
  ));

-- conversations: acceso via client → org
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_all" ON public.conversations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = conversations.client_id AND om.user_id = auth.uid()
  ));

-- meta_connections: acceso via client → org
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_all" ON public.meta_connections FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = meta_connections.client_id AND om.user_id = auth.uid()
  ));

-- google_connections: acceso via client → org
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_all" ON public.google_connections FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = google_connections.client_id AND om.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. TRIGGER: auto-crear org para nuevos usuarios en signup
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Mi organización'))
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_organization();
