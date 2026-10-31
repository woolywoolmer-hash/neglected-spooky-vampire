'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X,
  CalendarDays,
  Clock3,
  PoundSterling,
  Repeat2,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import type {
  AppData,
  Booking,
  BookingInput,
  BookingStatus,
  BookingType,
  PaymentStatus,
  Recurrence,
} from '@/lib/types';
import { calculatePrice, londonInputToIso } from '@/lib/booking-engine';
import './calendar.css';

const londonParts = (date: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
export function londonDate(value: string | Date = new Date()) {
  const p = londonParts(new Date(value));
  return `${p.year}-${p.month}-${p.day}`;
}
export function londonTime(value: string | Date) {
  const p = londonParts(new Date(value));
  return `${p.hour}:${p.minute}`;
}
export function londonTimestamp(date: string, time: string) {
  return londonInputToIso(`${date}T${time}`);
}
const money = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100);
const statuses: BookingStatus[] = [
  'Enquiry',
  'Provisional',
  'Awaiting Approval',
  'Confirmed',
  'Cancelled',
  'Completed',
];
const types: BookingType[] = [
  'School',
  'Sports Centre',
  'External Hirer',
  'Complimentary',
  'Maintenance',
];
const payments: PaymentStatus[] = ['Unpaid', 'Part paid', 'Paid', 'Not required'];

