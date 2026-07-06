-- Fix: restaurar la constraint UNIQUE en client_id de las tablas de conexiones.
--
-- El callback de OAuth (app/api/google/callback y app/api/meta/callback) hace un
-- upsert con onConflict: 'client_id', que requiere una constraint UNIQUE (o índice
-- único) sobre client_id. La migración 002_multi_tenant.sql la define, pero en la
-- base de producción no quedó aplicada (se corrió parcialmente, o antes de que ese
-- bloque existiera). Sin la constraint, el callback falla con:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- Nunca se había disparado porque es la primera conexión real de una cuenta.
--
-- Idempotente: solo agrega la constraint si falta. Semánticamente cada cliente tiene
-- a lo sumo UNA conexión por plataforma, así que client_id UNIQUE es lo correcto.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'google_connections_client_id_key'
  ) THEN
    ALTER TABLE public.google_connections
      ADD CONSTRAINT google_connections_client_id_key UNIQUE (client_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meta_connections_client_id_key'
  ) THEN
    ALTER TABLE public.meta_connections
      ADD CONSTRAINT meta_connections_client_id_key UNIQUE (client_id);
  END IF;
END $$;
