'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Download,
  Layers,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { AppData, Booking } from '@/lib/types';
import { findConflicts } from '@/lib/booking-engine';
import Calendar from './Calendar';
import Customers from './Customers';
import Settings from './Settings';
import Reports from './Reports';
import BookingDialog from './BookingDialog';
type View = 'Calendar' | 'Overview' | 'Bookings' | 'Customers' | 'Reports' | 'Settings';
const money = (p: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100);
const localDate = (s: string) =>
  new Date(s).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const time = (s: string) =>
  new Date(s).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  });
const active = (b: Booking) => !['Cancelled', 'Enquiry'].includes(b.status);
const nav = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Calendar', icon: CalendarDays },
  { name: 'Bookings', icon: ClipboardList },
  { name: 'Customers', icon: Users },
  { name: 'Reports', icon: Activity },
] as const;
const roleLabel = {
  administrator: 'Administrator',
  manager: 'Facilities manager',
  staff: 'School staff',
  readonly: 'Read only',
};
export default function Workspace() {
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState<View>('Calendar');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [mobile, setMobile] = useState(false);
  const [dialog, setDialog] = useState<Partial<Booking> | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const refresh = useCallback(async () => {
    const r = await fetch('/api/data', { cache: 'no-store' });
    const j = await r.json();
    if (r.status === 401) {
      location.href = '/login';
      return;
    }
    if (!r.ok) throw new Error(j.error || 'Unable to load workspace.');
    setData(j);
    setError('');
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const notice = (message: string) => setToast(message);
  if (!data)
    return (
      <div className="loading-page">
        <Layers size={36} />
        <h1>Fieldwork</h1>
        {error ? (
          <>
            <p className="error-message">{error}</p>
            <button className="primary" onClick={() => refresh().catch((e) => setError(e.message))}>
              Try again
            </button>
          </>
        ) : (
          <p>Preparing your workspace…</p>
        )}
      </div>
    );
  const today = localDate(new Date().toISOString());
  const todayBookings = data.bookings.filter((b) => active(b) && localDate(b.start) === today);
  const awaiting = data.bookings.filter((b) => b.status === 'Awaiting Approval').length;
  return (
    <div className="workspace">
      <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
        <a href="/" className="brand">
          <span className="brand-mark">
            <Layers size={24} />
          </span>
          Fieldwork<span className="brand-dot">®</span>
        </a>
        <button
          className="organisation"
          onClick={() =>
            notice(
              'Westfield is your current workspace. Multi-school workspaces are planned for a later version.'
            )
          }
        >
          <span className="organisation-mark">W</span>
          <span>
            <strong>Westfield School</strong>
            <small>Facilities & sports centre</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-label={name}
              className={view === name ? 'nav-item selected' : 'nav-item'}
              onClick={() => {
                setView(name);
                setMobile(false);
              }}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === 'Bookings' && awaiting > 0 && <span className="nav-badge">{awaiting}</span>}
              {view === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Leaf size={19} />
          </span>
          <strong>A little room to grow.</strong>
          <p>Your spaces bring people together. We keep them running smoothly.</p>
          <button
            onClick={() => {
              setView('Overview');
              setMobile(false);
            }}
          >
            Your workspace at a glance <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={view === 'Settings' ? 'nav-item selected' : 'nav-item'}
            onClick={() => {
              setView('Settings');
              setMobile(false);
            }}
          >
            <SettingsIcon size={18} /> Settings
          </button>
          <div className="user-card">
            <span className="avatar">
              {data.actor.role === 'administrator'
                ? 'AD'
                : data.actor.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{data.actor.name}</strong>
              <small>{roleLabel[data.actor.role]}</small>
            </span>
            {data.mode === 'supabase' && (
              <button
                title="Sign out"
                onClick={async () => {
                  await fetch('/api/session', { method: 'DELETE' });
                  location.href = '/login';
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button className="mobile-menu" onClick={() => setMobile(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{view === 'Overview' ? 'Overview' : view}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-label">
              <span /> {data.mode === 'demo' ? 'Local demo' : 'Connected to Supabase'}
            </span>
            <span className="header-divider" />
            {data.mode === 'demo' ? (
              <label className="role-switch">
                <ShieldCheck size={15} />
                <select
                  aria-label="Demo role"
                  value={data.actor.role}
                  onChange={async (e) => {
                    const r = await fetch('/api/session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ role: e.target.value }),
                    });
                    if (r.ok) {
                      setDialog(undefined);
                      await refresh();
                      notice('Demo role changed. Permissions apply on the server.');
                    }
                  }}
                >
                  {Object.entries(roleLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="muted">{roleLabel[data.actor.role]}</span>
            )}
          </div>
        </header>
        <div className="page-content">
          {['Overview', 'Bookings'].includes(view) && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">WESTFIELD FACILITIES</div>
                <h1>
                  {view === 'Overview'
                    ? 'Good things are happening here.'
                    : view === 'Bookings'
                      ? 'Every booking, in one place.'
                      : view === 'Customers'
                        ? 'The people behind the bookings.'
                        : view === 'Reports'
                          ? 'Make sense of your spaces.'
                          : 'Make it work your way.'}
                </h1>
                <p>
                  {view === 'Overview'
                    ? 'A clear view of what’s happening across your school and sports centre.'
                    : view === 'Bookings'
                      ? 'Manage requests, keep track of payments, and find the details you need.'
                      : view === 'Customers'
                        ? 'Keep your organisations, contacts, and booking history connected.'
                        : view === 'Reports'
                          ? 'A practical view of bookings, utilisation, and the numbers that matter.'
                          : 'Facilities, pricing, closures, and a clear record of every change.'}
                </p>
              </div>
              {['Overview', 'Bookings'].includes(view) && data.actor.role !== 'readonly' && (
                <button className="primary" onClick={() => setDialog(null)}>
                  <Plus size={17} />
                  New booking
                </button>
              )}
            </div>
          )}
          {data.mode === 'demo' && (
            <div className="demo-banner">
              <span className="demo-label">DEMO WORKSPACE</span>
              <span>Fictional bookings. Real booking rules. Your changes are saved locally.</span>
              <span className="demo-timezone">Europe/London</span>
            </div>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          {view === 'Calendar' && <Calendar data={data} onRefresh={refresh} onNotice={notice} />}
          {view === 'Overview' && (
            <>
              <div className="stat-grid">
                <Stat
                  label="Today’s bookings"
                  value={String(todayBookings.length)}
                  caption="Across all facilities"
                  icon={<CalendarDays size={18} />}
                />
                <Stat
                  label="Awaiting a decision"
                  value={String(awaiting)}
                  caption="Internal booking requests"
                  icon={<Clock3 size={18} />}
                />
                <Stat
                  label="Provisional bookings"
                  value={String(data.bookings.filter((b) => b.status === 'Provisional').length)}
                  caption="Waiting to be confirmed"
                  icon={<ClipboardList size={18} />}
                />
                <Stat
                  label="Outstanding balance"
                  value={money(
                    data.bookings
                      .filter((b) => active(b) && b.paymentStatus === 'Unpaid')
                      .reduce((s, b) => s + b.total, 0)
                  )}
                  caption="Unpaid bookings · excludes part-paid"
                  icon={<ArrowUpRight size={18} />}
                />
              </div>
              <div className="dashboard-columns">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>On the schedule today</h2>
                      <p>
                        {new Date().toLocaleDateString('en-GB', {
                          timeZone: 'Europe/London',
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                    </div>
                    <button className="text-button" onClick={() => setView('Calendar')}>
                      Open calendar <ArrowRight size={15} />
                    </button>
                  </div>
                  <BookingRows
                    bookings={todayBookings.sort((a, b) => a.start.localeCompare(b.start))}
                    data={data}
                    onOpen={(b) => setDialog(b)}
                  />
                </section>
                <section className="panel availability-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Spaces right now</h2>
                      <p>Availability at the current time</p>
                    </div>
                    <span className="small-live">LIVE</span>
                  </div>
                  {data.facilities
                    .filter((f) => f.active)
                    .map((f) => {
                      const now = Date.now();
                      const blocked =
                        findConflicts(
                          {
                            facilityId: f.id,
                            title: 'Availability check',
                            start: new Date(now).toISOString(),
                            end: new Date(now + 1).toISOString(),
                            bufferBefore: 0,
                            bufferAfter: 0,
                          },
                          data.bookings,
                          data.closures,
                          data.facilities
                        ).length > 0;
                      return (
                        <div className="availability-row" key={f.id}>
                          <span className="facility-dot" style={{ background: f.color }} />
                          <span>{f.name}</span>
                          <span className={blocked ? 'availability busy' : 'availability'}>
                            {blocked ? 'In use / closed' : 'Available'}
                          </span>
                        </div>
                      );
                    })}
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Coming up next</h2>
                    <p>The next bookings in your facilities</p>
                  </div>
                </div>
                <BookingRows
                  bookings={data.bookings
                    .filter((b) => active(b) && Date.parse(b.start) > Date.now())
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .slice(0, 5)}
                  data={data}
                  onOpen={(b) => setDialog(b)}
                />
              </section>
              {data.closures.length > 0 && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Closures & maintenance</h2>
                      <p>Blocked periods across your facilities</p>
                    </div>
                  </div>
                  {data.closures
                    .filter((c) => Date.parse(c.end) > Date.now())
                    .map((c) => (
                      <div className="closure-summary" key={c.id}>
                        <span className="status-pill maintenance">{c.reason}</span>
                        <strong>{data.facilities.find((f) => f.id === c.facilityId)?.name}</strong>
                        <span>
                          {new Date(c.start).toLocaleString('en-GB', { timeZone: 'Europe/London' })}{' '}
                          – {new Date(c.end).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
                        </span>
                      </div>
                    ))}
                </section>
              )}
            </>
          )}
          {view === 'Bookings' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Booking register <span className="count-pill">{data.bookings.length}</span>
                  </h2>
                  <p>Click a booking to view its details or make a change.</p>
                </div>
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search bookings"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search bookings…"
                  />
                </label>
              </div>
              <BookingRows
                bookings={data.bookings
                  .filter((b) =>
                    `${b.title} ${b.organisation} ${b.status} ${data.facilities.find((f) => f.id === b.facilityId)?.name}`
                      .toLowerCase()
                      .includes(query.toLowerCase())
                  )
                  .sort((a, b) => a.start.localeCompare(b.start))}
                data={data}
                onOpen={(b) => setDialog(b)}
              />
            </section>
          )}
          {view === 'Customers' && <Customers data={data} onRefresh={refresh} onNotice={notice} />}
          {view === 'Reports' && <Reports data={data} onRefresh={refresh} onNotice={notice} />}
          {view === 'Settings' && <Settings data={data} onRefresh={refresh} onNotice={notice} />}
          <footer className="page-footer">
            <span>
              <Layers size={13} /> A place for every possibility.
            </span>
            <span>
              Fieldwork V1 <span className="footer-dot">·</span> All times Europe/London
            </span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss notification">
            <X size={15} />
          </button>
        </div>
      )}
      {dialog !== undefined && (
        <BookingDialog
          data={data}
          initial={dialog}
          defaultDate={today}
          defaultFacility={data.facilities[0]?.id || ''}
          onClose={() => setDialog(undefined)}
          onSaved={refresh}
          onNotice={notice}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{caption}</p>
    </section>
  );
}
function BookingRows({
  bookings,
  data,
  onOpen,
}: {
  bookings: Booking[];
  data: AppData;
  onOpen: (b: Booking) => void;
}) {
  if (!bookings.length)
    return (
      <div className="empty-state">
        <CalendarDays size={28} />
        <h3>Room for something good.</h3>
        <p>No bookings match this view.</p>
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="booking-table">
        <thead>
          <tr>
            <th>Booking & organisation</th>
            <th>Facility</th>
            <th>When</th>
            <th>Status</th>
            <th>Payment</th>
            <th className="align-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr
              key={b.id}
              tabIndex={0}
              onClick={() => onOpen(b)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpen(b);
              }}
            >
              <td>
                <strong>{b.title}</strong>
                <small>{b.organisation || 'Internal school booking'}</small>
              </td>
              <td>
                <span className="facility-label">
                  <span
                    className="facility-dot"
                    style={{
                      background: data.facilities.find((f) => f.id === b.facilityId)?.color,
                    }}
                  />
                  {data.facilities.find((f) => f.id === b.facilityId)?.name}
                </span>
              </td>
              <td>
                {new Date(b.start).toLocaleDateString('en-GB', {
                  timeZone: 'Europe/London',
                  day: 'numeric',
                  month: 'short',
                })}
                <small>
                  {time(b.start)} – {time(b.end)}
                </small>
              </td>
              <td>
                <span
                  className={`status-pill ${b.type === 'School' ? 'school' : b.status.toLowerCase().replaceAll(' ', '-')}`}
                >
                  {b.status}
                </span>
              </td>
              <td>
                <span className={`payment-label ${b.paymentStatus === 'Unpaid' ? 'unpaid' : ''}`}>
                  {b.paymentStatus}
                </span>
              </td>
              <td className="align-right">
                <strong>{money(b.total)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
