'use client';
import { useState } from 'react';
import { Plus, X, Pencil, ShieldCheck, Trash2, Clock3, ChevronRight, Info } from 'lucide-react';
import type { AppData, Facility, Rate, Closure } from '@/lib/types';
import './management.css';
type Props = { data: AppData; onRefresh: () => Promise<void>; onNotice: (message: string) => void };
type Edit =
  | { type: 'facility'; value: Facility }
  | { type: 'rate'; value: Rate }
  | { type: 'closure'; value: Closure };
const money = (p: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100);
const localDate = (s: string) => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(s));
  const get = (t: string) => p.find((x) => x.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};
function londonISO(value: string) {
  const raw = new Date(`${value}:00Z`).getTime();
  if (!Number.isFinite(raw)) throw Error('Choose a valid date and time.');
  let guess = raw;
  for (let i = 0; i < 3; i++) {
    const wall = localDate(new Date(guess).toISOString());
    const offset = new Date(`${wall}:00Z`).getTime() - guess;
    guess = raw - offset;
  }
  if (localDate(new Date(guess).toISOString()) !== value)
    throw Error('This time does not exist in Europe/London because of a clock change.');
  return new Date(guess).toISOString();
}
const formatTime = (v: string) =>
  new Date(v).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
export default function Settings({ data, onRefresh, onNotice }: Props) {
  const [tab, setTab] = useState('facilities');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const admin = data.actor.role === 'administrator';
  function open(e: Edit) {
    setEdit(e);
    setError('');
    if (e.type === 'closure') {
      setStart(localDate(e.value.start));
      setEnd(localDate(e.value.end));
    }
  }
  function patch(key: string, value: unknown) {
    setEdit((prev) =>
      prev ? ({ ...prev, value: { ...prev.value, [key]: value } } as Edit) : null
    );
  }
  async function mutate(operation: string, value: unknown) {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, value }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not save settings');
    await onRefresh();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError('');
    try {
      let value: Facility | Rate | Closure = edit.value;
      if (edit.type === 'closure')
        value = { ...edit.value, start: londonISO(start), end: londonISO(end) };
      await mutate(`save-${edit.type}`, value);
      onNotice(
        edit.type === 'closure'
          ? 'Facility closure saved'
          : edit.type === 'rate'
            ? 'Hourly rate saved'
            : 'Facility settings saved'
      );
      setEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save');
    } finally {
      setBusy(false);
    }
  }
  async function removeClosure(c: Closure) {
    if (
      !window.confirm(
        `Remove the ${c.reason.toLowerCase()} closure? This will make the facility available again.`
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await mutate('delete-closure', { id: c.id });
      onNotice('Closure removed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to remove closure');
    } finally {
      setBusy(false);
    }
  }
  const newFacility = (): Facility => ({
    id: '',
    name: '',
    group: 'Other',
    parentId: null,
    color: '#5c8e76',
    bufferBefore: 0,
    bufferAfter: 0,
    accessBefore: 0,
    accessAfter: 0,
    active: true,
  });
  const newClosure = (): Closure => {
    const now = new Date();
    now.setUTCMinutes(Math.ceil(now.getUTCMinutes() / 5) * 5, 0, 0);
    return {
      id: '',
      facilityId: data.facilities[0]?.id || '',
      start: now.toISOString(),
      end: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      reason: 'Maintenance',
      notes: '',
      createdBy: data.actor.name,
    };
  };
  if (!admin)
    return (
      <section className="mg-view">
        <div className="mg-heading">
          <div>
            <h1>Administration</h1>
            <p>Facility configuration and financial settings.</p>
          </div>
        </div>
        <div className="mg-card">
          <ShieldCheck size={28} />
          <h2 style={{ marginTop: 14 }}>Administrator access required</h2>
          <p className="mg-muted">
            Your current role can view availability. An administrator manages facilities, prices,
            closures and audit records.
          </p>
        </div>
      </section>
    );
  return (
    <section className="mg-view">
      <div className="mg-heading">
        <div>
          <h1>Administration</h1>
          <p>The details that keep your facilities running smoothly.</p>
        </div>
        <span className="mg-pill">
          <ShieldCheck size={13} style={{ marginRight: 6 }} />
          Administrator
        </span>
      </div>
      <div className="mg-tabs" role="tablist" aria-label="Administration sections">
        {['facilities', 'pricing', 'closures', 'audit'].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`mg-tab ${tab === t ? 'active' : ''}`}
            onClick={() => {
              setTab(t);
              setError('');
            }}
          >
            {t === 'audit' ? 'Audit trail' : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {error && !edit && (
        <div role="alert" className="mg-error">
          {error}
        </div>
      )}
      {tab === 'facilities' && (
        <>
          <div className="mg-toolbar">
            <p className="mg-muted" style={{ flex: 1 }}>
              Manage bookable resources, turnaround buffers and access windows.
            </p>
            <button
              className="mg-button"
              onClick={() => open({ type: 'facility', value: newFacility() })}
            >
              <Plus size={15} />
              Add facility
            </button>
          </div>
          <div className="mg-card">
            <div className="mg-table-wrap">
              <table className="mg-table">
                <thead>
                  <tr>
                    <th>Facility / resource</th>
                    <th>Reserved buffer</th>
                    <th>Access window</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.facilities.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="mg-title">
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              background: f.color,
                              borderRadius: '50%',
                              marginRight: 9,
                            }}
                          />
                          {f.name}
                        </span>
                        <span className="mg-sub">
                          {f.parentId
                            ? `${data.facilities.find((p) => p.id === f.parentId)?.name || 'Parent resource'} / `
                            : ''}
                          {f.group}
                        </span>
                      </td>
                      <td>
                        {f.bufferBefore}m before · {f.bufferAfter}m after
                      </td>
                      <td>
                        {f.accessBefore}m before · {f.accessAfter}m after
                      </td>
                      <td>
                        <span className={`mg-pill ${f.active ? '' : 'gray'}`}>
                          {f.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="mg-icon-button"
                          aria-label={`Edit ${f.name}`}
                          onClick={() => open({ type: 'facility', value: { ...f } })}
                        >
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mg-note">
            <Clock3 size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />
            Customer booking time determines the charge. Facility buffers reserve time before and
            after the booking; access windows control entry separately. Changes apply to new
            bookings. Existing bookings retain their saved timings.
          </div>
        </>
      )}
      {tab === 'pricing' && (
        <>
          <div className="mg-toolbar">
            <p className="mg-muted" style={{ flex: 1 }}>
              Database-managed hourly rates, prorated to actual booking duration.
            </p>
            <button
              className="mg-button"
              onClick={() =>
                open({
                  type: 'rate',
                  value: { id: '', name: '', facilityId: null, exVat: 0, vat: 0, total: 0 },
                })
              }
            >
              <Plus size={15} />
              Add rate
            </button>
          </div>
          <div className="mg-card">
            <div className="mg-table-wrap">
              <table className="mg-table">
                <thead>
                  <tr>
                    <th>Price type</th>
                    <th>Ex VAT / hour</th>
                    <th>VAT / hour</th>
                    <th>Total / hour</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rates.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="mg-title">{r.name}</span>
                        <span className="mg-sub">
                          {data.facilities.find((f) => f.id === r.facilityId)?.name ||
                            'Additional price type'}
                          {r.exVat + r.vat !== r.total && (
                            <span style={{ color: '#a58142' }}>
                              {' '}
                              · Supplied total differs by{' '}
                              {money(Math.abs(r.exVat + r.vat - r.total))}
                            </span>
                          )}
                        </span>
                      </td>
                      <td>{money(r.exVat)}</td>
                      <td>{money(r.vat)}</td>
                      <td>
                        <strong>{money(r.total)}</strong>
                      </td>
                      <td>
                        <button
                          className="mg-icon-button"
                          aria-label={`Edit ${r.name} rate`}
                          onClick={() => open({ type: 'rate', value: { ...r } })}
                        >
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mg-note">
            <Info size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />
            The supplied pricing schedule includes totals that differ from ex VAT + VAT. These
            values are preserved independently. Confirm the intended financial schedule before live
            billing. Rate changes do not reprice existing bookings.
          </div>
        </>
      )}
      {tab === 'closures' && (
        <>
          <div className="mg-toolbar">
            <p className="mg-muted" style={{ flex: 1 }}>
              Block time for maintenance, school events and unavailable pitches.
            </p>
            <button
              className="mg-button"
              onClick={() => open({ type: 'closure', value: newClosure() })}
            >
              <Plus size={15} />
              Add closure
            </button>
          </div>
          <div className="mg-card">
            <div className="mg-table-wrap">
              <table className="mg-table">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Reason</th>
                    <th>From</th>
                    <th>Until</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.closures]
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((c) => (
                      <tr key={c.id}>
                        <td className="mg-title">
                          {data.facilities.find((f) => f.id === c.facilityId)?.name || c.facilityId}
                        </td>
                        <td>
                          <span className="mg-pill amber">{c.reason}</span>
                          {c.notes && <span className="mg-sub">{c.notes}</span>}
                        </td>
                        <td>{formatTime(c.start)}</td>
                        <td>{formatTime(c.end)}</td>
                        <td>
                          <div className="mg-inline">
                            <button
                              className="mg-icon-button"
                              aria-label={`Edit ${c.reason} closure`}
                              onClick={() => open({ type: 'closure', value: { ...c } })}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              disabled={busy}
                              className="mg-icon-button"
                              aria-label={`Remove ${c.reason} closure`}
                              onClick={() => removeClosure(c)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!data.closures.length && (
                <div className="mg-empty">
                  No closures scheduled. All active facilities are available outside their bookings.
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'audit' && (
        <>
          <p className="mg-muted" style={{ marginBottom: 20 }}>
            A record of important changes, including previous values and the person responsible.
          </p>
          {[...data.audit]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((a) => (
              <details className="mg-details" key={a.id}>
                <summary>
                  <span className="mg-inline" style={{ display: 'inline-flex' }}>
                    <span className="mg-pill gray">{a.action}</span>
                    <span>{a.entity}</span>
                    <span style={{ fontSize: 12, color: '#8b978f', fontWeight: 400 }}>
                      {formatTime(a.at)} · {a.actor}
                    </span>
                  </span>
                </summary>
                <div className="mg-details-content">
                  <p className="mg-muted">Record {a.entityId}</p>
                  {a.reason && <div className="mg-note">Reason: {a.reason}</div>}
                  <div className="mg-two-col">
                    <div>
                      <h4>Previous value</h4>
                      <pre className="mg-json">
                        {JSON.stringify(a.oldValue, null, 2) || 'No previous value'}
                      </pre>
                    </div>
                    <div>
                      <h4>New value</h4>
                      <pre className="mg-json">
                        {JSON.stringify(a.newValue, null, 2) || 'Record removed'}
                      </pre>
                    </div>
                  </div>
                </div>
              </details>
            ))}
          {!data.audit.length && (
            <div className="mg-card mg-empty">
              Your audit trail will appear here as bookings and settings change.
            </div>
          )}
        </>
      )}
      {edit && (
        <div
          className="mg-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setEdit(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${edit.value.id ? 'Edit' : 'New'} ${edit.type}`}
            className="mg-modal"
          >
            <div className="mg-modal-head">
              <h2>
                {edit.value.id ? 'Edit' : 'New'} {edit.type === 'rate' ? 'hourly rate' : edit.type}
              </h2>
              <button
                aria-label="Close settings dialog"
                disabled={busy}
                className="mg-icon-button"
                onClick={() => setEdit(null)}
              >
                <X size={19} />
              </button>
            </div>
            <form className="mg-form" onSubmit={save}>
              <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
                <div className="mg-form-grid">
                  {edit.type === 'facility' && (
                    <>
                      <label>
                        Facility name *
                        <input
                          required
                          maxLength={200}
                          value={edit.value.name}
                          onChange={(e) => patch('name', e.target.value)}
                        />
                      </label>
                      <label>
                        Group
                        <input
                          required
                          list="facility-groups"
                          value={edit.value.group}
                          onChange={(e) => patch('group', e.target.value)}
                        />
                        <datalist id="facility-groups">
                          {Array.from(
                            new Set([
                              ...data.facilities.map((f) => f.group),
                              'Squash',
                              'Westfield',
                              'Other',
                            ])
                          ).map((g) => (
                            <option key={g} value={g} />
                          ))}
                        </datalist>
                      </label>
                      <label>
                        Parent facility
                        <select
                          value={edit.value.parentId || ''}
                          onChange={(e) => patch('parentId', e.target.value || null)}
                        >
                          <option value="">None · independent resource</option>
                          {data.facilities
                            .filter((f) => f.id !== edit.value.id)
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Calendar colour
                        <input
                          type="color"
                          value={edit.value.color}
                          onChange={(e) => patch('color', e.target.value)}
                        />
                      </label>
                      <label>
                        Facility buffer before (minutes)
                        <input
                          type="number"
                          min="0"
                          max="240"
                          step="1"
                          value={edit.value.bufferBefore}
                          onChange={(e) => patch('bufferBefore', Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Facility buffer after (minutes)
                        <input
                          type="number"
                          min="0"
                          max="240"
                          step="1"
                          value={edit.value.bufferAfter}
                          onChange={(e) => patch('bufferAfter', Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Access begins before (minutes)
                        <input
                          type="number"
                          min="0"
                          max="240"
                          step="1"
                          value={edit.value.accessBefore}
                          onChange={(e) => patch('accessBefore', Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Access ends after (minutes)
                        <input
                          type="number"
                          min="0"
                          max="240"
                          step="1"
                          value={edit.value.accessAfter}
                          onChange={(e) => patch('accessAfter', Number(e.target.value))}
                        />
                      </label>
                      <label className="checkbox full">
                        <input
                          type="checkbox"
                          checked={edit.value.active}
                          onChange={(e) => patch('active', e.target.checked)}
                        />
                        Facility is active and bookable
                      </label>
                      <p className="mg-muted full">
                        Parent/child resources share availability. Create individual Westfield
                        pitches underneath Westfield, or add more independent squash courts.
                        Configure a rate under Pricing if needed.
                      </p>
                    </>
                  )}
                  {edit.type === 'rate' && (
                    <>
                      <label>
                        Rate name *
                        <input
                          required
                          maxLength={200}
                          value={edit.value.name}
                          onChange={(e) => patch('name', e.target.value)}
                        />
                      </label>
                      <label>
                        Linked facility
                        <select
                          value={edit.value.facilityId || ''}
                          onChange={(e) => patch('facilityId', e.target.value || null)}
                        >
                          <option value="">Additional price type</option>
                          {data.facilities.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Ex VAT per hour (£)
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          required
                          step="0.01"
                          defaultValue={(edit.value.exVat / 100).toString()}
                          onChange={(e) => patch('exVat', Math.round(Number(e.target.value) * 100))}
                        />
                      </label>
                      <label>
                        VAT per hour (£)
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          required
                          step="0.01"
                          defaultValue={(edit.value.vat / 100).toString()}
                          onChange={(e) => patch('vat', Math.round(Number(e.target.value) * 100))}
                        />
                      </label>
                      <label>
                        Total per hour (£)
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          required
                          step="0.01"
                          defaultValue={(edit.value.total / 100).toString()}
                          onChange={(e) => patch('total', Math.round(Number(e.target.value) * 100))}
                        />
                      </label>
                      {edit.value.exVat + edit.value.vat !== edit.value.total && (
                        <div className="mg-note full">
                          Ex VAT plus VAT is {money(edit.value.exVat + edit.value.vat)}. The total
                          is saved separately as {money(edit.value.total)}. Confirm this discrepancy
                          is intentional.
                        </div>
                      )}
                    </>
                  )}
                  {edit.type === 'closure' && (
                    <>
                      <label>
                        Facility *
                        <select
                          required
                          value={edit.value.facilityId}
                          onChange={(e) => patch('facilityId', e.target.value)}
                        >
                          {data.facilities.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Closure reason
                        <select
                          value={edit.value.reason}
                          onChange={(e) => patch('reason', e.target.value)}
                        >
                          {[
                            'Maintenance',
                            'School event',
                            'Exams',
                            'Private event',
                            'Holiday',
                            'Unplayable pitch',
                            'Other',
                          ].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Start · Europe/London
                        <input
                          type="datetime-local"
                          required
                          step="300"
                          value={start}
                          onChange={(e) => setStart(e.target.value)}
                        />
                      </label>
                      <label>
                        End · Europe/London
                        <input
                          type="datetime-local"
                          required
                          step="300"
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                        />
                      </label>
                      <label className="full">
                        Closure notes
                        <textarea
                          value={edit.value.notes}
                          onChange={(e) => patch('notes', e.target.value)}
                        />
                      </label>
                      <p className="mg-muted full">
                        This period prevents normal bookings, including conflicting full/half
                        pitches and parent resources.
                      </p>
                    </>
                  )}
                </div>
              </fieldset>
              {error && (
                <div className="mg-error" role="alert">
                  {error}
                </div>
              )}
              <div className="mg-form-actions">
                <button type="button" className="mg-button secondary" onClick={() => setEdit(null)}>
                  Cancel
                </button>
                <button type="submit" className="mg-button" disabled={busy}>
                  {busy ? 'Saving…' : 'Save changes'}
                  <ChevronRight size={14} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
