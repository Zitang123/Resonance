/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG charts expose equivalent textual data. */
/* oxlint-disable next/no-html-link-for-pages -- Auth redirects and history downloads require top-level navigation. */
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Download, Upload, AudioLines } from 'lucide-react';
import {
  Choice,
  Modal,
  dateLabel,
  download,
} from '@/components/resonance/shared';
import {
  calculateSignals,
  normalizeHistory,
  validateRecords,
} from '@/lib/karina/history';
import type {
  HistorySource,
  ListenRecord,
  ListeningSignals,
} from '@/lib/karina/types';
import { ListeningTerrain } from './listening-terrain';
import { api, useArchive } from './use-archive';
import { exportArchive } from './export-archive';
const labels: Record<HistorySource, string> = {
  lastfm: 'Last.fm',
  listenbrainz: 'ListenBrainz',
  'spotify-export': 'Spotify export',
};
const periods: [string, string][] = [
  ['7day', '7 days'],
  ['1month', '30 days'],
  ['3month', '90 days'],
  ['12month', 'Year'],
  ['overall', 'All history'],
];
function sampleRecords(): ListenRecord[] {
  const artists = [
      'aespa',
      'Nujabes',
      'Frank Ocean',
      'Sade',
      'Radiohead',
      'NewJeans',
      'The Marías',
    ],
    titles = [
      'Supernova',
      'Feather',
      'Pink + White',
      'Kiss of Life',
      'Weird Fishes',
      'Ditto',
      'No One Noticed',
    ];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const records: ListenRecord[] = [];
  for (let day = 0; day < 90; day++)
    for (let i = 0; i < 8 + ((day * 17) % 29); i++) {
      const a = (day * 3 + i * 5) % 7;
      records.push({
        id: `sample-${day}-${i}`,
        source: 'listenbrainz',
        title: titles[a],
        artist: artists[a],
        album: '',
        durationMs: null,
        playedAt: new Date(
          today.getTime() -
            day * 86400000 +
            ((i * 37 + day * 91) % 1440) * 60000,
        ).toISOString(),
      });
    }
  return records;
}
export function Listening({ onKarina }: { onKarina: () => void }) {
  const { status, error: connectionError, reload } = useArchive();
  const [exporting, setExporting] = useState(false);
  async function saveArchive() {
    setExporting(true);
    try {
      await exportArchive();
      setNotice('History exported.');
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        setNotice(
          'Export could not finish. Please retry; your archive is unchanged.',
        );
    } finally {
      setExporting(false);
    }
  }
  const [source, setSource] = useState<HistorySource>('lastfm'),
    [period, setPeriod] = useState('overall');
  const [sample, setSample] = useState(false),
    [signals, setSignals] = useState<ListeningSignals | null>(null),
    [recent, setRecent] = useState<ListenRecord[]>([]);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState('listenbrainz'),
    [pending, setPending] = useState<ListenRecord[] | null>(null),
    [fileNote, setFileNote] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const samples = useMemo(() => sampleRecords(), []);
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Synchronize an asynchronous external archive and its loading state.
    let current = true;
    // oxlint-disable-next-line react/react-compiler -- Reset request state when an external archive selection changes.
    setError('');
    if (sample) {
      const count = { '7day': 7, '1month': 30, '3month': 90, '12month': 365 }[
        period
      ];
      const from = count
        ? new Date(
            new Date().setUTCHours(0, 0, 0, 0) - (count - 1) * 86400000,
          ).toISOString()
        : undefined;
      setSignals(
        calculateSignals(samples, {
          source: 'listenbrainz',
          timezone: 'UTC',
          from,
          to: new Date().toISOString(),
        }),
      );
      setRecent(
        samples
          .filter((r) => !from || r.playedAt >= from)
          .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
          .slice(0, 12),
      );
      setLoading(false);
      return;
    }
    setSignals(null);
    setRecent([]);
    if (!status?.signedIn) return;
    setLoading(true);
    void api<{ signals: ListeningSignals; recent: ListenRecord[] }>(
      `/api/karina?view=history&source=${source}&period=${period}`,
    )
      .then((result) => {
        if (current) {
          setSignals(result.signals);
          setRecent(result.recent);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [source, period, sample, samples, status]);
  async function readFile(chosen: File) {
    setBusy(true);
    setPending(null);
    setConsent(false);
    setFileNote('');
    try {
      if (chosen.size > 80_000_000)
        throw Error('Split large exports into JSON files smaller than 80 MB.');
      const input = JSON.parse(await chosen.text());
      if (importSource === 'resonance') {
        if (
          input.format !== 'resonance-history-v1' ||
          !Array.isArray(input.records)
        )
          throw Error('Choose a Resonance history backup.');
        const parsed: ListenRecord[] = [];
        for (let i = 0; i < input.records.length; i += 1000)
          parsed.push(...validateRecords(input.records.slice(i, i + 1000)));
        if (parsed.some((r) => r.source === 'spotify-export'))
          throw Error('Spotify archive analytics are not enabled.');
        parsed.sort((a, b) => a.playedAt.localeCompare(b.playedAt));
        setPending(parsed);
        setFileNote(
          `${parsed.length.toLocaleString()} records ready to restore.`,
        );
      } else {
        const result = await normalizeHistory(
          input,
          importSource as HistorySource,
        );
        setPending(result.records);
        setFileNote(
          `${result.records.length.toLocaleString()} records ready · ${result.skipped.toLocaleString()} skipped. ${result.warnings.join(' ')}`,
        );
      }
    } catch (e) {
      setFileNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importRecords() {
    if (!pending || !consent) return;
    setBusy(true);
    try {
      let inserted = 0;
      for (let i = 0; i < pending.length; i += 200) {
        const result = await api<{ inserted: number }>('/api/karina', {
          action: 'import',
          records: pending.slice(i, i + 200),
        });
        inserted += result.inserted;
        setFileNote(
          `Saved ${Math.min(i + 200, pending.length).toLocaleString()} of ${pending.length.toLocaleString()} records…`,
        );
      }
      setSource(pending[0]?.source || 'listenbrainz');
      setSample(false);
      setImportOpen(false);
      setPending(null);
      setNotice(
        `${inserted.toLocaleString()} new listens saved. Repeated records were skipped.`,
      );
      await reload();
    } catch (e) {
      setFileNote(
        `${(e as Error).message} Already saved batches are safe; retrying will not duplicate them.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const data = signals;
  const count = data?.count || 0;
  return (
    <div className="listening-space" data-has-history={count > 0}>
      <div className="listening-intro">
        <p className="eyebrow">A record of what stays with you</p>
        <h2>
          Your music.
          <br />
          <em>Another dimension.</em>
        </h2>
        <p>
          Follow the hours, artists and quiet repetitions that shape your
          listening.
        </p>
        <div className="button-row">
          <button className="button primary" onClick={onKarina}>
            Connect listening <ArrowUpRight size={16} />
          </button>
          <button
            className="button"
            onClick={() => {
              setImportOpen(true);
              setFileNote('');
            }}
          >
            Import history <Upload size={16} />
          </button>
          <button className="text-button" onClick={() => setSample((s) => !s)}>
            {sample ? 'Back to my history' : 'Explore sample'}
          </button>
        </div>
      </div>
      {(connectionError || error) && (
        <p className="error-message" role="alert">
          {error || connectionError}
        </p>
      )}
      {notice && <output>{notice}</output>}
      {!sample && source === 'lastfm' && status?.sync && (
        <p className="chart-note">
          {status.sync.phase === 'backfill'
            ? `History is still importing. Next page: ${status.sync.page}. These charts cover records received so far.`
            : 'Charts cover the history received so far; new records appear after sync.'}
        </p>
      )}
      <div className="listening-toolbar">
        <div>
          <span className={`archive-badge ${sample ? 'sample' : ''}`}>
            {sample ? 'Sample · fictional listening' : 'Your listening archive'}
          </span>
          {!sample && (
            <Choice
              label="History source"
              value={source}
              onChange={(v) => setSource(v as HistorySource)}
              options={[
                ['lastfm', 'Last.fm'],
                ['listenbrainz', 'ListenBrainz'],
              ]}
            />
          )}
        </div>
        <Choice
          label="Listening period"
          value={period}
          onChange={setPeriod}
          options={periods}
        />
      </div>
      {loading ? (
        <output>Opening your listening archive…</output>
      ) : !count ? (
        <div className="archive-empty">
          <AudioLines size={32} />
          <h3>Your first listen starts the picture.</h3>
          <p>
            Build your Resonance archive from recorded listening. Set up a
            Spotify history bridge, or import an existing history export.
          </p>
          <button className="button" onClick={() => setSample(true)}>
            See the sample charts
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="listening-metrics">
              <div>
                <span>Recorded listens</span>
                <strong>{count.toLocaleString()}</strong>
              </div>
              <div>
                <span>Artists</span>
                <strong>{data.uniqueArtists.toLocaleString()}</strong>
              </div>
              <div>
                <span>Tracks</span>
                <strong>{data.uniqueTracks.toLocaleString()}</strong>
              </div>
              <div>
                <span>Active days</span>
                <strong>{data.activeDays.toLocaleString()}</strong>
              </div>
            </div>
            <section className="terrain-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">01 / Rhythm</p>
                  <h3>A week, in relief.</h3>
                </div>
                <p>
                  Hour × weekday × listens
                  <br />
                  All times UTC
                </p>
              </div>
              <ListeningTerrain cells={data.weekHours} />
            </section>
            <div className="listening-columns">
              <section className="trend-section">
                <p className="eyebrow">02 / In time</p>
                <h3>The days you pressed play.</h3>
                <Trend daily={data.daily} />
                <p className="chart-note">
                  {data.coverage.first &&
                    dateLabel(data.coverage.first.slice(0, 10))}{' '}
                  —{' '}
                  {data.coverage.last &&
                    dateLabel(data.coverage.last.slice(0, 10))}{' '}
                  · recorded coverage
                </p>
              </section>
              <section className="ranks-section">
                <p className="eyebrow">03 / On repeat</p>
                <h3>The artists you return to.</h3>
                <ol className="artist-ranking">
                  {data.topArtists.slice(0, 7).map((artist, i) => (
                    <li key={artist.name}>
                      <span className="rank-number">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <span>{artist.name}</span>
                        <i
                          style={{
                            width: `${(artist.count / data.topArtists[0].count) * 100}%`,
                          }}
                        />
                      </div>
                      <strong>{artist.count.toLocaleString()}</strong>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <div className="listening-models">
              <div>
                <span>Repetition</span>
                <strong>
                  {(data.repeatShare * 100).toFixed(1)}
                  <small>%</small>
                </strong>
                <p>
                  Listens beyond the first play of each track in this period.
                </p>
              </div>
              <div>
                <span>Artist diversity</span>
                <strong>{data.effectiveArtists.toFixed(1)}</strong>
                <p>
                  The number of equally played artists that would give the same
                  diversity. Based on Shannon entropy:{' '}
                  {data.entropyBits.toFixed(2)} bits.
                </p>
              </div>
              <div>
                <span>Longest streak</span>
                <strong>
                  {data.longestStreak}
                  <small>{data.longestStreak === 1 ? ' day' : ' days'}</small>
                </strong>
                <p>
                  Consecutive UTC days with recorded listens. Missing history
                  can interrupt a streak.
                </p>
              </div>
            </div>
            <section className="recent-listens">
              <div className="section-heading">
                <h3>Recently recorded.</h3>
                <span>{sample ? 'Sample history' : labels[source]}</span>
              </div>
              <ol>
                {recent.slice(0, 12).map((r) => (
                  <li key={r.id}>
                    <AudioLines size={15} />
                    <span>
                      <strong>{r.title}</strong>
                      <small>{r.artist}</small>
                    </span>
                    <time dateTime={r.playedAt}>
                      {new Date(r.playedAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'UTC',
                      })}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
            <p className="chart-note">
              {sample
                ? 'Fictional sample records.'
                : `Source: ${labels[source]}.`}{' '}
              Sources are counted separately to avoid counting overlapping
              histories twice. Listening time is{' '}
              {data.totalDurationMs === null
                ? 'unknown; this source does not record actual time played'
                : `${Math.round(data.totalDurationMs / 60000).toLocaleString()} minutes across ${data.knownDurationRecords.toLocaleString()} records with duration`}
              .
            </p>
            <div className="button-row">
              <button
                className="button"
                onClick={() =>
                  download(
                    'resonance-listening-chart.svg',
                    chartSvg(data, sample ? 'Sample history' : labels[source]),
                    'image/svg+xml',
                  )
                }
              >
                <Download size={16} /> Download chart
              </button>
              {!sample && (
                <button
                  className="button"
                  disabled={exporting}
                  onClick={() => void saveArchive()}
                >
                  {exporting ? 'Exporting…' : 'Export my history'}
                </button>
              )}
            </div>
          </>
        )
      )}
      <Modal
        open={importOpen}
        onClose={() => !busy && setImportOpen(false)}
        title="Bring your history."
        description="Choose an export, review the records, then save them to your private account."
      >
        <label>
          Export format
          <Choice
            label="Export format"
            value={importSource}
            onChange={(v) => {
              setImportSource(v);
              setPending(null);
              setFileNote('');
            }}
            options={[
              ['listenbrainz', 'ListenBrainz JSON'],
              ['lastfm', 'Last.fm JSON'],
              ['resonance', 'Resonance backup'],
            ]}
          />
        </label>
        <p>
          Original files stay on your device. Only track, artist, album,
          timestamp, source and any recorded duration are uploaded. Location and
          device information are discarded.
        </p>
        <input
          ref={file}
          aria-label="History JSON file"
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
            e.target.value = '';
          }}
        />
        {fileNote && <output>{fileNote}</output>}
        {pending && pending.length > 0 && (
          <>
            <p>
              First: {dateLabel(pending[0].playedAt.slice(0, 10))} · Last:{' '}
              {dateLabel(pending.at(-1)!.playedAt.slice(0, 10))}
            </p>
            <label className="consent-line">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{' '}
              This is my history, and I want to save it to my Resonance account.
            </label>
          </>
        )}
        {!status?.signedIn ? (
          <a
            className="button primary"
            href="/signin-with-chatgpt?return_to=/?space=Listening"
          >
            Sign in to save history
          </a>
        ) : (
          <button
            className="button primary"
            disabled={!pending?.length || !consent || busy}
            onClick={() => void importRecords()}
          >
            {busy ? 'Saving…' : 'Save to my archive'}
          </button>
        )}
        <p className="chart-note">
          Spotify exports need a separate permission review before analytics can
          be enabled here. A Spotify connection alone cannot recover a lifetime
          history.
        </p>
      </Modal>
    </div>
  );
}
function Trend({ daily }: { daily: { date: string; count: number }[] }) {
  const first = Date.parse(daily[0].date),
    last = Date.parse(daily.at(-1)!.date),
    max = Math.max(...daily.map((d) => d.count));
  const points = daily
    .map(
      (d) =>
        `${10 + ((Date.parse(d.date) - first) / Math.max(86400000, last - first)) * 580},${150 - (d.count / max) * 120}`,
    )
    .join(' ');
  return (
    <svg
      className="listening-trend"
      viewBox="0 0 600 180"
      role="img"
      aria-label={`Daily listening trend: ${daily.length} active days; peak ${max} recorded listens in one day.`}
    >
      <line x1="10" x2="590" y1="150" y2="150" stroke="#414a43" />
      <line
        x1="10"
        x2="590"
        y1="30"
        y2="30"
        stroke="#303832"
        strokeDasharray="3 6"
      />
      <text x="10" y="20" fill="#a5aaa4" fontSize="11">
        {max} listens
      </text>
      <polyline
        points={points}
        fill="none"
        stroke="#b5cddd"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {daily.length === 1 && <circle cx="10" cy="30" r="4" fill="#b5cddd" />}
      <text x="10" y="176" fill="#a5aaa4" fontSize="11">
        {daily[0].date}
      </text>
      <text x="590" y="176" textAnchor="end" fill="#a5aaa4" fontSize="11">
        {daily.at(-1)!.date}
      </text>
    </svg>
  );
}
function chartSvg(data: ListeningSignals, source: string) {
  const escape = (s: string) =>
    s.replace(
      /[<>&"']/g,
      (c) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;',
        })[c]!,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840" viewBox="0 0 1200 840"><rect width="1200" height="840" fill="#151817"/><g fill="#eeece5" font-family="Arial"><text x="80" y="90" font-size="24">resonance / ${escape(source)}</text><text x="80" y="185" font-size="60">The artists you return to.</text>${data.topArtists
    .slice(0, 7)
    .map(
      (a, i) =>
        `<text x="80" y="${265 + i * 65}" font-size="24">${i + 1}. ${escape(a.name.slice(0, 45))}</text><rect x="650" y="${246 + i * 65}" width="${(350 * a.count) / data.topArtists[0].count}" height="22" fill="#dab492"/><text x="1100" y="${265 + i * 65}" font-size="22" text-anchor="end">${a.count}</text>`,
    )
    .join(
      '',
    )}<text x="80" y="780" font-size="18">${data.count.toLocaleString()} recorded listens · ${data.coverage.first?.slice(0, 10)} to ${data.coverage.last?.slice(0, 10)} · UTC</text></g></svg>`;
}
