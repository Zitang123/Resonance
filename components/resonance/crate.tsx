'use client';
import { useMemo, useState } from 'react';
import {
  Search,
  ArrowUpRight,
  LayoutGrid,
  List,
  Plus,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Artwork, Ribbon } from './art';
import { Choice, Empty, ProviderAction } from './shared';
import { searchItems } from '@/lib/resonance/domain';
import type { State, MusicItem } from '@/lib/resonance/domain';
export function Crate({
  state,
  onSample,
  onStart,
  onAdd,
  onOpen,
  onChange,
}: {
  state: State;
  sample: boolean;
  onSample: () => void;
  onStart: () => void;
  onAdd: () => void;
  onOpen: (i: MusicItem) => void;
  onChange: (s: State, message: string) => Promise<boolean>;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [tag, setTag] = useState('');
  const [capsule, setCapsule] = useState('');
  const [sort, setSort] = useState('newest');
  const [layout, setLayout] = useState('grid');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCap, setBulkCap] = useState('');
  const [page, setPage] = useState(0);
  const tags = [...new Set(state.items.flatMap((i) => i.tags))].sort();
  const filtered = useMemo(() => {
    const ids = state.capsules.find((c) => c.id === capsule)?.itemIds;
    return searchItems(state.items, q)
      .filter(
        (i) =>
          (filter === 'all' ? i.status !== 'archived' : i.status === filter) &&
          (!tag || i.tags.includes(tag)) &&
          (!ids || ids.includes(i.id)),
      )
      .sort((a, b) =>
        sort === 'title'
          ? a.title.localeCompare(b.title)
          : sort === 'oldest'
            ? a.savedAt.localeCompare(b.savedAt)
            : b.savedAt.localeCompare(a.savedAt),
      );
  }, [state, q, filter, tag, capsule, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * 24, current * 24 + 24);
  async function bulk(status: MusicItem['status']) {
    if (
      await onChange(
        {
          ...state,
          items: state.items.map((i) =>
            selected.includes(i.id)
              ? {
                  ...i,
                  status,
                  triedAt:
                    i.triedAt ||
                    (['tried', 'keep'].includes(status)
                      ? new Date().toISOString()
                      : undefined),
                }
              : i,
          ),
        },
        `${selected.length} items marked ${status}.`,
      )
    )
      setSelected([]);
  }
  return (
    <>
      {state.items.length === 0 ? (
        <section className="intro-panel">
          <div className="intro-copy">
            <p className="eyebrow">THE BEGINNING OF SOMETHING GOOD</p>
            <h2>
              Find your next listen.
              <br />
              <em>Remember why it mattered.</em>
            </h2>
            <p>
              That album a friend mentioned. A song for the journey home. Give
              it a place to come back to.
            </p>
            <div className="button-row">
              <button className="button primary" onClick={onStart}>
                Start my collection <ArrowUpRight size={17} />
              </button>
              <button className="button quiet" onClick={onSample}>
                Explore a labelled sample collection <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
          <Ribbon quiet={state.preferences.lowerEffects} />
        </section>
      ) : (
        <section className="collection-banner">
          <div>
            <h2>
              {state.items.filter((i) => i.status === 'saved').length} still to
              hear.
            </h2>
            <p>Saved music. In your own time.</p>
          </div>
          <Ribbon quiet={state.preferences.lowerEffects} />
          <span className="ribbon-caption">
            MOVE GENTLY. MAKE A LITTLE RESONANCE.
          </span>
        </section>
      )}
      {!!state.items.length && (
        <>
          <div className="crate-tools">
            <Tabs
              value={filter}
              onValueChange={(v) => {
                setFilter(String(v));
                setPage(0);
                setSelected([]);
              }}
            >
              <TabsList variant="line" className="filter-tabs">
                {[
                  ['all', 'All music'],
                  ['saved', 'To hear'],
                  ['tried', 'Tried'],
                  ['keep', 'Keepers'],
                  ['archived', 'Archived'],
                ].map(([v, l]) => (
                  <TabsTrigger key={v} value={v}>
                    {l}
                    <span>
                      {
                        state.items.filter((i) =>
                          v === 'all'
                            ? i.status !== 'archived'
                            : i.status === v,
                        ).length
                      }
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="view-toggle">
              <button
                aria-label="Grid view"
                aria-pressed={layout === 'grid'}
                onClick={() => setLayout('grid')}
              >
                <LayoutGrid size={17} />
              </button>
              <button
                aria-label="List view"
                aria-pressed={layout === 'list'}
                onClick={() => setLayout('list')}
              >
                <List size={17} />
              </button>
            </div>
          </div>
          <div className="filter-row">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Search your crate"
                placeholder="Search music, people, notes…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
              />
              <kbd>/</kbd>
            </label>
            <Choice
              label="Filter by tag"
              value={tag}
              onChange={(v) => {
                setTag(v);
                setPage(0);
              }}
              options={[['', 'All tags'], ...tags]}
            />
            <Choice
              label="Filter by capsule"
              value={capsule}
              onChange={(v) => {
                setCapsule(v);
                setPage(0);
              }}
              options={[
                ['', 'All capsules'],
                ...state.capsules.map(
                  (c) => [c.id, c.title] as [string, string],
                ),
              ]}
            />
            <Choice
              label="Sort music"
              value={sort}
              onChange={setSort}
              options={[
                ['newest', 'Newest saved'],
                ['oldest', 'Oldest saved'],
                ['title', 'Title A–Z'],
              ]}
            />
          </div>
          <div className="collection-summary">
            <label>
              <Checkbox
                checked={
                  shown.length > 0 &&
                  shown.every((i) => selected.includes(i.id))
                }
                onCheckedChange={(v) =>
                  setSelected(
                    v
                      ? [...new Set([...selected, ...shown.map((i) => i.id)])]
                      : selected.filter(
                          (id) => !shown.some((i) => i.id === id),
                        ),
                  )
                }
              />{' '}
              Select this page
            </label>
            <span>
              {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          {!!selected.length && (
            <div className="bulk-bar">
              <strong>{selected.length} selected</strong>
              <button className="button small" onClick={() => bulk('keep')}>
                Keep
              </button>
              <button className="button small" onClick={() => bulk('archived')}>
                Archive
              </button>
              <Choice
                label="Bulk capsule"
                value={bulkCap}
                onChange={setBulkCap}
                options={[
                  ['', 'Choose a capsule'],
                  ...state.capsules.map(
                    (c) => [c.id, c.title] as [string, string],
                  ),
                ]}
              />
              <button
                className="button small"
                disabled={!bulkCap}
                onClick={async () => {
                  if (
                    await onChange(
                      {
                        ...state,
                        capsules: state.capsules.map((c) =>
                          c.id === bulkCap
                            ? {
                                ...c,
                                itemIds: [
                                  ...new Set([...c.itemIds, ...selected]),
                                ],
                              }
                            : c,
                        ),
                      },
                      'Music added to capsule.',
                    )
                  )
                    setSelected([]);
                }}
              >
                Add to capsule
              </button>
              <button className="text-link" onClick={() => setSelected([])}>
                Clear
              </button>
            </div>
          )}
          {!shown.length ? (
            <Empty
              title="Nothing here, yet."
              description="Try another filter, or give your next recommendation a home."
            >
              <button
                className="button"
                onClick={async () => {
                  setQ('');
                  setFilter('all');
                  setTag('');
                  setCapsule('');
                }}
              >
                Clear filters
              </button>
            </Empty>
          ) : (
            <div
              className={`music-grid ${layout === 'list' ? 'music-list' : ''}`}
            >
              {shown.map((i) => (
                <article className="music-card" data-motion="record" key={i.id}>
                  <div className="cover-wrap" data-motion-surface>
                    <button
                      className="cover-button"
                      onClick={() => onOpen(i)}
                      aria-label={`Open ${i.title}`}
                      style={{
                        viewTransitionName: `cover-${i.id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
                      }}
                    >
                      <Artwork seed={i.title + i.artist} />
                      <span className="cover-action">
                        <ArrowUpRight size={22} />
                      </span>
                    </button>
                    <div className="card-check">
                      <Checkbox
                        aria-label={`Select ${i.title}`}
                        checked={selected.includes(i.id)}
                        onCheckedChange={(v) =>
                          setSelected(
                            v
                              ? [...selected, i.id]
                              : selected.filter((s) => s !== i.id),
                          )
                        }
                      />
                    </div>
                    <span className="type-label">{i.type}</span>
                  </div>
                  <div className="music-card-info">
                    <div className="music-meta">
                      <span>
                        {i.status === 'saved'
                          ? 'TO HEAR'
                          : i.status.toUpperCase()}
                      </span>
                      {i.revisitDate && <span className="copper">REVISIT</span>}
                    </div>
                    <button className="title-button" onClick={() => onOpen(i)}>
                      {i.title}
                    </button>
                    <p className="artist">{i.artist}</p>
                    <p className="recommendation">
                      {i.recommendedBy
                        ? `From ${i.recommendedBy}`
                        : i.note
                          ? i.note
                          : 'A little discovery of your own.'}
                    </p>
                    {layout === 'list' && <ProviderAction item={i} compact />}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="pagination">
            <span>
              Page {current + 1} of {pages}
            </span>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}
      {!state.items.length && (
        <div className="first-actions">
          <button onClick={onAdd}>
            <Plus size={20} />
            <div>
              <h3>Start with one good recommendation</h3>
              <p>A link, a title, a reason to return.</p>
            </div>
            <ArrowUpRight size={18} />
          </button>
          <p>
            No streaming account needed.
            <br />
            Your personal collection is saved to your account.
          </p>
        </div>
      )}
    </>
  );
}
