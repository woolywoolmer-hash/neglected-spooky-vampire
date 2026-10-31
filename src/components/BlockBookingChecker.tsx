'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarCheck, CheckCircle2, ShieldAlert } from 'lucide-react';
import { londonInputToIso } from '@/lib/booking-engine';
import type { AppData, BookingInput, BookingType } from '@/lib/types';
import './block-booking.css';

type PreviewRow = {
  start: string;
  end: string;
  date: string;
  conflicts: { bookingId: string; title: string; start: string; end: string; facilityId: string; kind: string }[];
  schoolBreak: { id: string; name: string; kind: string; start: string; end: string } | null;
  schoolCalendarCoverageWarning: boolean;
};

type Preview = {
  occurrences: PreviewRow[];
  summary: {
    total: number;
    clear: number;
    conflicts: number;
    schoolBreakDates: number;
    outsidePublishedSchoolCalendar: number;
  };
};

const weekdays = [
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
  ['Sun', 0],
] as const;

const prettyDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/London',
  });

const prettyTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });

function todayLondon() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

export default function BlockBookingChecker() {
  const [data, setData] = useState<AppData | null>(null);
  const [facilityId, setFacilityId] = useState('');
  const [title, setTitle] = useState('');
  const [bookingType, setBookingType] = useState<BookingType>('External Hirer');
  const [startDate, setStartDate] = useState(todayLondon());
  const [finishDate, setFinishDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');
  const [days, setDays] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/data', { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Unable to load facilities.');
        return json as AppData;
      })
      .then((json) => {
        setData(json);
        setFacilityId(json.facilities.find((facility) => facility.active)?.id ?? '');
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load facilities.'));
  }, []);

  const facility = useMemo(
    () => data?.facilities.find((item) => item.id === facilityId),
    [data, facilityId]
  );

  function buildInput(): BookingInput {
    if (!facilityId) throw new Error('Choose a facility.');
    if (!title.trim()) throw new Error('Enter a booking name or purpose.');
    if (!finishDate) throw new Error('Choose a finish date for the block booking.');
    if (finishDate < startDate) throw new Error('Finish date must be after the start date.');
    if (!days.length) throw new Error('Choose at least one day of the week.');

    const start = londonInputToIso(`${startDate}T${startTime}`);
    const end = londonInputToIso(`${startDate}T${endTime}`);
    if (Date.parse(end) <= Date.parse(start))
      throw new Error('End time must be after start time for each booking.');

    return {
      facilityId,
      title: title.trim(),
      start,
      end,
      type: bookingType,
      status: bookingType === 'School' ? 'Awaiting Approval' : 'Confirmed',
      paymentStatus: bookingType === 'School' ? 'Not required' : 'Unpaid',
      recurrence: {
        frequency: 'weekdays',
        interval: 1,
        weekdays: days,
        until: finishDate,
        count: 0,
      },
    };
  }

  async function checkAvailability() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const input = buildInput();
      const response = await fetch('/api/bookings/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: input }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to check this booking range.');
      setPreview(json as Preview);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : 'Unable to check this booking range.');
    } finally {
      setBusy(false);
    }
  }

  async function saveBlock() {
    setBusy(true);
    setError('');
    try {
      const input = buildInput();
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: input }),
      });
      const json = await response.json();
      if (!response.ok) {
        const clashes = Array.isArray(json.conflicts)
          ? ` ${json.conflicts.length} conflicting booking(s) were found.`
          : '';
        throw new Error(`${json.error || 'Unable to save the block booking.'}${clashes}`);
      }
      setSaved(true);
      await checkAvailability();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the block booking.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="bb-page">
        <div className="bb-shell"><p>{error || 'Loading Sport Regis…'}</p></div>
      </main>
    );
  }

  return (
    <main className="bb-page">
      <div className="bb-shell">
        <div className="bb-topline">
          <Link href="/" className="bb-back"><ArrowLeft size={17} /> Back to calendar</Link>
          <span>SPORT REGIS</span>
        </div>

        <header className="bb-header">
          <div>
            <p className="bb-kicker">BLOCK BOOKING CHECKER</p>
            <h1>Check the whole run before you book it.</h1>
            <p>Pick the dates once. We’ll check every occurrence against existing bookings, closures and school breaks.</p>
          </div>
          <CalendarCheck size={46} />
        </header>

        <section className="bb-card bb-form">
          <div className="bb-grid two">
            <label>Booking name / purpose
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Shaftesbury Hockey Club" />
            </label>
            <label>Facility
              <select value={facilityId} onChange={(event) => setFacilityId(event.target.value)}>
                {data.facilities.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <div className="bb-grid four">
            <label>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label>Finish date<input type="date" min={startDate} value={finishDate} onChange={(event) => setFinishDate(event.target.value)} /></label>
            <label>Start time<input type="time" step="300" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
            <label>End time<input type="time" step="300" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
          </div>

          <div className="bb-grid two">
            <fieldset>
              <legend>Days required</legend>
              <div className="bb-days">
                {weekdays.map(([label, value]) => (
                  <button key={label} type="button" className={days.includes(value) ? 'selected' : ''}
                    onClick={() => setDays((current) => current.includes(value) ? current.filter((day) => day !== value) : [...current, value])}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>Booking type
              <select value={bookingType} onChange={(event) => setBookingType(event.target.value as BookingType)}>
                <option>External Hirer</option><option>Sports Centre</option><option>School</option><option>Complimentary</option>
              </select>
            </label>
          </div>

          <div className="bb-actions">
            <button className="bb-primary" type="button" disabled={busy} onClick={checkAvailability}>{busy ? 'Checking…' : 'Check all dates'}</button>
            <span>{facility?.name} · 5-minute time flexibility</span>
          </div>
          {error && <div className="bb-error"><AlertTriangle size={18} /> {error}</div>}
          {saved && <div className="bb-success"><CheckCircle2 size={18} /> Block booking saved.</div>}
        </section>

        {preview && (
          <>
            <section className="bb-summary-grid">
              <div className="bb-stat"><strong>{preview.summary.total}</strong><span>dates checked</span></div>
              <div className="bb-stat good"><strong>{preview.summary.clear}</strong><span>clear of clashes</span></div>
              <div className="bb-stat bad"><strong>{preview.summary.conflicts}</strong><span>clashing dates</span></div>
              <div className="bb-stat holiday"><strong>{preview.summary.schoolBreakDates}</strong><span>school-break dates</span></div>
            </section>

            {preview.summary.outsidePublishedSchoolCalendar > 0 && (
              <div className="bb-calendar-note"><ShieldAlert size={18} /> Some dates fall outside the currently loaded Port Regis published term calendar. They are not assumed to be term time or holiday.</div>
            )}

            <section className="bb-card">
              <div className="bb-results-head">
                <div><p className="bb-kicker">DATE-BY-DATE CHECK</p><h2>Nothing hidden</h2></div>
                <button className="bb-primary" type="button" disabled={busy || preview.summary.conflicts > 0} onClick={saveBlock}>
                  {preview.summary.conflicts > 0 ? 'Resolve clashes before saving' : 'Save this block booking'}
                </button>
              </div>
              <div className="bb-results">
                {preview.occurrences.map((row) => (
                  <div className={`bb-row ${row.conflicts.length ? 'has-conflict' : row.schoolBreak ? 'has-holiday' : 'is-clear'}`} key={row.start}>
                    <div className="bb-date"><strong>{prettyDate(row.date)}</strong><span>{prettyTime(row.start)}–{prettyTime(row.end)}</span></div>
                    <div className="bb-status">
                      {row.conflicts.length ? (
                        <><span className="bb-pill conflict">CLASH</span><span>{row.conflicts.map((item) => item.title).join(', ')}</span></>
                      ) : (
                        <><span className="bb-pill clear">CLEAR</span><span>No existing booking conflict</span></>
                      )}
                    </div>
                    <div className="bb-holiday">
                      {row.schoolBreak ? <><span className="bb-pill holiday">{row.schoolBreak.kind.toUpperCase()}</span><span>{row.schoolBreak.name}</span></> : <span className="bb-muted">Normal school-calendar date</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
