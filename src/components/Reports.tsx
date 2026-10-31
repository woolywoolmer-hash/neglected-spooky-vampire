'use client';
import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  BarChart3,
  CalendarDays,
  Clock3,
  FileSpreadsheet,
  Info,
  PoundSterling,
} from 'lucide-react';
import type { AppData } from '@/lib/types';
import { buildReport, bookingReportCsv, toCsv } from '@/lib/reports';
import { isoToLondonInput } from '@/lib/booking-engine';
import './reports.css';
interface Props {
  data: AppData;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}
const money = (p: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100);
const num = (value: number) =>
  new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value);
export default function Reports({ data, onNotice }: Props) {
  const today = isoToLondonInput(new Date().toISOString()).slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [facilityId, setFacility] = useState(''),
    [tab, setTab] = useState<'facilities' | 'customers' | 'ledger'>('facilities');
  const result = useMemo(() => {
    try {
      return { report: buildReport(data, { from, to, facilityId }), error: '' };
    } catch (error) {
      return { report: null, error: error instanceof Error ? error.message : 'Invalid date range' };
    }
  }, [data, from, to, facilityId]);
  const report = result.report;
  function download(kind: 'ledger' | 'summary') {
    if (!report) return;
    const content =
      kind === 'ledger'
        ? bookingReportCsv(report, data.facilities)
        : toCsv(
            tab === 'customers'
              ? [
                  ['Customer', 'Bookings', 'Booked hours', 'Confirmed/completed gross GBP'],
                  ...report.customerRows.map((r) => [
                    r.name,
                    r.count,
                    r.hours.toFixed(2),
                    (r.total / 100).toFixed(2),
                  ]),
                ]
              : [
                  [
                    'Facility',
                    'Bookings',
                    'Booked hours',
                    'Utilised hours (07–22)',
                    'Capacity hours',
                    'Utilisation percent',
                    'Confirmed/completed gross GBP',
                  ],
                  ...report.facilityRows.map((r) => [
                    r.name,
                    r.count,
                    r.hours.toFixed(2),
                    r.utilisedHours.toFixed(2),
                    r.availableHours,
                    r.utilisation.toFixed(2),
                    (r.total / 100).toFixed(2),
                  ]),
                ]
          );
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fieldwork-${kind}-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onNotice('Report exported as CSV.');
  }
  return (
    <section className="rpt-page">
      <div className="rpt-heading">
        <div>
          <div className="rpt-eyebrow">INSIGHTS & EXPORTS</div>
          <h1>Reports</h1>
          <p>A clear view of how your facilities are being used.</p>
        </div>
        <button className="rpt-primary" disabled={!report} onClick={() => download('ledger')}>
          <ArrowDownToLine size={17} /> Export bookings
        </button>
      </div>
      <div className="rpt-filters">
        <label>
          <span>From</span>
          <input
            aria-label="Report from date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            aria-label="Report to date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="rpt-filter-grow">
          <span>Facility</span>
          <select
            aria-label="Report facility"
            value={facilityId}
            onChange={(e) => setFacility(e.target.value)}
          >
            <option value="">All facilities</option>
            {data.facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <span className="rpt-range">
          <CalendarDays size={16} />
          {report
            ? `${report.days} ${report.days === 1 ? 'day' : 'days'} selected`
            : 'Choose dates'}
        </span>
      </div>
      {result.error && (
        <div className="rpt-error" role="alert">
          {result.error}
        </div>
      )}
      {report && (
        <>
          <div className="rpt-stats">
            <article>
              <span>
                <CalendarDays size={17} /> Bookings
              </span>
              <strong>{report.bookingCount}</strong>
              <small>{report.cancelled} cancelled · enquiries excluded</small>
            </article>
            <article>
              <span>
                <Clock3 size={17} /> Facility utilisation
              </span>
              <strong>
                {num(report.utilisation)}
                <em>%</em>
              </strong>
              <small>
                {num(report.utilisedHours)} of {num(report.capacity)} area-hours
              </small>
            </article>
            <article>
              <span>
                <PoundSterling size={17} /> External hire value
              </span>
              <strong>{money(report.externalRevenue)}</strong>
              <small>Confirmed & completed, including VAT</small>
            </article>
            <article>
              <span>
                <FileSpreadsheet size={17} /> Unpaid booking value
              </span>
              <strong>{money(report.unpaid)}</strong>
              <small>
                {report.partPaidCount} part-paid booking{report.partPaidCount !== 1 ? 's' : ''} to
                reconcile
              </small>
            </article>
          </div>
          <div className="rpt-summary-grid">
            <article className="rpt-card">
              <div className="rpt-card-heading">
                <h2>Booking mix</h2>
                <span>{num(report.bookedHours)} booked hours</span>
              </div>
              <div className="rpt-mix-bar" aria-hidden="true">
                {report.internal > 0 && (
                  <i style={{ flex: report.internal, background: '#1e624d' }} />
                )}
                {report.external > 0 && (
                  <i style={{ flex: report.external, background: '#b6cb95' }} />
                )}
                {report.other > 0 && <i style={{ flex: report.other, background: '#dfc08a' }} />}
                {report.bookingCount === 0 && <i style={{ flex: 1, background: '#eceee8' }} />}
              </div>
              <div className="rpt-mix-labels">
                <span>
                  <b style={{ background: '#1e624d' }} />
                  School <strong>{report.internal}</strong>
                </span>
                <span>
                  <b style={{ background: '#b6cb95' }} />
                  External <strong>{report.external}</strong>
                </span>
                <span>
                  <b style={{ background: '#dfc08a' }} />
                  Other <strong>{report.other}</strong>
                </span>
              </div>
            </article>
            <article className="rpt-card">
              <div className="rpt-card-heading">
                <h2>Confirmed booking value</h2>
                <span>All booking types</span>
              </div>
              <div className="rpt-financial">
                <div>
                  <span>Excluding VAT</span>
                  <strong>{money(report.exVat)}</strong>
                </div>
                <div>
                  <span>VAT</span>
                  <strong>{money(report.vat)}</strong>
                </div>
                <div>
                  <span>Including VAT</span>
                  <strong>{money(report.total)}</strong>
                </div>
              </div>
            </article>
          </div>
          <div className="rpt-card rpt-detail">
            <div className="rpt-detail-head">
              <div className="rpt-tabs" role="tablist" aria-label="Report breakdown">
                <button
                  role="tab"
                  aria-selected={tab === 'facilities'}
                  className={tab === 'facilities' ? 'active' : ''}
                  onClick={() => setTab('facilities')}
                >
                  By facility
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'customers'}
                  className={tab === 'customers' ? 'active' : ''}
                  onClick={() => setTab('customers')}
                >
                  By customer
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'ledger'}
                  className={tab === 'ledger' ? 'active' : ''}
                  onClick={() => setTab('ledger')}
                >
                  Booking ledger
                </button>
              </div>
              <button
                className="rpt-export"
                onClick={() => download(tab === 'ledger' ? 'ledger' : 'summary')}
              >
                <ArrowDownToLine size={15} /> Export {tab === 'ledger' ? 'ledger' : 'summary'}
              </button>
            </div>
            <div className="rpt-table-wrap">
              {tab === 'facilities' ? (
                <table>
                  <thead>
                    <tr>
                      <th>Facility</th>
                      <th>Bookings</th>
                      <th>Booked hours</th>
                      <th>Utilisation</th>
                      <th>Gross value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.facilityRows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span
                            className="rpt-facility-dot"
                            style={{
                              background:
                                data.facilities.find((f) => f.id === r.id)?.color || '#367159',
                            }}
                          />
                          {r.name}
                        </td>
                        <td>{r.count}</td>
                        <td>{num(r.hours)} h</td>
                        <td>
                          <div className="rpt-utilisation">
                            <div>
                              <i style={{ width: `${Math.min(100, r.utilisation)}%` }} />
                            </div>
                            <span>{num(r.utilisation)}%</span>
                          </div>
                        </td>
                        <td>{money(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : tab === 'customers' ? (
                <table>
                  <thead>
                    <tr>
                      <th>Customer / organisation</th>
                      <th>Bookings</th>
                      <th>Booked hours</th>
                      <th>Gross value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.customerRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.count}</td>
                        <td>{num(r.hours)} h</td>
                        <td>{money(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Date / time</th>
                      <th>Facility</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.bookings.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.title}</strong>
                          <small>{b.organisation}</small>
                        </td>
                        <td>
                          {new Date(b.start).toLocaleDateString('en-GB', {
                            timeZone: 'Europe/London',
                          })}
                          <small>
                            {new Date(b.start).toLocaleTimeString('en-GB', {
                              timeZone: 'Europe/London',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            –{' '}
                            {new Date(b.end).toLocaleTimeString('en-GB', {
                              timeZone: 'Europe/London',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </td>
                        <td>{data.facilities.find((f) => f.id === b.facilityId)?.name}</td>
                        <td>
                          <span
                            className={`rpt-badge ${b.status === 'Cancelled' ? 'cancelled' : ''}`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td>{b.paymentStatus}</td>
                        <td>{money(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {((tab === 'customers' && report.customerRows.length === 0) ||
              (tab === 'ledger' && report.bookings.length === 0)) && (
              <div className="rpt-empty">
                <BarChart3 size={28} />
                <strong>No bookings in this period</strong>
                <span>Choose a different date range to see activity.</span>
              </div>
            )}
          </div>
          <div className="rpt-method">
            <Info size={17} />
            <div>
              <strong>How these figures are calculated</strong>
              <p>
                Booking counts and values use the booking’s start date in Europe/London. Values
                include confirmed and completed bookings; they are booking value, not recognised
                income or cash received. Unpaid value excludes part-paid bookings (
                {money(report.partPaid)} total booking value), whose remaining balance must be
                reconciled.
              </p>
              <p>
                Utilisation is reserved time within 07:00–22:00 each day, divided by 15 hours per
                facility per day. Enquiries and cancellations are excluded. Overlapping reservations
                are counted once; buffers and closures are excluded. Full Astro reservations occupy
                both half pitches; the combined figure counts those physical halves once. Capacity
                uses the current facility list, including inactive resources. Use the facility
                filter for individual resource figures.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
