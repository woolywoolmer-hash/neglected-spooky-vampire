'use client';
import { useState } from 'react';
import { Search, Plus, X, ArrowUpRight, Users, Mail, Phone } from 'lucide-react';
import type { AppData, Customer } from '@/lib/types';
import './management.css';
type Props = { data: AppData; onRefresh: () => Promise<void>; onNotice: (message: string) => void };
const emptyCustomer: Customer = {
  id: '',
  organisation: '',
  contactName: '',
  address: '',
  telephone: '',
  email: '',
  billingInfo: '',
  discount: 0,
  notes: '',
  active: true,
};
const money = (p: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100);
export default function Customers({ data, onRefresh, onNotice }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = ['administrator', 'manager'].includes(data.actor.role);
  const customers = data.customers.filter(
    (c) =>
      (filter === 'all' || (filter === 'active' ? c.active : !c.active)) &&
      `${c.organisation} ${c.contactName} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );
  const patch = (key: keyof Customer, value: string | number | boolean) =>
    setSelected((c) => (c ? { ...c, [key]: value } : c));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: selected }),
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error || 'Could not save customer');
      await onRefresh();
      setSelected(null);
      onNotice('Customer record saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mg-view">
      <div className="mg-heading">
        <div>
          <h1>Customers</h1>
          <p>A familiar face behind every booking. Manage your clubs, schools and hirers.</p>
        </div>
        {editable && (
          <button
            className="mg-button"
            onClick={() => {
              setSelected({ ...emptyCustomer });
              setError('');
            }}
          >
            <Plus size={16} />
            Add customer
          </button>
        )}
      </div>
      <div className="mg-stat-grid">
        <div className="mg-stat">
          <span>Total customers</span>
          <strong>{data.customers.length}</strong>
        </div>
        <div className="mg-stat">
          <span>Active relationships</span>
          <strong>{data.customers.filter((c) => c.active).length}</strong>
        </div>
        <div className="mg-stat">
          <span>Organisations with bookings</span>
          <strong>
            {new Set(data.bookings.filter((b) => b.customerId).map((b) => b.customerId)).size}
          </strong>
        </div>
        <div className="mg-stat">
          <span>Agreed discounts</span>
          <strong>{data.customers.filter((c) => c.discount > 0).length}</strong>
        </div>
      </div>
      <div className="mg-card">
        <div className="mg-toolbar">
          <div className="mg-search">
            <Search size={16} />
            <input
              aria-label="Search customers"
              placeholder="Search organisations, contacts or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Customer status"
            className="mg-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All customers</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
          <span className="mg-muted">{customers.length} customers</span>
        </div>
        <div className="mg-table-wrap">
          <table className="mg-table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Contact</th>
                <th>Bookings</th>
                <th>Agreed discount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="mg-identity">
                      <span className="mg-avatar">
                        {c.organisation
                          .split(' ')
                          .map((s) => s[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <span>
                        <span className="mg-title">{c.organisation}</span>
                        <span className="mg-sub">{c.address || 'No address recorded'}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="mg-title">{c.contactName || '—'}</span>
                    <span className="mg-sub">{c.email || 'No email recorded'}</span>
                  </td>
                  <td>{data.bookings.filter((b) => b.customerId === c.id).length}</td>
                  <td>{c.discount > 0 ? `${c.discount}%` : 'Standard rate'}</td>
                  <td>
                    <span className={`mg-pill ${c.active ? '' : 'gray'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="mg-icon-button"
                      aria-label={`Open ${c.organisation}`}
                      onClick={() => {
                        setSelected({ ...c });
                        setError('');
                      }}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!customers.length && (
            <div className="mg-empty">
              <Users size={28} />
              <p>No customers match your search.</p>
            </div>
          )}
        </div>
      </div>
      {selected && (
        <div
          className="mg-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setSelected(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={selected.id ? 'Customer record' : 'New customer'}
            className="mg-modal"
          >
            <div className="mg-modal-head">
              <h2>{selected.id ? selected.organisation : 'New customer'}</h2>
              <button
                aria-label="Close customer"
                className="mg-icon-button"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                <X size={19} />
              </button>
            </div>
            <form className="mg-form" onSubmit={save}>
              <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0 }}>
                <div className="mg-form-grid">
                  <label>
                    Organisation *
                    <input
                      required
                      maxLength={200}
                      value={selected.organisation}
                      onChange={(e) => patch('organisation', e.target.value)}
                    />
                  </label>
                  <label>
                    Contact name
                    <input
                      maxLength={200}
                      value={selected.contactName}
                      onChange={(e) => patch('contactName', e.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      <Mail size={12} /> Email
                    </span>
                    <input
                      type="email"
                      value={selected.email}
                      onChange={(e) => patch('email', e.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      <Phone size={12} /> Telephone
                    </span>
                    <input
                      type="tel"
                      value={selected.telephone}
                      onChange={(e) => patch('telephone', e.target.value)}
                    />
                  </label>
                  <label className="full">
                    Address
                    <textarea
                      value={selected.address}
                      onChange={(e) => patch('address', e.target.value)}
                    />
                  </label>
                  <label>
                    Billing information
                    <textarea
                      value={selected.billingInfo}
                      onChange={(e) => patch('billingInfo', e.target.value)}
                    />
                  </label>
                  <label>
                    Agreed discount (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      defaultValue={selected.discount}
                      onChange={(e) => patch('discount', Number(e.target.value))}
                    />
                    <span className="mg-muted">Applied to future calculated prices.</span>
                  </label>
                  <label className="full">
                    Notes
                    <textarea
                      value={selected.notes}
                      onChange={(e) => patch('notes', e.target.value)}
                    />
                  </label>
                  <label className="checkbox full">
                    <input
                      type="checkbox"
                      checked={selected.active}
                      onChange={(e) => patch('active', e.target.checked)}
                    />
                    Active customer
                  </label>
                </div>
              </fieldset>
              {selected.id && (
                <div style={{ marginTop: 26 }}>
                  <h3 style={{ fontSize: 15 }}>Booking history</h3>
                  <div className="mg-table-wrap">
                    <table className="mg-table">
                      <thead>
                        <tr>
                          <th>Booking</th>
                          <th>Date</th>
                          <th>Status</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bookings
                          .filter((b) => b.customerId === selected.id)
                          .sort((a, b) => b.start.localeCompare(a.start))
                          .map((b) => (
                            <tr key={b.id}>
                              <td>
                                {b.title}
                                <span className="mg-sub">
                                  {data.facilities.find((f) => f.id === b.facilityId)?.name}
                                </span>
                              </td>
                              <td>
                                {new Date(b.start).toLocaleDateString('en-GB', {
                                  timeZone: 'Europe/London',
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </td>
                              <td>
                                <span className="mg-pill gray">{b.status}</span>
                              </td>
                              <td>{money(b.total)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!data.bookings.some((b) => b.customerId === selected.id) && (
                      <p className="mg-muted">No bookings yet.</p>
                    )}
                  </div>
                </div>
              )}
              {error && (
                <div className="mg-error" role="alert">
                  {error}
                </div>
              )}
              <div className="mg-form-actions">
                <button
                  type="button"
                  className="mg-button secondary"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
                {editable && (
                  <button type="submit" disabled={busy} className="mg-button">
                    {busy ? 'Saving…' : 'Save customer'}
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
