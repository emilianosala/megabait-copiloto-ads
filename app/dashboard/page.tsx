'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './dashboard.module.css';

interface Client {
  id: string;
  name: string;
  industry: string;
}

function DashboardContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        setClients(data);
        setLoading(false);
      });

    fetch('/api/google/status')
      .then((res) => res.json())
      .then((data) => setGoogleConnected(data.connected));

    fetch('/api/meta/status')
      .then((res) => res.json())
      .then((data) => setMetaConnected(data.connected));
  }, []);

  // Leer el query param ?google= que deja el callback de OAuth
  useEffect(() => {
    const googleParam = searchParams.get('google');
    if (googleParam === 'connected') {
      setGoogleConnected(true);
      // Limpiar el query param de la URL sin recargar
      router.replace('/dashboard');
    } else if (googleParam === 'error') {
      alert('Error al conectar Google Ads. Intentá de nuevo.');
      router.replace('/dashboard');
    } else if (googleParam === 'no_refresh_token') {
      alert('Google no emitió un refresh token. Intentá desconectar la app desde tu cuenta de Google y volvé a conectar.');
      router.replace('/dashboard');
    }

    const metaParam = searchParams.get('meta');
    if (metaParam === 'connected') {
      setMetaConnected(true);
      router.replace('/dashboard');
    } else if (metaParam === 'error') {
      alert('Error al conectar Meta Ads. Intentá de nuevo.');
      router.replace('/dashboard');
    }
  }, [searchParams, router]);

  if (loading) return <div className={styles.loading}>Cargando...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          MEGA<span>BAIT</span>
        </div>
        <div className={styles.headerActions}>
          {googleConnected === false && (
            <a href="/api/google/auth" className={styles.googleButton}>
              Conectar Google Ads
            </a>
          )}
          {googleConnected === true && (
            <div className={styles.googleConnected}>
              <span className={styles.googleDot} />
              Google Ads conectado
            </div>
          )}
          {metaConnected === false && (
            <a href="/api/meta/auth" className={styles.metaButton}>
              Conectar Meta Ads
            </a>
          )}
          {metaConnected === true && (
            <div className={styles.metaConnected}>
              <span className={styles.metaDot} />
              Meta Ads conectado
            </div>
          )}
          <button className={styles.logoutButton} onClick={handleLogout}>
            Salir
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.sectionHeader}>
          <p className={styles.title}>Mis Clientes</p>
          <button
            className={styles.newButton}
            onClick={() => router.push('/clients/new')}
          >
            + Nuevo Cliente
          </button>
        </div>
        {clients.length === 0 ? (
          <div className={styles.empty}>
            <p>No tenés clientes todavía.</p>
            <button
              className={styles.newButton}
              onClick={() => router.push('/clients/new')}
            >
              + Agregar primer cliente
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {clients.map((client) => (
              <div key={client.id} className={styles.card}>
                <div
                  className={styles.cardBody}
                  onClick={() => router.push(`/chat/${client.id}`)}
                >
                  <p className={styles.clientName}>{client.name}</p>
                  <p className={styles.clientIndustry}>{client.industry}</p>
                </div>
                <div className={styles.cardActions}>
                  <button
                    className={styles.editButton}
                    onClick={() => router.push(`/clients/${client.id}/edit`)}
                  >
                    Editar
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={async () => {
                      if (
                        !confirm(
                          `¿Seguro que querés eliminar a ${client.name}?`,
                        )
                      )
                        return;
                      await fetch(`/api/clients/${client.id}`, {
                        method: 'DELETE',
                      });
                      setClients((prev) =>
                        prev.filter((c) => c.id !== client.id),
                      );
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className={styles.loading}>Cargando...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