type Props = {
  data: AppData;
  initial: Partial<Booking> | null;
  defaultDate: string;
  defaultFacility: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onNotice: (message: string) => void;
};
export default function BookingDialog({
  data,
  initial,
  defaultDate,
  defaultFacility,
  onClose,
  onSaved,
  onNotice,
}: Props) {
  const isAdmin = data.actor.role === 'administrator';
  const staff = data.actor.role === 'staff';
  const editing = !!initial?.id;
  const viewOnly =
    data.actor.role === 'readonly' ||
    (staff &&
      editing &&
      ((initial?.createdById ?? initial?.createdBy) !== data.actor.id ||
        initial?.type !== 'School'));
  const dialog = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<Partial<Booking>>({
    facilityId: defaultFacility,
    title: '',
    customerId: null,
    organisation: '',
    contactName: '',
    telephone: '',
    email: '',
    type: staff ? 'School' : 'External Hirer',
    status: staff ? 'Awaiting Approval' : 'Confirmed',
    paymentStatus: staff ? 'Not required' : 'Unpaid',
    attendees: 1,
    notes: '',
    accessRequirements: '',
    accessCode: '',
    priceOverride: false,
    conflictOverride: false,
    overrideReason: '',
    cancellationReason: '',
    ...initial,
  });
  const [date, setDate] = useState(initial?.start ? londonDate(initial.start) : defaultDate);
  const [endDate, setEndDate] = useState(initial?.end ? londonDate(initial.end) : defaultDate);
  const [startTime, setStartTime] = useState(initial?.start ? londonTime(initial.start) : '09:00');
  const [endTime, setEndTime] = useState(initial?.end ? londonTime(initial.end) : '10:00');
  const [recurrence, setRecurrence] = useState<Recurrence>({
    frequency: 'none',
    interval: 1,
    weekdays: [],
    count: 8,
    until: '',
  });
  const [limitBy, setLimitBy] = useState<'count' | 'until'>('count');
  const [prices, setPrices] = useState({
    exVat: (initial?.exVat ?? 0) / 100,
    vat: (initial?.vat ?? 0) / 100,
    total: (initial?.total ?? 0) / 100,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extra, setExtra] = useState(viewOnly);
  const facility = data.facilities.find((item) => item.id === form.facilityId);
  const customer = data.customers.find((item) => item.id === form.customerId);
  const rate = data.rates.find((item) => item.facilityId === form.facilityId);
  const set = <K extends keyof Booking>(key: K, value: Booking[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  let start = '',
    end = '',
    quoted = { exVat: 0, vat: 0, total: 0 };
  try {
    start = londonTimestamp(date, startTime);
    end = londonTimestamp(endDate, endTime);
    if (end > start)
      quoted = calculatePrice(
        rate,
        start,
        end,
        form.type ?? 'External Hirer',
        customer?.discount ?? 0
      );
  } catch {
    /* Display the validation error on submit. */
  }
  const sameTerms =
    editing &&
    Date.parse(initial?.start ?? '') === Date.parse(start) &&
    Date.parse(initial?.end ?? '') === Date.parse(end) &&
    initial?.facilityId === form.facilityId &&
    initial?.type === form.type &&
    initial?.customerId === form.customerId &&
    !!initial?.priceOverride === !!form.priceOverride;
  if (sameTerms)
    quoted = { exVat: initial?.exVat ?? 0, vat: initial?.vat ?? 0, total: initial?.total ?? 0 };
  const displayed = form.priceOverride
    ? {
        exVat: Math.round(prices.exVat * 100),
        vat: Math.round(prices.vat * 100),
        total: Math.round(prices.total * 100),
      }
    : quoted;
  const duration = start && end ? Math.max(0, (Date.parse(end) - Date.parse(start)) / 60000) : 0;
  const range = (before: number, after: number) =>
    start && end
      ? `${londonTime(new Date(Date.parse(start) - before * 60000))}–${londonTime(new Date(Date.parse(end) + after * 60000))}`
      : '—';
  const before = form.bufferBefore ?? facility?.bufferBefore ?? 0;
  const after = form.bufferAfter ?? facility?.bufferAfter ?? 0;
  const accessBefore = form.accessBefore ?? facility?.accessBefore ?? 0;
  const accessAfter = form.accessAfter ?? facility?.accessAfter ?? 0;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('input,button,select')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [onClose]);

  function updateStart(time: string) {
    setStartTime(time);
    try {
      const proposed = new Date(Date.parse(londonTimestamp(date, time)) + 60 * 60000);
      setEndTime(londonTime(proposed));
      setEndDate(londonDate(proposed));
    } catch {
      /* Validated on submit. */
    }
  }
  function chooseCustomer(id: string) {
    const selected = data.customers.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      customerId: id || null,
      ...(selected
        ? {
            organisation: selected.organisation,
            contactName: selected.contactName,
            telephone: selected.telephone,
            email: selected.email,
          }
        : {}),
    }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (viewOnly) return;
    setError('');
    setBusy(true);
    try {
      const start = londonTimestamp(date, startTime),
        end = londonTimestamp(endDate, endTime);
      if (Date.parse(end) <= Date.parse(start))
        throw new Error('End time must be after start time.');
      if (form.status === 'Cancelled' && !form.cancellationReason?.trim())
        throw new Error('Please record a cancellation reason.');
      const input: BookingInput = {
        ...form,
        facilityId: form.facilityId!,
        title: form.title!.trim(),
        start,
        end,
        ...displayed,
        bufferBefore: before,
        bufferAfter: after,
        accessBefore,
        accessAfter,
        recurrence:
          !editing && recurrence.frequency !== 'none'
            ? {
                ...recurrence,
                count: limitBy === 'count' ? recurrence.count : 0,
                until: limitBy === 'until' ? recurrence.until : '',
              }
            : undefined,
      };
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: input }),
      });
      const result = await response.json();
      if (!response.ok) {
        const conflicts = Array.isArray(result.conflicts)
          ? result.conflicts
              .slice(0, 4)
              .map(
                (conflict: { title: string; start: string; end: string }) =>
                  `${conflict.title} (${londonDate(conflict.start)}, ${londonTime(conflict.start)}–${londonTime(conflict.end)})`
              )
              .join('; ')
          : '';
        throw new Error(
          `${result.error || 'Unable to save booking.'}${conflicts ? ` ${conflicts}` : ''}`
        );
      }
      await onSaved();
      onNotice(
        editing
          ? 'Booking updated. Changes recorded in the audit trail.'
          : recurrence.frequency !== 'none'
            ? 'Recurring bookings created successfully.'
            : 'Booking created successfully.'
      );
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save booking.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="bd-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialog}
        className="bd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bd-title"
      >
        <header className="bd-header">
          <div>
            <span className="bd-eyebrow">FACILITY BOOKING</span>
            <h2 id="bd-title">
              {viewOnly
                ? 'Booking details'
                : editing
                  ? 'Edit booking'
                  : 'Make room for something great.'}
            </h2>
            <p>
              {viewOnly
                ? 'Your role can view this booking. Contact the facilities team for changes.'
                : editing
                  ? initial?.seriesId
                    ? 'Editing this occurrence only. The rest of the series stays unchanged.'
                    : 'Update the booking details below.'
                  : 'Choose a space, set a time, and you’re all booked in.'}
            </p>
          </div>
          <button
            className="cal-icon-btn"
            type="button"
            aria-label="Close booking form"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <form onSubmit={save}>
          <fieldset className="bd-fieldset" disabled={viewOnly}>
            <div className="bd-body">
              <div className="bd-fields">
                {error && (
                  <div className="bd-error" role="alert">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                  </div>
                )}
                <section className="bd-section">
                  <h3>
                    <CalendarDays size={17} /> The booking
                  </h3>
                  <label>
                    Booking purpose{' '}
                    <input
                      required
                      maxLength={200}
                      value={form.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder="e.g. U14 football training"
                    />
                  </label>
                  <div className="bd-row">
                    <label>
                      Facility / resource{' '}
                      <select
                        value={form.facilityId}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            facilityId: e.target.value,
                            bufferBefore: undefined,
                            bufferAfter: undefined,
                            accessBefore: undefined,
                            accessAfter: undefined,
                          }))
                        }
                      >
                        {data.facilities
                          .filter((f) => f.active || f.id === form.facilityId)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                              {!f.active ? ' (inactive)' : ''}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Booking type{' '}
                      <select
                        value={form.type}
                        onChange={(e) => set('type', e.target.value as BookingType)}
                      >
                        {(staff && !viewOnly ? ['School'] : types).map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {editing && facility && !facility.active && (
                    <p className="bd-inactive-hint">
                      <AlertTriangle size={14} /> This facility is inactive. This booking can only
                      be cancelled or completed.
                    </p>
                  )}
                  <div className="bd-row">
                    <label>
                      Start date{' '}
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          if (endDate === date) setEndDate(e.target.value);
                        }}
                      />
                    </label>
                    <label>
                      End date{' '}
                      <input
                        type="date"
                        required
                        min={date}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="bd-row">
                    <label>
                      Start time{' '}
                      <input
                        type="time"
                        step="300"
                        required
                        value={startTime}
                        onChange={(e) => updateStart(e.target.value)}
                      />
                    </label>
                    <label>
                      End time{' '}
                      <input
                        type="time"
                        step="300"
                        required
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                    </label>
                  </div>
                  <p className="bd-hint">
                    All times are Europe/London. Book any time in 5-minute increments.
                  </p>
                  <div className="bd-row">
                    <label>
                      Status{' '}
                      <select
                        value={form.status}
                        onChange={(e) => set('status', e.target.value as BookingStatus)}
                      >
                        {staff &&
                          !viewOnly &&
                          form.status !== 'Awaiting Approval' &&
                          form.status !== 'Cancelled' && (
                            <option disabled value={form.status}>
                              {form.status} — select a request or cancellation
                            </option>
                          )}
                        {(staff && !viewOnly ? ['Awaiting Approval', 'Cancelled'] : statuses).map(
                          (status) => (
                            <option key={status}>{status}</option>
                          )
                        )}
                      </select>
                    </label>
                    <label>
                      Attendees{' '}
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="1"
                        value={form.attendees}
                        onChange={(e) => set('attendees', Number(e.target.value))}
                      />
                    </label>
                  </div>
                  {form.status === 'Cancelled' && (
                    <label>
                      Cancellation reason{' '}
                      <textarea
                        required
                        value={form.cancellationReason}
                        onChange={(e) => set('cancellationReason', e.target.value)}
                        placeholder="Why is this booking being cancelled?"
                      />
                    </label>
                  )}
                </section>
                <section className="bd-section">
                  <h3>Customer & contact</h3>
                  <label>
                    Customer record{' '}
                    <select
                      value={form.customerId ?? ''}
                      onChange={(e) => chooseCustomer(e.target.value)}
                    >
                      <option value="">No linked record / enter details below</option>
                      {data.customers
                        .filter((c) => c.active || c.id === form.customerId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.organisation}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="bd-row">
                    <label>
                      Organisation{' '}
                      <input
                        maxLength={160}
                        value={form.organisation}
                        onChange={(e) => set('organisation', e.target.value)}
                        placeholder="Organisation or school team"
                      />
                    </label>
                    <label>
                      Contact name{' '}
                      <input
                        maxLength={120}
                        value={form.contactName}
                        onChange={(e) => set('contactName', e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="bd-row">
                    <label>
                      Email{' '}
                      <input
                        type="email"
                        maxLength={254}
                        value={form.email}
                        onChange={(e) => set('email', e.target.value)}
                      />
                    </label>
                    <label>
                      Telephone{' '}
                      <input
                        type="tel"
                        maxLength={40}
                        value={form.telephone}
                        onChange={(e) => set('telephone', e.target.value)}
                      />
                    </label>
                  </div>
                </section>
                {!editing && (
                  <section className="bd-section">
                    <h3>
                      <Repeat2 size={17} /> Repeat booking
                    </h3>
                    <div className="bd-row">
                      <label>
                        Frequency{' '}
                        <select
                          value={recurrence.frequency}
                          onChange={(e) =>
                            setRecurrence((r) => ({
                              ...r,
                              frequency: e.target.value as Recurrence['frequency'],
                            }))
                          }
                        >
                          <option value="none">Does not repeat</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="weekdays">Selected weekdays</option>
                          <option value="fortnightly">Fortnightly</option>
                          <option value="monthly">Monthly</option>
                          <option value="custom">Custom — every N days</option>
                        </select>
                      </label>
                      {recurrence.frequency === 'custom' && (
                        <label>
                          Repeat every (days){' '}
                          <input
                            type="number"
                            min="1"
                            max="365"
                            required
                            value={recurrence.interval}
                            onChange={(e) =>
                              setRecurrence((r) => ({ ...r, interval: Number(e.target.value) }))
                            }
                          />
                        </label>
                      )}
                    </div>
                    {recurrence.frequency === 'weekdays' && (
                      <div className="bd-weekdays">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                          <button
                            type="button"
                            key={day}
                            className={recurrence.weekdays.includes(index) ? 'selected' : ''}
                            aria-pressed={recurrence.weekdays.includes(index)}
                            onClick={() =>
                              setRecurrence((r) => ({
                                ...r,
                                weekdays: r.weekdays.includes(index)
                                  ? r.weekdays.filter((d) => d !== index)
                                  : [...r.weekdays, index],
                              }))
                            }
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    )}
                    {recurrence.frequency !== 'none' && (
                      <>
                        <div className="bd-row">
                          <label>
                            Series ends{' '}
                            <select
                              value={limitBy}
                              onChange={(e) => setLimitBy(e.target.value as 'count' | 'until')}
                            >
                              <option value="count">After a number of bookings</option>
                              <option value="until">On a date</option>
                            </select>
                          </label>
                          {limitBy === 'count' ? (
                            <label>
                              Occurrences{' '}
                              <input
                                type="number"
                                min="1"
                                max="366"
                                required
                                value={recurrence.count}
                                onChange={(e) =>
                                  setRecurrence((r) => ({ ...r, count: Number(e.target.value) }))
                                }
                              />
                            </label>
                          ) : (
                            <label>
                              End date{' '}
                              <input
                                type="date"
                                min={date}
                                required
                                value={recurrence.until}
                                onChange={(e) =>
                                  setRecurrence((r) => ({ ...r, until: e.target.value }))
                                }
                              />
                            </label>
                          )}
                        </div>
                        <p className="bd-hint">
                          Every occurrence is checked for conflicts. The series saves together, or
                          not at all.
                        </p>
                      </>
                    )}
                  </section>
                )}
                <section className="bd-section">
                  <button
                    className="bd-expand"
                    type="button"
                    aria-expanded={extra}
                    onClick={() => setExtra(!extra)}
                  >
                    <span>
                      <ShieldCheck size={17} /> Access, buffers & notes
                    </span>
                    <ChevronDown size={17} className={extra ? 'rotated' : ''} />
                  </button>
                  {extra && (
                    <div className="bd-expanded">
                      <div className="bd-row">
                        <label>
                          Access requirements{' '}
                          <input
                            value={form.accessRequirements}
                            onChange={(e) => set('accessRequirements', e.target.value)}
                            placeholder="e.g. Step-free entrance"
                          />
                        </label>
                        <label>
                          Access code{' '}
                          <input
                            value={form.accessCode}
                            autoComplete="off"
                            onChange={(e) => set('accessCode', e.target.value)}
                            placeholder="Optional manual code"
                          />
                        </label>
                      </div>
                      <p className="bd-hint">
                        Access codes are recorded only. Door control is not connected.
                      </p>
                      <div className="bd-timing-snapshot">
                        <p>
                          Facility buffer: {before} minutes before / {after} minutes after.
                        </p>
                        <p>
                          Access window: {accessBefore} minutes before / {accessAfter} minutes
                          after.
                        </p>
                        <p className="bd-hint">
                          These periods are configured per facility in Settings. Access time does
                          not reserve the facility or increase the charge.
                        </p>
                      </div>
                      <label>
                        Notes{' '}
                        <textarea
                          rows={3}
                          value={form.notes}
                          onChange={(e) => set('notes', e.target.value)}
                          placeholder="Anything the facilities team should know"
                        />
                      </label>
                    </div>
                  )}
                </section>
              </div>
              <aside className="bd-summary">
                <div className="bd-summary-inner">
                  <div className="bd-space-icon">
                    <CalendarDays size={25} />
                  </div>
                  <p className="bd-summary-label">YOUR SPACE</p>
                  <h3>{facility?.name ?? 'Choose a facility'}</h3>
                  <div className="bd-summary-date">
                    {date &&
                      new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'Europe/London',
                      })}
                  </div>
                  <div className="bd-duration">
                    <Clock3 size={16} />
                    <strong>
                      {startTime}–{endTime}
                    </strong>
                    <span>{duration} mins</span>
                  </div>
                  <div className="bd-price-lines">
                    <p>
                      <span>Excluding VAT</span>
                      <strong>{money(displayed.exVat)}</strong>
                    </p>
                    <p>
                      <span>VAT</span>
                      <strong>{money(displayed.vat)}</strong>
                    </p>
                    {!!customer?.discount && !form.priceOverride && (
                      <p>
                        <span>Customer discount</span>
                        <strong>{customer.discount}%</strong>
                      </p>
                    )}
                    <p className="bd-price-total">
                      <span>Total</span>
                      <strong>{money(displayed.total)}</strong>
                    </p>
                  </div>
                  <p className="bd-hint">
                    {!rate &&
                    form.type !== 'School' &&
                    form.type !== 'Complimentary' &&
                    form.type !== 'Maintenance'
                      ? 'No hourly rate configured. An administrator can set a price override.'
                      : form.type === 'School' ||
                          form.type === 'Complimentary' ||
                          form.type === 'Maintenance'
                        ? 'No charge for this booking type.'
                        : `${rate ? money(rate.total) : '£0.00'} per hour · charged for booking time only`}
                  </p>
                  <label className="bd-payment">
                    Payment status{' '}
                    <select
                      value={form.paymentStatus}
                      onChange={(e) => set('paymentStatus', e.target.value as PaymentStatus)}
                    >
                      {payments.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  {isAdmin && (
                    <div className="bd-overrides">
                      <label className="bd-checkbox">
                        <input
                          type="checkbox"
                          checked={form.priceOverride ?? false}
                          onChange={(e) => {
                            set('priceOverride', e.target.checked);
                            if (e.target.checked)
                              setPrices({
                                exVat: quoted.exVat / 100,
                                vat: quoted.vat / 100,
                                total: quoted.total / 100,
                              });
                          }}
                        />{' '}
                        Override calculated price
                      </label>
                      {form.priceOverride && (
                        <div className="bd-override-prices">
                          {(['exVat', 'vat', 'total'] as const).map((key) => (
                            <label key={key}>
                              {key === 'exVat'
                                ? 'Ex VAT (£)'
                                : key === 'vat'
                                  ? 'VAT (£)'
                                  : 'Total (£)'}
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={prices[key]}
                                onChange={(e) =>
                                  setPrices((p) => ({ ...p, [key]: Number(e.target.value) }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      <label className="bd-checkbox">
                        <input
                          type="checkbox"
                          checked={form.conflictOverride ?? false}
                          onChange={(e) => set('conflictOverride', e.target.checked)}
                        />{' '}
                        Deliberately override conflicts
                      </label>
                      {(form.priceOverride || form.conflictOverride) && (
                        <label>
                          Override reason{' '}
                          <textarea
                            required
                            value={form.overrideReason}
                            onChange={(e) => set('overrideReason', e.target.value)}
                            placeholder="Required for the audit trail"
                          />{' '}
                        </label>
                      )}
                    </div>
                  )}
                  <div className="bd-times">
                    <p>
                      <span>Customer booking</span>
                      <strong>
                        {startTime}–{endTime}
                      </strong>
                    </p>
                    <p>
                      <span>Facility reserved</span>
                      <strong>{range(before, after)}</strong>
                    </p>
                    <p>
                      <span>Access validity</span>
                      <strong>{range(accessBefore, accessAfter)}</strong>
                    </p>
                  </div>
                  {editing && (
                    <p className="bd-hint">
                      Created by {initial?.createdBy}
                      <br />
                      {initial?.createdAt &&
                        new Date(initial.createdAt).toLocaleString('en-GB', {
                          timeZone: 'Europe/London',
                        })}
                      <br />
                      Last modified by {initial?.modifiedBy}
                      <br />
                      {initial?.modifiedAt &&
                        new Date(initial.modifiedAt).toLocaleString('en-GB', {
                          timeZone: 'Europe/London',
                        })}
                    </p>
                  )}
                </div>
              </aside>
            </div>
          </fieldset>
          <footer className="bd-footer">
            <span>
              <ShieldCheck size={15} /> Availability checked on save
            </span>
            <div>
              <button type="button" className="cal-secondary" disabled={busy} onClick={onClose}>
                {viewOnly ? 'Close' : 'Cancel'}
              </button>
              {!viewOnly && (
                <button className="cal-primary" disabled={busy} type="submit">
                  <PoundSterling size={16} style={{ display: 'none' }} />
                  {busy ? 'Checking & saving…' : editing ? 'Save changes' : 'Create booking'}
                </button>
              )}
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
