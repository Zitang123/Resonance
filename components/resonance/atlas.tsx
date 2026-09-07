'use client';
import { useMemo, useState } from 'react';
import {
  Plus,
  ArrowUpRight,
  AlignLeft,
  Orbit,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Modal, Choice, Empty, dateLabel, localDate } from './shared';
import { stats, localDay, id } from '@/lib/resonance/domain';
import type { State, MusicItem, Moment } from '@/lib/resonance/domain';
export function MemoryEditor({
  state,
  item,
  moment,
  onSave,
  onClose,
}: {
  state: State;
  item?: MusicItem;
  moment?: Moment;
  onSave: (s: State, msg: string) => boolean;
  onClose: () => void;
}) {
  const [itemId, setItemId] = useState(moment?.itemId || item?.id || '');
  const [capsuleId, setCapsuleId] = useState(moment?.capsuleId || '');
  const [note, setNote] = useState(moment?.note || '');
  const [kind, setKind] = useState(moment?.kind || 'memory');
  const [error, setError] = useState('');
  const [date, setDate] = useState(
    moment ? localDay(moment.date) : localDate(),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={moment ? 'Edit this moment.' : 'What will you remember?'}
      description="Only you can say what this music meant."
      wide
    >
      <form
        className="entry-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          const m: Moment = {
            ...moment,
            id: moment?.id || id(),
            itemId: itemId || undefined,
            capsuleId: capsuleId || undefined,
            note: note.trim(),
            kind,
            source: 'manual',
            date:
              moment && localDay(moment.date) === date
                ? moment.date
                : new Date(`${date}T12:00:00`).toISOString(),
          };
          const items = state.items.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: i.status === 'saved' ? ('tried' as const) : i.status,
                  triedAt: i.triedAt || m.date,
                  revisitDate: kind === 'revisit' ? undefined : i.revisitDate,
                }
              : i,
          );
          if (
            onSave(
              {
                ...state,
                items,
                moments: moment
                  ? state.moments.map((x) => (x.id === moment.id ? m : x))
                  : [...state.moments, m],
              },
              'Moment saved to your Atlas.',
            )
          )
            onClose();
          else
            setError(
              'Could not save. Your draft is still here. Check storage and recovery in Settings, then try again.',
            );
        }}
      >
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="two-fields">
          <label className="field">
            Music
            <Choice
              label="Associated music"
              value={itemId}
              onChange={setItemId}
              options={[
                ['', 'A moment without a record'],
                ...state.items.map(
                  (i) => [i.id, `${i.title} · ${i.artist}`] as [string, string],
                ),
              ]}
            />
          </label>
          <label className="field">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="field">
          Your memory
          <textarea
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Where were you? Who were you with? What stayed with you?"
            maxLength={10000}
            required
          />
        </label>
        <div className="two-fields">
          <label className="field">
            Record as
            <Choice
              label="Moment type"
              value={kind}
              onChange={(v) => setKind(v as Moment['kind'])}
              options={[
                ['memory', 'A memory'],
                ['session', 'A listening session'],
                ['revisit', 'A deliberate revisit'],
              ]}
            />
          </label>
          <label className="field">
            Capsule
            <Choice
              label="Moment capsule"
              value={capsuleId}
              onChange={setCapsuleId}
              options={[
                ['', 'No capsule'],
                ...state.capsules.map(
                  (c) => [c.id, c.title] as [string, string],
                ),
              ]}
            />
          </label>
        </div>
        <p className="form-help">
          An associated record will be marked tried. A memory is separate from a
          logged listening session.
        </p>
        <div className="form-actions">
          <button className="button primary" type="submit">
            Save moment
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Atlas({
  state,
  storageError,
  onChange,
  onOpen,
  onAdd,
}: {
  state: State;
  storageError?: string;
  onChange: (s: State, msg: string) => boolean;
  onOpen: (i: MusicItem) => void;
  onAdd: () => void;
}) {
  const [artist, setArtist] = useState('');
  const [tag, setTag] = useState('');
  const [capsule, setCapsule] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [source, setSource] = useState('all');
  const [list, setList] = useState(false);
  const [scrub, setScrub] = useState(0);
  const [limit, setLimit] = useState(40);
  const [opened, setOpened] = useState<Moment>();
  const [editing, setEditing] = useState<Moment>();
  const [compare, setCompare] = useState(false);
  const [periodA, setA] = useState('');
  const [periodB, setB] = useState('');
  const events = useMemo(() => {
    const cap = state.capsules.find((c) => c.id === capsule);
    const saved = state.items
      .filter(() => source === 'all' || source === 'collection')
      .map((i) => ({
        id: `saved-${i.id}`,
        date: i.savedAt,
        itemId: i.id,
        title: i.title,
        artist: i.artist,
        note: i.recommendedBy ? `Recommended by ${i.recommendedBy}` : i.note,
        kind: 'saved',
        source: 'collection',
        moment: undefined as Moment | undefined,
      }));
    const logs = state.moments
      .filter(
        (m) =>
          source === 'all' ||
          (source === 'manual'
            ? m.source === 'manual'
            : source === 'imported'
              ? m.source === 'listenbrainz'
              : false),
      )
      .map((m) => {
        const item = state.items.find((i) => i.id === m.itemId);
        return {
          ...m,
          title: item?.title || m.title || 'A musical memory',
          artist: item?.artist || m.artist || '',
          moment: m,
        };
      });
    return [...saved, ...logs]
      .filter((e) => {
        const item = state.items.find((i) => i.id === e.itemId);
        return (
          (!from || localDay(e.date) >= from) &&
          (!to || localDay(e.date) <= to) &&
          (!artist || e.artist === artist) &&
          (!tag || item?.tags.includes(tag)) &&
          (!cap ||
            cap.itemIds.includes(e.itemId || '') ||
            e.moment?.capsuleId === cap.id)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state, artist, tag, capsule, from, to, source]);
  const months = [...new Set(events.map((e) => localDay(e.date).slice(0, 7)))];
  const selectedMonth = months[Math.min(scrub, months.length - 1)];
  const shown = events
    .filter(
      (e) =>
        list || !selectedMonth || localDay(e.date).startsWith(selectedMonth),
    )
    .slice(0, limit);
  const totals = stats(state, from || undefined, to || undefined);
  function periodStats(month: string) {
    if (!month) return null;
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return stats(state, `${month}-01`, `${month}-${last}`);
  }
  const a = periodStats(periodA),
    b = periodStats(periodB);
  return (
    <>
      <div className="atlas-summary">
        {[
          ['Saved', totals.saved],
          ['Tried', totals.tried],
          ['Revisits', totals.revisits],
          ['Manual sessions', totals.sessions],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="provenance">
        Recorded activity on this device
        {from || to ? ' · selected date range' : ''}. Listening minutes:
        unknown. Imported listens: {totals.imported}, counted separately.
      </p>
      <div className="filter-row atlas-filters">
        <Choice
          label="Atlas artist"
          value={artist}
          onChange={setArtist}
          options={[
            ['', 'All artists'],
            ...[
              ...new Set([
                ...state.items.map((i) => i.artist),
                ...state.moments.map((m) => m.artist || '').filter(Boolean),
              ]),
            ].sort(),
          ]}
        />
        <Choice
          label="Atlas tag"
          value={tag}
          onChange={setTag}
          options={[
            ['', 'All tags'],
            ...[...new Set(state.items.flatMap((i) => i.tags))].sort(),
          ]}
        />
        <Choice
          label="Atlas capsule"
          value={capsule}
          onChange={setCapsule}
          options={[
            ['', 'All capsules'],
            ...state.capsules.map((c) => [c.id, c.title] as [string, string]),
          ]}
        />
        <Choice
          label="Activity source"
          value={source}
          onChange={setSource}
          options={[
            ['all', 'All sources'],
            ['collection', 'Collection activity'],
            ['manual', 'Manual journal'],
            ['imported', 'ListenBrainz import'],
          ]}
        />
        <label className="date-filter">
          From
          <input
            aria-label="Atlas from date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="date-filter">
          To
          <input
            aria-label="Atlas to date"
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <div className="atlas-tools">
        <button
          className="text-link"
          onClick={() => {
            setList(!list);
            setLimit(40);
          }}
        >
          {list ? <Orbit size={17} /> : <AlignLeft size={17} />}{' '}
          {list ? 'Timeline view' : 'Accessible list view'}
        </button>
        <button className="text-link" onClick={() => setCompare(!compare)}>
          Compare periods
        </button>
        <button className="button small" onClick={onAdd}>
          <Plus size={16} /> Add a moment
        </button>
      </div>
      {compare && (
        <section className="comparison">
          <div className="two-fields">
            <label className="field">
              First period
              <input
                type="month"
                value={periodA}
                onChange={(e) => setA(e.target.value)}
              />
            </label>
            <label className="field">
              Second period
              <input
                type="month"
                value={periodB}
                onChange={(e) => setB(e.target.value)}
              />
            </label>
          </div>
          {a && b ? (
            <table>
              <caption>
                Recorded collection activity · all artists and tags
              </caption>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>{periodA}</th>
                  <th>{periodB}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    'saved',
                    'tried',
                    'revisits',
                    'sessions',
                    'imported',
                  ] as const
                ).map((k) => (
                  <tr key={k}>
                    <th>{k === 'sessions' ? 'Manual sessions' : k}</th>
                    <td>{a[k]}</td>
                    <td>{b[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Choose two months to compare the activity you recorded.</p>
          )}
        </section>
      )}
      {!events.length ? (
        <Empty
          title="Your story starts with a record."
          description="Save some music or write a memory. Your timeline will grow from there."
        />
      ) : (
        <>
          <div className="timeline-header">
            <h2>
              {list
                ? 'All moments'
                : selectedMonth
                  ? new Date(`${selectedMonth}-15T12:00:00`).toLocaleDateString(
                      'en-GB',
                      { month: 'long', year: 'numeric' },
                    )
                  : 'Your moments'}
            </h2>
            <span>{events.length} recorded events</span>
          </div>
          {!list && months.length > 1 && (
            <div className="date-scrubber">
              <Slider
                aria-label="Timeline month"
                value={[Math.min(scrub, months.length - 1)]}
                min={0}
                max={months.length - 1}
                step={1}
                onValueChange={(v) => {
                  setScrub(Array.isArray(v) ? v[0] : v);
                  setLimit(40);
                }}
              />
              <div>
                <span>{months[0]}</span>
                <span>{months.at(-1)}</span>
              </div>
            </div>
          )}
          <ol className={`timeline ${list ? 'timeline-list' : ''}`}>
            {shown.map((e) => {
              const item = state.items.find((i) => i.id === e.itemId);
              return (
                <li key={e.id}>
                  <time dateTime={e.date}>{dateLabel(e.date)}</time>
                  <span className={`timeline-dot ${e.source}`} />
                  <div>
                    <span className="event-type">
                      {e.source === 'collection'
                        ? 'Saved to crate'
                        : e.source === 'listenbrainz'
                          ? 'Imported listen · ListenBrainz'
                          : `${e.kind} · Manual`}
                    </span>
                    <button
                      className="timeline-title"
                      onClick={() =>
                        e.moment ? setOpened(e.moment) : item && onOpen(item)
                      }
                    >
                      {e.title}
                      <ArrowUpRight size={17} />
                    </button>
                    <p>{e.artist}</p>
                    {e.note && <blockquote>{e.note}</blockquote>}
                  </div>
                </li>
              );
            })}
          </ol>
          {events.length > shown.length && (
            <button
              className="button quiet"
              onClick={() => setLimit(limit + 40)}
            >
              Show more moments
            </button>
          )}
        </>
      )}
      {state.historyCoverage && (
        <div className="coverage-note">
          <h3>Listening history coverage</h3>
          <p>
            ListenBrainz · {state.historyCoverage.user} · Imported date span:{' '}
            {dateLabel(state.historyCoverage.from)}–
            {dateLabel(state.historyCoverage.to)}. This is a partial archive;
            gaps and unrecorded listening are unknown.
          </p>
        </div>
      )}
      {opened && (
        <Modal
          open
          onClose={() => setOpened(undefined)}
          title={
            state.items.find((i) => i.id === opened.itemId)?.title ||
            opened.title ||
            'A musical memory'
          }
          description={`${dateLabel(opened.date)} · ${opened.source === 'manual' ? 'Manually recorded' : 'ListenBrainz import'}`}
        >
          <p className="memory-writing">
            {opened.note || 'Imported listening record.'}
          </p>
          {storageError && (
            <p role="alert" className="error-message">
              {storageError}
            </p>
          )}
          {opened.capsuleId && (
            <p>
              In {state.capsules.find((c) => c.id === opened.capsuleId)?.title}
            </p>
          )}
          <div className="button-row">
            {opened.source === 'manual' && (
              <button
                className="button"
                onClick={() => {
                  setEditing(opened);
                  setOpened(undefined);
                }}
              >
                <Pencil size={15} /> Edit
              </button>
            )}
            <button
              className="button quiet danger"
              onClick={() => {
                if (
                  onChange(
                    {
                      ...state,
                      moments: state.moments.filter((m) => m.id !== opened.id),
                    },
                    'Moment deleted. Undo is available.',
                  )
                )
                  setOpened(undefined);
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <MemoryEditor
          state={state}
          moment={editing}
          onSave={onChange}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
