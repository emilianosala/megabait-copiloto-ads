'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './dashboard.module.css';
import MegabaitLogo from '@/components/MegabaitLogo';

interface Client {
  id: string;
  name: string;
  industry: string;
}

interface Notification {
  id: string;
  message: string;
  metric_value: number | null;
  read: boolean;
  created_at: string;
  client_id: string;
  alerts: { name: string } | null;
  clients: { name: string } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function DashboardContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  function loadNotifications() {
    fetch('/api/notifications')
      .then((res) => res.json())
      .then((data) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  async function handleMarkAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function handleNotifClick(notif: Notification) {
    if (!notif.read) {
      await fetch(`/api/notifications/${notif.id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n));
    }
    setBellOpen(false);
    router.push(`/chat/${notif.client_id}`);
  }

  // Cerrar dropdown al clickear fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        setClients(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    loadNotifications();
  }, []);

  if (loading) return <div className={styles.loading}>Cargando...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <MegabaitLogo height={30} />
        <div className={styles.headerActions}>
          <button className={styles.logoutButton} onClick={() => router.push('/help')}>
            ¿Qué puede hacer Jair?
          </button>

          {/* Bell icon */}
          <div className={styles.bellWrapper} ref={bellRef}>
            <button
              className={styles.bellButton}
              onClick={() => setBellOpen((o) => !o)}
              aria-label="Notificaciones"
            >
              🔔
            </button>
            {unreadCount > 0 && (
              <span className={styles.bellBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}

            {bellOpen && (
              <div className={styles.notifDropdown}>
                <div className={styles.notifHeader}>
                  <span className={styles.notifTitle}>Alertas</span>
                  {unreadCount > 0 && (
                    <button className={styles.notifMarkAll} onClick={handleMarkAllRead}>
                      Marcar todo como leído
                    </button>
                  )}
                </div>
                <div className={styles.notifList}>
                  {notifications.length === 0 ? (
                    <div className={styles.notifEmpty}>Sin notificaciones</div>
                  ) : (
                    notifications.slice(0, 10).map((notif) => (
                      <div
                        key={notif.id}
                        className={`${styles.notifItem} ${!notif.read ? styles.notifItemUnread : ''}`}
                        onClick={() => handleNotifClick(notif)}
                      >
                        <div className={styles.notifAlertName}>
                          {notif.alerts?.name ?? 'Alerta'}
                        </div>
                        <div className={styles.notifMessage}>{notif.message}</div>
                        <div className={styles.notifMeta}>
                          {notif.clients?.name} · {timeAgo(notif.created_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

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
