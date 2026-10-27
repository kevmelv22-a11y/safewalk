import { useState } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('nl-NL') : '—');
type Tab = 'stats' | 'users' | 'reports' | 'subs' | 'errors' | 'audit';

function Login() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null);
  return (
    <form className="login" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await signIn('password', { flow: 'signIn', email, password: pw }); } catch { setErr('Inloggen mislukt'); } }}>
      <h2>SafeWalk Beheer</h2>
      <input placeholder="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      <input placeholder="Wachtwoord" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
      <button className="primary" type="submit">Inloggen</button>
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      <p className="muted">Alleen voor beheerders. Toegang wordt op de server gecontroleerd.</p>
    </form>
  );
}

function Stats() {
  const s = useQuery(api.admin.stats);
  if (!s) return <p className="muted">Laden…</p>;
  const items: [string, string | number][] = [['Gebruikers', s.users], ['Premium', s.premium], ['Beperkt', s.restricted], ['Actieve reizen', s.activeSessions],
    ['Reizen 24u', s.sessions24h], ['SOS 24u', s.sos24h], ['Gemiste check-ins 24u', s.missedCheckIns24h], ['Open meldingen', s.openReports]];
  return (<>
    <div className="grid">{items.map(([k, v]) => <div className="card" key={k}><span className="muted">{k}</span><b>{v}</b></div>)}</div>
    <h3>Pushstatus (24u)</h3>
    <div className="grid">{Object.entries(s.push24h).map(([k, v]) => <div className="card" key={k}><span className="muted">{k}</span><b>{v}</b></div>)}</div>
    <p className="muted">Geanonimiseerd: alleen tellingen; aantallen 1–4 worden getoond als “&lt;5”.</p>
  </>);
}

function Users() {
  const [q, setQ] = useState('');
  const users = useQuery(api.admin.users, { search: q || undefined });
  const setRestricted = useMutation(api.admin.setRestricted);
  return (<>
    <input placeholder="Zoek op naam of e-mail" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, width: 320 }} />
    <table><thead><tr><th>Naam</th><th>E-mail</th><th>Abonnement</th><th>Aangemaakt</th><th>Status</th><th /></tr></thead><tbody>
      {users?.map((u) => (
        <tr key={u.userId}><td>{u.displayName || '—'}</td><td>{u.email}</td><td>{u.premium ? 'Premium' : 'Gratis'}</td><td>{fmt(u.createdAt)}</td>
          <td>{u.restricted ? '⛔ Beperkt' : 'Actief'}</td>
          <td><button className={u.restricted ? '' : 'danger'} onClick={() => {
            const reason = u.restricted ? undefined : prompt('Reden van beperking?') ?? undefined;
            if (!u.restricted && reason === undefined) return;
            setRestricted({ userId: u.userId as Id<'users'>, restricted: !u.restricted, reason });
          }}>{u.restricted ? 'Beperking opheffen' : 'Beperken'}</button></td></tr>
      ))}
    </tbody></table>
  </>);
}

function Reports() {
  const reports = useQuery(api.admin.reports); const setStatus = useMutation(api.admin.setReportStatus);
  const reason: Record<string, string> = { stalking: 'Stalking / volgen', harassment: 'Intimidatie', spam: 'Spam', other: 'Overig' };
  return (
    <table><thead><tr><th>Datum</th><th>Melder</th><th>Gemeld</th><th>Reden</th><th>Toelichting</th><th>Status</th></tr></thead><tbody>
      {reports?.map((r) => (
        <tr key={r._id}><td>{fmt(r._creationTime)}</td><td>{r.reporterName}</td><td>{r.reportedName}</td><td>{reason[r.reason]}</td><td>{r.details ?? '—'}</td>
          <td><select value={r.status} onChange={(e) => setStatus({ reportId: r._id, status: e.target.value as 'open' | 'reviewing' | 'closed' })}>
            <option value="open">Open</option><option value="reviewing">In behandeling</option><option value="closed">Gesloten</option></select></td></tr>
      ))}
    </tbody></table>
  );
}

function Subs() {
  const subs = useQuery(api.admin.subscriptions);
  return <table><thead><tr><th>Gebruiker</th><th>Bron</th><th>Verloopt</th></tr></thead><tbody>
    {subs?.map((s) => <tr key={s.userId}><td>{s.displayName}</td><td>{s.provider ?? '—'}</td><td>{fmt(s.expiresAt)}</td></tr>)}</tbody></table>;
}
function Errors() {
  const errs = useQuery(api.admin.errors);
  return <table><thead><tr><th>Tijd</th><th>Bron</th><th>Melding</th></tr></thead><tbody>
    {errs?.map((e) => <tr key={e.id}><td>{fmt(e.at)}</td><td>{e.source}</td><td>{e.message}</td></tr>)}</tbody></table>;
}
function Audit() {
  const rows = useQuery(api.admin.auditLog);
  return <table><thead><tr><th>Tijd</th><th>Actie</th><th>Actor</th></tr></thead><tbody>
    {rows?.map((a) => <tr key={a.id}><td>{fmt(a.at)}</td><td>{a.action}</td><td className="muted">{a.actor ?? 'systeem'}</td></tr>)}</tbody></table>;
}

export function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const isAdmin = useQuery(api.admin.amIAdmin, isAuthenticated ? {} : 'skip');
  const [tab, setTab] = useState<Tab>('stats');
  if (isLoading) return <p style={{ padding: 24 }}>Laden…</p>;
  if (!isAuthenticated) return <Login />;
  if (isAdmin === false) return <main><h2>Geen toegang</h2><p className="muted">Dit account is geen beheerder.</p><button onClick={() => signOut()}>Uitloggen</button></main>;
  const tabs: [Tab, string][] = [['stats', 'Statistieken'], ['users', 'Gebruikers'], ['reports', 'Misbruikmeldingen'], ['subs', 'Abonnementen'], ['errors', 'Foutmeldingen'], ['audit', 'Auditlog']];
  return (<>
    <header><h1>SafeWalk Beheer</h1><nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
      <button style={{ marginLeft: 'auto' }} onClick={() => signOut()}>Uitloggen</button></header>
    <main>
      <div className="notice">Beheerders hebben bewust geen toegang tot locaties, reizen of bestemmingen van gebruikers.</div>
      {tab === 'stats' && <Stats />}{tab === 'users' && <Users />}{tab === 'reports' && <Reports />}
      {tab === 'subs' && <Subs />}{tab === 'errors' && <Errors />}{tab === 'audit' && <Audit />}
    </main>
  </>);
}
