'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  Plus,
  SlidersHorizontal,
  X,
  LockKeyhole,
} from 'lucide-react';
import type { AppData, Booking, Facility } from '@/lib/types';
import BookingDialog, { londonDate, londonTime, londonTimestamp } from './BookingDialog';
import './calendar.css';

type View = 'Day' | 'Week' | 'Month' | 'Year';
type Props = { data: AppData; onRefresh: () => Promise<void>; onNotice: (message: string) => void };
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const monday = (date: string) =>
  addDays(date, -(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7);
const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    ...options,
  });
const clockMinutes = (value: string) => {
  const [h, m] = londonTime(value).split(':').map(Number);
  return h * 60 + m;
};
const padded = (value: number) => String(value).padStart(2, '0');
const eventClass = (booking: Booking) =>
  booking.status === 'Cancelled'
    ? 'cancelled'
    : booking.type === 'Maintenance'
      ? 'closure'
      : booking.type === 'School'
        ? 'internal'
        : booking.status === 'Provisional' ||
            booking.status === 'Enquiry' ||
            booking.status === 'Awaiting Approval'
          ? 'provisional'
          : 'confirmed';
const labels: Record<string, string> = {
  confirmed: 'Confirmed',
  provisional: 'Provisional / enquiry',
  internal: 'Internal school',
  closure: 'Closure / maintenance',
};

