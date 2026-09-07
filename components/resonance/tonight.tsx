'use client';
import { useMemo, useState } from 'react';
import { Pin, RefreshCw, X, Moon, ArrowUpRight, Check } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Artwork } from './art';
import { Choice, Empty, ProviderAction } from './shared';
import { selectTonight } from '@/lib/resonance/domain';
import type { MusicItem, State } from '@/lib/resonance/domain';
export function Tonight({
  state,
  onOpen,
  onLog,
  onCrate,
}: {
  state: State;
  onOpen: (i: MusicItem) => void;
  onLog: (i: MusicItem) => void;
  onCrate: () => void;
}) {
  const [mode, setMode] = useState<'mix' | 'familiar' | 'unexplored'>('mix');
  const [tag, setTag] = useState('');
  const [pins, setPins] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const picks = useMemo(
    () =>
      selectTonight(state, {
        mode,
        tag,
        pinnedIds: pins,
        excludedIds: excluded,
        limit: 3,
      }).filter((p) => !dismissed.includes(p.item.id)),
    [state, mode, tag, pins, excluded, dismissed],
  );
  function replace(id: string) {
    setExcluded([...excluded, id]);
    setPins(pins.filter((p) => p !== id));
  }
  return (
    <>
      <div className="tonight-intro">
        <h2>
          A little less choosing.
          <br />
          <em>A little more listening.</em>
        </h2>
        <p>
          Three records from your crate. Chosen by your reminders, the music you
          have yet to try, and the favourites worth returning to.
        </p>
      </div>
      <div className="tonight-controls">
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as typeof mode);
            setExcluded([]);
            setDismissed([]);
          }}
        >
          <TabsList className="segmented">
            <TabsTrigger value="mix">A mixture</TabsTrigger>
            <TabsTrigger value="unexplored">Unexplored</TabsTrigger>
            <TabsTrigger value="familiar">Familiar</TabsTrigger>
          </TabsList>
        </Tabs>
        <Choice
          label="Tonight personal tag"
          value={tag}
          onChange={(v) => {
            setTag(v);
            setExcluded([]);
            setDismissed([]);
          }}
          options={[
            ['', 'Any personal tag'],
            ...[...new Set(state.items.flatMap((i) => i.tags))].sort(),
          ]}
        />
      </div>
      {!picks.length ? (
        <Empty
          title="Make room for a first listen."
          description={
            state.items.length
              ? 'No more music matches this selection. Try another mode or bring back dismissed records.'
              : 'Save a few recommendations in your crate. Tonight will give you a place to begin.'
          }
        >
          <button
            className="button primary"
            onClick={() => {
              if (!state.items.length) onCrate();
              else {
                setExcluded([]);
                setDismissed([]);
                setTag('');
                setMode('mix');
              }
            }}
          >
            {state.items.length ? 'Reset selection' : 'Open my crate'}
            <ArrowUpRight size={17} />
          </button>
        </Empty>
      ) : (
        <div className="tonight-grid">
          {picks.map(({ item, reason }, index) => (
            <article
              className="tonight-card"
              data-motion="record"
              key={item.id}
            >
              <div className="tonight-number">
                <span>0{index + 1}</span>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`${pins.includes(item.id) ? 'Unpin' : 'Pin'} ${item.title}`}
                    aria-pressed={pins.includes(item.id)}
                    onClick={() =>
                      setPins(
                        pins.includes(item.id)
                          ? pins.filter((p) => p !== item.id)
                          : [...pins, item.id],
                      )
                    }
                  >
                    <Pin size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Dismiss ${item.title}`}
                    onClick={() => setDismissed([...dismissed, item.id])}
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
              <button
                className="tonight-cover"
                data-motion-surface
                aria-label={`Open ${item.title}`}
                onClick={() => onOpen(item)}
              >
                <Artwork seed={item.title + item.artist} />
              </button>
              <p className="pick-reason">
                <Moon size={13} />
                {reason}
              </p>
              <h2>{item.title}</h2>
              <p className="artist">{item.artist}</p>
              {item.note && <blockquote>“{item.note}”</blockquote>}
              <div className="tonight-actions">
                <ProviderAction item={item} />
                <button
                  className="icon-button"
                  aria-label={`Replace ${item.title}`}
                  onClick={() => replace(item.id)}
                  disabled={pins.includes(item.id)}
                >
                  <RefreshCw size={17} />
                </button>
              </div>
              <button
                className="text-link log-link"
                onClick={() => onLog(item)}
              >
                <Check size={14} /> I listened · add a memory
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="provenance">
        Chosen from your collection using repeatable rules. Opening a music
        service does not record a listen.
      </p>
      {(!!excluded.length || !!dismissed.length) && (
        <button
          className="text-link"
          onClick={() => {
            setExcluded([]);
            setDismissed([]);
          }}
        >
          Bring back dismissed records
        </button>
      )}
    </>
  );
}
