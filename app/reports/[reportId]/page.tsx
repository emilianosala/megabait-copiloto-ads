'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import styles from './report.module.css';
import MegabaitLogo from '@/components/MegabaitLogo';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportSection {
  type: 'kpi_row' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'table';
  title?: string;
  source: 'meta' | 'sales';
  metric?: string;
  dimension?: 'campaign' | 'day' | 'week';
  color?: string;
}

interface ReportConfig {
  id: string;
  title: string;
  initial_since: string;
  initial_until: string;
  sources: string[];
  sections: ReportSection[];
  client: { name: string; industry: string; logo_url?: string };
  created_at: string;
}

interface MetaData {
  account: { spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; conversions: number } | null;
  campaigns: { name: string; status: string; objective: string; spend: number; impressions: number; clicks: number; ctr: number; cpc: number }[];
}

interface SalesData {
  total: number; count: number; currency: string; avg_ticket: number;
  by_day: { date: string; amount: number }[];
  by_week: { week: string; amount: number }[];
}

interface ReportData { meta?: MetaData | null; sales?: SalesData | null; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = ['#39ff14', '#FFD700', '#00bfff', '#ff6b6b', '#b39ddb', '#80deea', '#ffcc80', '#a5d6a7'];

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatDateEs(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${day} de ${MONTHS_ES[month - 1]} de ${year}`;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Section renderers ─────────────────────────────────────────────────────────

function MetaKpiRow({ data }: { data: MetaData }) {
  if (!data.account) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin datos de Meta para este período.</p>;
  const { spend, impressions, clicks, ctr, cpc, reach, conversions } = data.account;
  const kpis = [
    { label: 'Gasto', value: `$${fmt(spend)}` },
    { label: 'Alcance', value: fmt(reach, 0) },
    { label: 'Impresiones', value: fmt(impressions, 0) },
    { label: 'Clics', value: fmt(clicks, 0) },
    { label: 'CTR', value: `${fmt(ctr)}%` },
    { label: 'CPC', value: `$${fmt(cpc)}` },
    { label: 'Conversiones', value: fmt(conversions, 0) },
  ];
  return (
    <div className={styles.kpiRow}>
      {kpis.map(k => (
        <div key={k.label} className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{k.label}</span>
          <span className={styles.kpiValue}>{k.value}</span>
        </div>
      ))}
    </div>
  );
}

function SalesKpiRow({ data }: { data: SalesData }) {
  const kpis = [
    { label: 'Ventas totales', value: `${data.currency} ${fmt(data.total)}` },
    { label: 'Transacciones', value: fmt(data.count, 0) },
    { label: 'Ticket promedio', value: `${data.currency} ${fmt(data.avg_ticket)}` },
  ];
  return (
    <div className={styles.kpiRow}>
      {kpis.map(k => (
        <div key={k.label} className={styles.kpiCard}>
          <span className={styles.kpiLabel}>{k.label}</span>
          <span className={styles.kpiValue}>{k.value}</span>
        </div>
      ))}
    </div>
  );
}

function MetaBarChart({ data, metric = 'spend', title, color = '#39ff14' }: { data: MetaData; metric: string; title: string; color?: string }) {
  if (!data.campaigns.length) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin campañas para este período.</p>;
  const chartData = data.campaigns.map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    value: (c as any)[metric] ?? 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <Bar dataKey="value" name={metric} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MetaPieChart({ data, metric = 'spend' }: { data: MetaData; metric: string }) {
  if (!data.campaigns.length) return null;
  const chartData = data.campaigns.map(c => ({ name: c.name, value: (c as any)[metric] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${(name ?? '').slice(0, 12)} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function SalesLineChart({ data, dimension = 'week', color = '#FFD700' }: { data: SalesData; dimension: string; color?: string }) {
  const chartData = dimension === 'day' ? data.by_day.map(d => ({ label: d.date, amount: d.amount }))
    : data.by_week.map(d => ({ label: d.week, amount: d.amount }));
  if (!chartData.length) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin datos de ventas para este período.</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} angle={-20} textAnchor="end" interval={Math.floor(chartData.length / 8)} />
        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <Line type="monotone" dataKey="amount" name={`Ventas (${data.currency})`} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SalesBarChart({ data, dimension = 'week', color = '#FFD700' }: { data: SalesData; dimension: string; color?: string }) {
  const chartData = dimension === 'day' ? data.by_day.map(d => ({ label: d.date, amount: d.amount }))
    : data.by_week.map(d => ({ label: d.week, amount: d.amount }));
  if (!chartData.length) return null;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} angle={-20} textAnchor="end" interval={Math.floor(chartData.length / 8)} />
        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <Bar dataKey="amount" name={`Ventas (${data.currency})`} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CampaignTable({ data }: { data: MetaData }) {
  if (!data.campaigns.length) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin campañas para este período.</p>;
  const handleCSV = () => downloadCSV('campañas.csv', [
    ['Campaña', 'Estado', 'Objetivo', 'Gasto', 'Impresiones', 'Clics', 'CTR', 'CPC'],
    ...data.campaigns.map(c => [c.name, c.status, c.objective ?? '-', String(c.spend), String(c.impressions), String(c.clicks), String(c.ctr), String(c.cpc)]),
  ]);
  return (
    <>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Campaña</th><th>Estado</th><th>Gasto</th><th>Impresiones</th><th>Clics</th><th>CTR</th><th>CPC</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c, i) => (
              <tr key={i}>
                <td>{c.name}</td>
                <td>
                  <span className={`${styles.statusBadge} ${c.status === 'ACTIVE' ? styles.statusActive : styles.statusPaused}`}>
                    {c.status === 'ACTIVE' ? 'Activa' : 'Pausada'}
                  </span>
                </td>
                <td>${fmt(c.spend)}</td>
                <td>{fmt(c.impressions, 0)}</td>
                <td>{fmt(c.clicks, 0)}</td>
                <td>{fmt(c.ctr)}%</td>
                <td>${fmt(c.cpc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className={styles.exportButton} onClick={handleCSV} style={{ alignSelf: 'flex-start' }}>
        Descargar CSV
      </button>
    </>
  );
}

function SalesTable({ data }: { data: SalesData }) {
  const handleCSV = () => downloadCSV('ventas.csv', [
    ['Semana', `Ventas (${data.currency})`],
    ...data.by_week.map(d => [d.week, String(d.amount)]),
  ]);
  return (
    <>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr><th>Semana</th><th>Ventas ({data.currency})</th></tr>
          </thead>
          <tbody>
            {data.by_week.map((d, i) => (
              <tr key={i}><td>{d.week}</td><td>{fmt(d.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className={styles.exportButton} onClick={handleCSV} style={{ alignSelf: 'flex-start' }}>
        Descargar CSV
      </button>
    </>
  );
}

function Section({ section, data }: { section: ReportSection; data: ReportData }) {
  const meta = data.meta ?? null;
  const sales = data.sales ?? null;

  const content = (() => {
    if (section.source === 'meta' && !meta) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Meta Ads no conectado o sin datos para este período.</p>;
    if (section.source === 'sales' && !sales) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin datos de ventas para este período.</p>;

    switch (section.type) {
      case 'kpi_row':
        return section.source === 'meta' ? <MetaKpiRow data={meta!} /> : <SalesKpiRow data={sales!} />;
      case 'bar_chart':
        return section.source === 'meta'
          ? <MetaBarChart data={meta!} metric={section.metric ?? 'spend'} title={section.title ?? ''} color={section.color} />
          : <SalesBarChart data={sales!} dimension={section.dimension ?? 'week'} color={section.color} />;
      case 'line_chart':
        return section.source === 'sales'
          ? <SalesLineChart data={sales!} dimension={section.dimension ?? 'week'} color={section.color} />
          : <MetaBarChart data={meta!} metric={section.metric ?? 'spend'} title={section.title ?? ''} color={section.color} />;
      case 'pie_chart':
        return section.source === 'meta' ? <MetaPieChart data={meta!} metric={section.metric ?? 'spend'} /> : null;
      case 'table':
        return section.source === 'meta' ? <CampaignTable data={meta!} /> : <SalesTable data={sales!} />;
      default:
        return null;
    }
  })();

  return (
    <div className={styles.section}>
      {section.title && <p className={styles.sectionTitle}>{section.title}</p>}
      {content}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ReportContent() {
  const { reportId } = useParams<{ reportId: string }>();
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/reports/${reportId}`)
      .then(r => r.json())
      .then(cfg => {
        if (cfg.error) { setError(cfg.error); return; }
        setConfig(cfg);
        setSince(cfg.initial_since);
        setUntil(cfg.initial_until);
      })
      .catch(() => setError('No se pudo cargar el reporte'));
  }, [reportId]);

  const fetchData = useCallback((s: string, u: string) => {
    if (!s || !u) return;
    setLoadingData(true);
    fetch(`/api/reports/${reportId}/data?since=${s}&until=${u}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoadingData(false); })
      .catch(() => setLoadingData(false));
  }, [reportId]);

  useEffect(() => {
    if (since && until) fetchData(since, until);
  }, [since, until, fetchData]);

  if (error) return (
    <div className={styles.page}>
      <div className={styles.loading}>{error}</div>
    </div>
  );

  if (!config) return <div className={styles.page}><div className={styles.loading}>Cargando reporte...</div></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.clientName}>{config.client?.name}</span>
          <h1 className={styles.reportTitle}>{config.title}</h1>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.dateRange}>
            <span className={styles.dateLabel}>Período</span>
            <input
              type="date"
              className={styles.dateInput}
              value={since}
              onChange={e => setSince(e.target.value)}
            />
            <span className={styles.dateSep}>→</span>
            <input
              type="date"
              className={styles.dateInput}
              value={until}
              onChange={e => setUntil(e.target.value)}
            />
          </div>
          <button
            className={styles.exportButton}
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
            }}
          >
            Copiar link
          </button>
          <button className={styles.exportButton} onClick={() => window.print()}>
            Exportar PDF
          </button>
          <MegabaitLogo height={22} />
        </div>
      </header>

      <div className={styles.body}>
        {/* Carátula */}
        <div className={styles.cover}>
          <div className={styles.coverLogos}>
            {config.client?.logo_url && (
              <img
                src={config.client.logo_url}
                alt={config.client.name}
                className={styles.clientLogo}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>
          <h2 className={styles.coverTitle}>{config.title}</h2>
          <p className={styles.coverClient}>{config.client?.name}</p>
          <p className={styles.coverPeriod}>
            {formatDateEs(since)} — {formatDateEs(until)}
          </p>
        </div>

        {loadingData && <div className={styles.loading}>Actualizando datos...</div>}

        {!loadingData && data && config.sections.map((section, i) => (
          <Section key={i} section={section} data={data} />
        ))}

        {!loadingData && !data && (
          <div className={styles.loading}>Cargando datos...</div>
        )}
      </div>

      <div className={styles.footer}>
        Generado por Jair · Megabait · {new Date(config.created_at).toLocaleDateString('es-AR')}
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-secondary)' }}>Cargando...</div>}>
      <ReportContent />
    </Suspense>
  );
}