export default function Calendar({ data, onRefresh, onNotice }: Props) {
  const today = londonDate();
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<View>('Week');
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [fullDay, setFullDay] = useState(false);
  const [dialog, setDialog] = useState<{
    initial: Partial<Booking> | null;
    date: string;
    facility: string;
  } | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);
  const activeFacilities = data.facilities.filter((f) => f.active);
  const shownFacilities = activeFacilities.filter(
    (f) => !selectedFacilities.length || selectedFacilities.includes(f.id)
  );
  const chosenIds = new Set(shownFacilities.map((f) => f.id));
  const bookings = data.bookings.filter(
    (b) => chosenIds.has(b.facilityId) && (showCancelled || b.status !== 'Cancelled')
  );
  const closures = data.closures.filter((c) => chosenIds.has(c.facilityId));
  const weekStart = monday(anchor);
  const days =
    view === 'Day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const periodStart =
    view === 'Day'
      ? anchor
      : view === 'Week'
        ? weekStart
        : view === 'Month'
          ? `${anchor.slice(0, 7)}-01`
          : `${anchor.slice(0, 4)}-01-01`;
  const periodEnd =
    view === 'Day'
      ? anchor
      : view === 'Week'
        ? addDays(weekStart, 6)
        : view === 'Month'
          ? new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0, 12))
              .toISOString()
              .slice(0, 10)
          : `${anchor.slice(0, 4)}-12-31`;
  const periodBookings = bookings.filter(
    (b) => londonDate(b.start) <= periodEnd && londonDate(b.end) >= periodStart
  );
  const confirmedCount = periodBookings.filter((b) => b.status === 'Confirmed').length;
  const tentativeCount = periodBookings.filter((b) =>
    ['Provisional', 'Awaiting Approval', 'Enquiry'].includes(b.status)
  ).length;
  const facilitiesById = useMemo(
    () => new Map(data.facilities.map((f) => [f.id, f])),
    [data.facilities]
  );
  const canBook = data.actor.role !== 'readonly';
  const canEdit = (booking: Booking) =>
    data.actor.role === 'administrator' ||
    data.actor.role === 'manager' ||
    (data.actor.role === 'staff' &&
      (booking.createdById ?? booking.createdBy) === data.actor.id &&
      booking.type === 'School');
  const closeDialog = useCallback(() => setDialog(null), []);

  function newBooking(
    date = anchor,
    facility = shownFacilities[0]?.id ?? activeFacilities[0]?.id,
    minute = 9 * 60
  ) {
    if (!canBook) {
      onNotice('Your account has read-only access to availability.');
      return;
    }
    if (!facility) {
      onNotice('An administrator needs to add an active facility first.');
      return;
    }
    try {
      const start = londonTimestamp(
        date,
        `${padded(Math.floor(minute / 60))}:${padded(minute % 60)}`
      );
      const end = new Date(Date.parse(start) + 60 * 60000).toISOString();
      setDialog({ initial: { start, end }, date, facility });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Choose another time.');
    }
  }
  function openBooking(booking: Booking) {
    if (canEdit(booking))
      setDialog({
        initial: booking,
        date: londonDate(booking.start),
        facility: booking.facilityId,
      });
    else setDetail(booking);
  }
  function move(direction: number) {
    if (view === 'Day' || view === 'Week')
      setAnchor(addDays(anchor, direction * (view === 'Day' ? 1 : 7)));
    else {
      const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
      if (view === 'Month') d.setUTCMonth(d.getUTCMonth() + direction);
      else d.setUTCFullYear(d.getUTCFullYear() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    }
  }
  function toggleFacility(id: string) {
    setSelectedFacilities((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }
  function eventsOn(date: string) {
    return bookings
      .filter((b) => londonDate(b.start) <= date && londonDate(b.end) >= date)
      .sort((a, b) => a.start.localeCompare(b.start));
  }
  const title =
    view === 'Year'
      ? anchor.slice(0, 4)
      : view === 'Month'
        ? fmt(anchor, { month: 'long', year: 'numeric' })
        : view === 'Day'
          ? fmt(anchor, { weekday: 'long', day: 'numeric', month: 'long' })
          : `${fmt(weekStart, { day: 'numeric', month: 'short' })} – ${fmt(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  function Event({ booking, compact = false }: { booking: Booking; compact?: boolean }) {
    const facility = facilitiesById.get(booking.facilityId);
    return (
      <button
        type="button"
        className={`cal-event ${eventClass(booking)} ${compact ? 'compact' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          openBooking(booking);
        }}
        title={`${londonTime(booking.start)}–${londonTime(booking.end)} · ${booking.title} · ${facility?.name} · ${booking.status}`}
      >
        <span className="cal-event-time">
          {londonTime(booking.start)}–{londonTime(booking.end)}
          {booking.status === 'Provisional' && <span className="cal-tentative-dot" />}
        </span>
        <strong>{booking.title}</strong>
        <span className="cal-event-facility">
          <i style={{ background: facility?.color ?? '#507564' }} />
          {facility?.name}
        </span>
        {!compact && (
          <span className="cal-event-customer">{booking.organisation || booking.type}</span>
        )}
      </button>
    );
  }

  function TimeGrid() {
    const relevant = bookings.filter((b) =>
      days.some((day) => londonDate(b.start) <= day && londonDate(b.end) >= day)
    );
    let firstHour = fullDay ? 0 : 7,
      lastHour = fullDay ? 24 : 22;
    for (const b of relevant) {
      firstHour = Math.min(firstHour, Math.floor(clockMinutes(b.start) / 60));
      lastHour = Math.max(lastHour, Math.ceil(clockMinutes(b.end) / 60));
      if (londonDate(b.start) !== londonDate(b.end)) {
        firstHour = 0;
        lastHour = 24;
      }
    }
    firstHour = Math.max(0, firstHour);
    lastHour = Math.min(24, lastHour);
    const hourHeight = 64;
    const columns =
      view === 'Day'
        ? shownFacilities.map((f) => ({ date: anchor, facility: f }))
        : days.map((date) => ({ date, facility: undefined as Facility | undefined }));
    const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
    const minutePosition = (time: string, date: string, end = false) =>
      londonDate(time) < date
        ? firstHour * 60
        : londonDate(time) > date
          ? lastHour * 60
          : end && londonDate(time) === date && clockMinutes(time) === 0
            ? 0
            : clockMinutes(time);
    return (
      <div className="cal-grid-scroll">
        <div
          className={`cal-time-grid ${view === 'Day' ? 'daily' : ''}`}
          style={{
            gridTemplateColumns: `60px repeat(${columns.length}, minmax(${view === 'Day' ? '165' : '125'}px, 1fr))`,
          }}
        >
          <div className="cal-timezone">
            {
              new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' })
                .formatToParts(new Date(`${anchor}T12:00:00Z`))
                .find((p) => p.type === 'timeZoneName')?.value
            }
          </div>
          {columns.map(({ date, facility }, i) => (
            <div
              key={facility?.id ?? date}
              className={`cal-day-heading ${date === today ? 'is-today' : ''} ${i > 4 && view === 'Week' ? 'weekend' : ''}`}
            >
              {facility ? (
                <>
                  <i className="cal-resource-dot" style={{ background: facility.color }} />
                  <strong className="cal-resource-name">{facility.name}</strong>
                  <span>
                    {eventsOn(date).filter((b) => b.facilityId === facility.id).length} bookings
                  </span>
                </>
              ) : (
                <>
                  <span>{fmt(date, { weekday: 'short' })}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAnchor(date);
                      setView('Day');
                    }}
                    aria-label={`View ${date}`}
                  >
                    {Number(date.slice(-2))}
                  </button>
                  <small>{eventsOn(date).length} bookings</small>
                </>
              )}
            </div>
          ))}
          <div className="cal-hours" style={{ height: hours.length * hourHeight }}>
            {hours.map((hour) => (
              <div key={hour} style={{ height: hourHeight }}>
                <span>{padded(hour)}:00</span>
              </div>
            ))}
          </div>
          {columns.map(({ date, facility }, column) => {
            const dayBookings = eventsOn(date).filter(
              (b) => !facility || b.facilityId === facility.id
            );
            const positions: { booking: Booking; lane: number; start: number; end: number }[] = [];
            const laneEnds: number[] = [];
            for (const booking of dayBookings) {
              const start = minutePosition(booking.start, date),
                end = minutePosition(booking.end, date, true);
              let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
              if (lane < 0) lane = laneEnds.length;
              laneEnds[lane] = end;
              positions.push({ booking, lane, start, end });
            }
            const lanes = Math.max(1, laneEnds.length);
            return (
              <div
                key={facility?.id ?? date}
                className={`cal-day-column ${date === today ? 'is-today' : ''} ${column > 4 && view === 'Week' ? 'weekend' : ''}`}
                style={{
                  height: hours.length * hourHeight,
                  backgroundSize: `100% ${hourHeight}px`,
                }}
                role="button"
                tabIndex={0}
                aria-label={`Create booking on ${date}${facility ? ` at ${facility.name}` : ''}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget)
                    newBooking(date, facility?.id);
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mins = Math.min(
                    lastHour * 60 - 5,
                    Math.max(
                      firstHour * 60,
                      Math.round(
                        (((e.clientY - rect.top) / hourHeight) * 60 + firstHour * 60) / 5
                      ) * 5
                    )
                  );
                  newBooking(date, facility?.id, mins);
                }}
              >
                {closures
                  .filter(
                    (c) =>
                      (!facility || facility.id === c.facilityId) &&
                      londonDate(c.start) <= date &&
                      londonDate(c.end) >= date
                  )
                  .map((c) => {
                    const start = Math.max(firstHour * 60, minutePosition(c.start, date)),
                      end = Math.min(lastHour * 60, minutePosition(c.end, date, true));
                    return end > start ? (
                      <button
                        type="button"
                        key={c.id}
                        className="cal-closure"
                        style={{
                          top: ((start - firstHour * 60) / 60) * hourHeight,
                          height: Math.max(23, ((end - start) / 60) * hourHeight),
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onNotice(
                            `${facilitiesById.get(c.facilityId)?.name}: ${c.reason}. ${c.notes || ''}`
                          );
                        }}
                      >
                        <LockKeyhole size={12} />
                        <strong>{c.reason}</strong>
                        <span>{facilitiesById.get(c.facilityId)?.name}</span>
                      </button>
                    ) : null;
                  })}
                {positions.map(({ booking, lane, start, end }) => {
                  const clippedStart = Math.max(start, firstHour * 60),
                    clippedEnd = Math.min(end, lastHour * 60);
                  return clippedEnd > clippedStart ? (
                    <div
                      key={booking.id}
                      className="cal-event-position"
                      style={{
                        top: ((clippedStart - firstHour * 60) / 60) * hourHeight + 2,
                        height: Math.max(29, ((clippedEnd - clippedStart) / 60) * hourHeight - 4),
                        left: `calc(${(lane / lanes) * 100}% + 3px)`,
                        width: `calc(${100 / lanes}% - 6px)`,
                      }}
                    >
                      <Event booking={booking} compact={end - start < 75 || lanes > 1} />
                    </div>
                  ) : null;
                })}
                {date === today &&
                  (() => {
                    const minutes = clockMinutes(new Date().toISOString());
                    return minutes >= firstHour * 60 && minutes < lastHour * 60 ? (
                      <div
                        className="cal-now"
                        style={{ top: ((minutes - firstHour * 60) / 60) * hourHeight }}
                      >
                        <i />
                      </div>
                    ) : null;
                  })()}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function MonthGrid({ month, small = false }: { month: string; small?: boolean }) {
    const first = `${month.slice(0, 7)}-01`,
      start = monday(first);
    const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(
      Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)
    ).getUTCDate();
    const monthDays = Array.from(
      { length: small ? 42 : Math.ceil((offset + daysInMonth) / 7) * 7 },
      (_, i) => addDays(start, i)
    );
    return (
      <div className={small ? 'cal-mini-month' : 'cal-month'}>
        {small && (
          <button
            className="cal-mini-title"
            type="button"
            onClick={() => {
              setAnchor(first);
              setView('Month');
            }}
          >
            {fmt(first, { month: 'long' })}
            <ArrowRight size={13} />
          </button>
        )}
        <div className="cal-month-weekdays">
          {dayNames.map((day) => (
            <span key={day}>{small ? day[0] : day}</span>
          ))}
        </div>
        <div className="cal-month-days">
          {monthDays.map((date) => {
            const dailyBookings = eventsOn(date);
            const closureCount = closures.filter(
              (c) => londonDate(c.start) <= date && londonDate(c.end) >= date
            ).length;
            return (
              <div
                key={date}
                className={`cal-month-day ${date.slice(0, 7) !== first.slice(0, 7) ? 'outside' : ''} ${date === today ? 'today' : ''} ${small && dailyBookings.length ? 'has-bookings' : ''}`}
                tabIndex={small ? undefined : 0}
                role={small ? undefined : 'button'}
                aria-label={small ? undefined : `Create booking on ${date}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) newBooking(date);
                }}
                onClick={() => {
                  if (small) {
                    setAnchor(date);
                    setView('Day');
                  } else newBooking(date);
                }}
              >
                {small ? (
                  <button
                    type="button"
                    title={`${date}: ${dailyBookings.length} bookings${closureCount ? `, ${closureCount} closures` : ''}`}
                    aria-label={`${date}: ${dailyBookings.length} bookings`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnchor(date);
                      setView('Day');
                    }}
                  >
                    {Number(date.slice(-2))}
                  </button>
                ) : (
                  <>
                    <button
                      className="cal-month-date"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnchor(date);
                        setView('Day');
                      }}
                    >
                      {Number(date.slice(-2))}
                    </button>
                    {closureCount > 0 && (
                      <div className="cal-month-closed">
                        <LockKeyhole size={11} />
                        {closureCount} closure{closureCount > 1 ? 's' : ''}
                      </div>
                    )}
                    {dailyBookings.slice(0, 3).map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        className={`cal-month-event ${eventClass(b)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openBooking(b);
                        }}
                      >
                        <span>{londonTime(b.start)}</span>
                        {b.title}
                      </button>
                    ))}
                    {dailyBookings.length > 3 && (
                      <button
                        type="button"
                        className="cal-more"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnchor(date);
                          setView('Day');
                        }}
                      >
                        +{dailyBookings.length - 3} more bookings
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="cal-root">
      <div className="cal-page-heading">
        <div>
          <div className="cal-kicker">
            <span /> THE WEEK, WELL PLANNED
          </div>
          <h1>
            Booking calendar<span>.</span>
          </h1>
          <p>A little organisation. A lot of possibility.</p>
        </div>
        <button
          className="cal-primary cal-new"
          type="button"
          onClick={() => newBooking()}
          disabled={!canBook}
        >
          <Plus size={17} /> New booking
        </button>
      </div>
      <div className="cal-summary-strip">
        <div>
          <span className="cal-summary-icon">
            <CalendarDays size={19} />
          </span>
          <p>
            <strong>{periodBookings.length}</strong>
            <span>Bookings this {view.toLowerCase()}</span>
          </p>
        </div>
        <div>
          <span className="cal-summary-icon green">
            <span className="cal-small-dot" />
          </span>
          <p>
            <strong>{confirmedCount}</strong>
            <span>Confirmed & ready</span>
          </p>
        </div>
        <div>
          <span className="cal-summary-icon amber">
            <Clock3 size={19} />
          </span>
          <p>
            <strong>{tentativeCount}</strong>
            <span>Need a little attention</span>
          </p>
        </div>
        <div>
          <span className="cal-summary-icon lilac">
            <SlidersHorizontal size={18} />
          </span>
          <p>
            <strong>
              {shownFacilities.length}
              <small> / {activeFacilities.length}</small>
            </strong>
            <span>Spaces in view</span>
          </p>
        </div>
      </div>
      <section className="cal-panel" aria-label="Facility booking calendar">
        <div className="cal-toolbar">
          <div className="cal-date-tools">
            <div className="cal-navigation">
              <button
                type="button"
                aria-label={`Previous ${view.toLowerCase()}`}
                onClick={() => move(-1)}
              >
                <ArrowLeft size={17} />
              </button>
              <button
                type="button"
                aria-label={`Next ${view.toLowerCase()}`}
                onClick={() => move(1)}
              >
                <ArrowRight size={17} />
              </button>
            </div>
            <h2>{title}</h2>
            <button type="button" className="cal-today-btn" onClick={() => setAnchor(today)}>
              Today
            </button>
            <label className="cal-date-picker" title="Go to date">
              <CalendarDays size={16} />
              <input
                type="date"
                aria-label="Go to date"
                value={anchor}
                onChange={(e) => {
                  if (e.target.value) setAnchor(e.target.value);
                }}
              />
            </label>
          </div>
          <div className="cal-view-switch" aria-label="Calendar view">
            {(['Day', 'Week', 'Month', 'Year'] as View[]).map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={view === option}
                className={view === option ? 'selected' : ''}
                onClick={() => setView(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="cal-filters">
          <div className="cal-resource-chips">
            <button
              type="button"
              className={`cal-chip ${selectedFacilities.length === 0 ? 'active' : ''}`}
              onClick={() => setSelectedFacilities([])}
            >
              All spaces <span>{activeFacilities.length}</span>
            </button>
            {activeFacilities.slice(0, 4).map((facility) => (
              <button
                type="button"
                key={facility.id}
                className={`cal-chip ${selectedFacilities.includes(facility.id) ? 'active' : ''}`}
                onClick={() => toggleFacility(facility.id)}
              >
                <i style={{ background: facility.color }} />
                {facility.name.replace('Jowett Sports Hall', 'Jowett Hall')}{' '}
              </button>
            ))}
            {activeFacilities.length > 4 && (
              <button
                type="button"
                className={`cal-chip ${filtersOpen ? 'active' : ''}`}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                More spaces <ChevronDown size={13} />
              </button>
            )}
          </div>
          <div className="cal-time-controls">
            {(view === 'Day' || view === 'Week') && (
              <button
                type="button"
                className={`cal-hours-toggle ${fullDay ? 'active' : ''}`}
                aria-pressed={fullDay}
                title="Show the complete day, from midnight to midnight"
                onClick={() => setFullDay(!fullDay)}
              >
                <Clock3 size={12} />
                {fullDay ? '24-hour view' : 'Show 24 hours'}
              </button>
            )}
            <span className="cal-timezone-note">Europe/London</span>
          </div>
        </div>
        {filtersOpen && (
          <div className="cal-filter-expanded">
            <div>
              {activeFacilities.map((facility) => (
                <label key={facility.id}>
                  <input
                    type="checkbox"
                    checked={!selectedFacilities.length || selectedFacilities.includes(facility.id)}
                    onChange={() => {
                      if (!selectedFacilities.length)
                        setSelectedFacilities(
                          activeFacilities.filter((f) => f.id !== facility.id).map((f) => f.id)
                        );
                      else toggleFacility(facility.id);
                    }}
                  />
                  <i style={{ background: facility.color }} />
                  {facility.name}
                </label>
              ))}
            </div>
            <label className="cal-cancelled-toggle">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(e) => setShowCancelled(e.target.checked)}
              />{' '}
              Show cancelled bookings
            </label>
          </div>
        )}
        {!shownFacilities.length ? (
          <div className="cal-empty">
            <CalendarDays size={28} />
            <h3>No active spaces to show</h3>
            <p>Add a facility in settings to start booking.</p>
          </div>
        ) : view === 'Week' || view === 'Day' ? (
          <TimeGrid />
        ) : view === 'Month' ? (
          <MonthGrid month={anchor} />
        ) : (
          <div className="cal-year-grid">
            {Array.from({ length: 12 }, (_, i) => (
              <MonthGrid key={i} month={`${anchor.slice(0, 4)}-${padded(i + 1)}-01`} small />
            ))}
          </div>
        )}
        <div className="cal-footer">
          <div className="cal-legend">
            <span className="cal-legend-available">
              <i /> Available
            </span>
            {Object.entries(labels).map(([key, label]) => (
              <span className={`cal-legend-${key}`} key={key}>
                <i />
                {label}
              </span>
            ))}
          </div>
          <p>Click a space to book. Click a booking to view details.</p>
        </div>
      </section>
      <div className="cal-bottom-note">
        <ShieldNote />
        <span>
          Time to set up. Time to play. Booking buffers and access windows are checked separately.
        </span>
      </div>
      {dialog && (
        <BookingDialog
          data={data}
          initial={dialog.initial}
          defaultDate={dialog.date}
          defaultFacility={dialog.facility}
          onClose={closeDialog}
          onSaved={onRefresh}
          onNotice={onNotice}
        />
      )}
      {detail && (
        <div
          className="bd-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <section
            className="cal-read-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-detail-title"
          >
            <button
              type="button"
              className="cal-icon-btn"
              aria-label="Close booking details"
              onClick={() => setDetail(null)}
            >
              <X size={19} />
            </button>
            <span className={`cal-detail-status ${eventClass(detail)}`}>{detail.status}</span>
            <h2 id="cal-detail-title">{detail.title}</h2>
            <p>{facilitiesById.get(detail.facilityId)?.name}</p>
            <dl>
              <div>
                <dt>Date</dt>
                <dd>
                  {fmt(londonDate(detail.start), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>
                  {londonTime(detail.start)}–{londonTime(detail.end)} Europe/London
                </dd>
              </div>
              <div>
                <dt>Organisation</dt>
                <dd>{detail.organisation || '—'}</dd>
              </div>
              <div>
                <dt>Booking type</dt>
                <dd>{detail.type}</dd>
              </div>
              <div>
                <dt>Attendees</dt>
                <dd>{detail.attendees}</dd>
              </div>
            </dl>
            <p className="bd-hint">
              Your role can view this booking. Contact the facilities team for changes.
            </p>
            <button className="cal-primary" type="button" onClick={() => setDetail(null)}>
              Done
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function ShieldNote() {
  return (
    <span className="cal-note-symbol">
      <LockKeyhole size={13} />
    </span>
  );
}
