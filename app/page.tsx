'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  AudioLines,
  Layers3,
  Moon,
  Orbit,
  Disc3,
  Plus,
  Settings as SettingsIcon,
  Undo2,
  ArrowUpRight,
  Pencil,
  Archive,
  Heart,
  Check,
  WifiOff,
  Trash2,
  X,
} from 'lucide-react';
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useRoomMotion } from '@/hooks/use-room-motion';
import { useCollection } from '@/lib/resonance/use-collection';
import { id, findDuplicates } from '@/lib/resonance/domain';
import type { MusicItem } from '@/lib/resonance/domain';
import { Artwork } from '@/components/resonance/art';
import { Crate } from '@/components/resonance/crate';
import { Tonight } from '@/components/resonance/tonight';
import { Capsules } from '@/components/resonance/capsules';
import { Atlas, MemoryEditor } from '@/components/resonance/atlas';
import { ItemEditor } from '@/components/resonance/item-editor';
import { Settings } from '@/components/resonance/settings';
import { ProviderAction, dateLabel } from '@/components/resonance/shared';
type Space = 'Crate' | 'Tonight' | 'Atlas' | 'Capsules';
export default function Home() {
  const store = useCollection();
  const { state, ready, mode, error, notice, commit } = store;
  const [space, setSpace] = useState<Space>('Crate');
  const [editor, setEditor] = useState<MusicItem | 'new'>();
  const [detailId, setDetailId] = useState<string>();
  const [memory, setMemory] = useState<MusicItem | 'new'>();
  const [settings, setSettings] = useState(false);
  const [offline, setOffline] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const roomMotion = useRoomMotion<HTMLElement>({
    revision: `${ready}:${mode}:${space}`,
    maxElements: 40,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  }, [store]);
  const item = state.items.find((i) => i.id === detailId);
  useEffect(() => {
    const status = () => setOffline(!navigator.onLine);
    status();
    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    const scroll = () => setScrolled(scrollY > 30);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('online', status);
      window.removeEventListener('offline', status);
      window.removeEventListener('scroll', scroll);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.effects = state.preferences.lowerEffects
      ? 'low'
      : 'full';
  }, [state.preferences.lowerEffects]);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const assets = performance
            .getEntriesByType('resource')
            .map((e) => e.name);
          reg.active?.postMessage({ type: 'CACHE_SHELL', assets });
        })
        .catch(() => {});
    }
  }, []);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest(
          'input,textarea,select,[contenteditable=true],[role=dialog]',
        ) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setEditor('new');
      }
      if (e.key === '/') {
        const input = document.querySelector<HTMLInputElement>(
          '[aria-label="Search your crate"]',
        );
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const elements = document.querySelectorAll<HTMLElement>(
      '.music-card,.capsule-card,.timeline>li,.tonight-card',
    );
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute('data-visible', 'true');
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.05 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ready, space, mode, state.items.length, state.capsules.length]);
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: Tool, opts: { signal: AbortSignal }) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'read_resonance_collection',
      description:
        'Read the currently selected personal or explicitly labelled sample music collection on this device.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        mode: latest.current.mode,
        items: latest.current.state.items.map((i) => ({
          id: i.id,
          title: i.title,
          artist: i.artist,
          status: i.status,
        })),
        capsules: latest.current.state.capsules.map((c) => ({
          id: c.id,
          title: c.title,
        })),
      }),
    });
    register({
      name: 'save_manual_music',
      description:
        'Save a user-supplied title and artist to the currently selected Resonance collection. Refuses likely duplicates for user review.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 300 },
          artist: { type: 'string', maxLength: 300 },
          type: { enum: ['track', 'album'] },
          note: { type: 'string', maxLength: 10000 },
        },
        required: ['title', 'artist', 'type'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input: unknown) => {
        const d = input as Record<string, unknown>;
        if (
          !d ||
          typeof d.title !== 'string' ||
          !d.title.trim() ||
          typeof d.artist !== 'string' ||
          !d.artist.trim() ||
          !['track', 'album'].includes(String(d.type)) ||
          d.title.length > 300 ||
          d.artist.length > 300 ||
          (d.note !== undefined &&
            (typeof d.note !== 'string' || d.note.length > 10000))
        )
          throw Error(
            'A valid title, artist and track or album type are required.',
          );
        const s = latest.current;
        const value: MusicItem = {
          id: id(),
          title: d.title.trim(),
          artist: d.artist.trim(),
          type: d.type as 'track' | 'album',
          links: [],
          savedAt: new Date().toISOString(),
          recommendedBy: '',
          note: String(d.note || ''),
          tags: [],
          status: 'saved',
          metadata: { source: 'manual' },
        };
        if (findDuplicates(s.state.items, value).length)
          throw Error('Possible duplicate. Review it using Save music.');
        let saved = false;
        flushSync(() => {
          saved = s.commit(
            { ...s.state, items: [value, ...s.state.items] },
            'Music saved to crate.',
          );
        });
        if (!saved) throw Error('Storage unavailable; no changes were saved.');
        return { id: value.id, status: 'saved', mode: s.mode };
      },
    });
    return () => lifecycle.abort();
  }, []);
  function navigate(next: Space) {
    setSpace(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
  }
  function transition(action: () => void) {
    const low =
      state.preferences.lowerEffects ||
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { skipTransition: () => void };
    };
    if (doc.startViewTransition && !low) {
      doc.startViewTransition(() => flushSync(action));
    } else action();
  }
  function openItem(i: MusicItem) {
    opener.current = document.activeElement as HTMLElement;
    transition(() => {
      document.documentElement.dataset.detail = 'true';
      setDetailId(i.id);
    });
  }
  function closeItem() {
    transition(() => {
      delete document.documentElement.dataset.detail;
      setDetailId(undefined);
    });
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
  }
  function updateItem(status: MusicItem['status']) {
    if (!item) return;
    commit(
      {
        ...state,
        items: state.items.map((i) =>
          i.id === item.id
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
      `Marked ${status}.`,
    );
  }
  const menu = [
    { name: 'Crate' as Space, icon: Layers3 },
    { name: 'Tonight' as Space, icon: Moon },
    { name: 'Atlas' as Space, icon: Orbit },
    { name: 'Capsules' as Space, icon: Disc3 },
  ];
  return (
    <SidebarProvider className="room">
      <a className="skip-link" href="#main">
        Skip to collection
      </a>
      <Sidebar collapsible="none" className="rail">
        <button
          className="wordmark"
          onClick={() => navigate('Crate')}
          aria-label="Resonance home"
        >
          <AudioLines />
          <span>resonance</span>
        </button>
        <div className="rail-label">Your listening room</div>
        <nav aria-label="Main navigation">
          {menu.map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-current={space === name ? 'page' : undefined}
              className={space === name ? 'active' : ''}
              onClick={() => navigate(name)}
            >
              <Icon />
              {name}
              {name === 'Crate' && state.items.length > 0 && (
                <span>
                  {state.items.filter((i) => i.status !== 'archived').length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <button className="rail-settings" onClick={() => setSettings(true)}>
            <SettingsIcon size={17} /> Settings & backup
          </button>
          <div className="rail-foot">
            <span className="status-dot" />
            On this device
          </div>
        </div>
      </Sidebar>
      <main
        ref={roomMotion}
        className="workspace"
        id="main"
        data-space={space}
        data-populated={state.items.length > 0}
      >
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <button className="mobile-wordmark" onClick={() => navigate('Crate')}>
            resonance
          </button>
          <span className="desktop-breadcrumb">
            Your listening room <span>/</span> {space}
          </span>
          <div className="topbar-actions">
            {offline && (
              <span className="offline-status">
                <WifiOff size={14} /> Offline
              </span>
            )}
            {mode === 'sample' ? (
              <button
                className="mode-switch"
                onClick={() => {
                  store.switchMode('personal');
                  setDetailId(undefined);
                  delete document.documentElement.dataset.detail;
                }}
              >
                Sample collection <ArrowUpRight size={14} />
              </button>
            ) : (
              <span className="privacy-label">Private collection</span>
            )}
            <button
              className="icon-button"
              aria-label="Settings and backup"
              onClick={() => setSettings(true)}
            >
              <SettingsIcon size={17} />
            </button>
          </div>
        </header>
        {mode === 'sample' && (
          <div className="sample-banner">
            <span>Sample collection — fictional notes and activity.</span>
            <button onClick={() => store.switchMode('personal')}>
              Back to my collection <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        {error && (
          <div className="storage-error" role="alert">
            <p>{error}</p>
            <button className="button small" onClick={() => setSettings(true)}>
              Recovery & backup
            </button>
          </div>
        )}
        <section className="page-head">
          <div>
            <h1 tabIndex={-1} ref={heading}>
              {space === 'Crate'
                ? 'Your crate'
                : space === 'Tonight'
                  ? 'Tonight'
                  : space === 'Atlas'
                    ? 'Your Atlas'
                    : 'Capsules'}
              <span className="copper">.</span>
            </h1>
          </div>
          <button
            className="button primary"
            disabled={!ready}
            onClick={() =>
              space === 'Atlas' ? setMemory('new') : setEditor('new')
            }
          >
            <Plus size={18} />
            {space === 'Atlas' ? 'Add a moment' : 'Save music'}
          </button>
        </section>
        {!ready ? (
          <output className="loading-state">Opening your collection…</output>
        ) : (
          <div className="space-content" key={`${mode}-${space}`}>
            {space === 'Crate' && (
              <Crate
                state={state}
                sample={mode === 'sample'}
                onSample={() => store.switchMode('sample')}
                onStart={() => setEditor('new')}
                onAdd={() => setEditor('new')}
                onOpen={openItem}
                onChange={commit}
              />
            )}{' '}
            {space === 'Tonight' && (
              <Tonight
                state={state}
                onOpen={openItem}
                onLog={setMemory}
                onCrate={() => navigate('Crate')}
              />
            )}{' '}
            {space === 'Capsules' && (
              <Capsules
                state={state}
                storageError={error}
                onChange={commit}
                onOpen={openItem}
              />
            )}{' '}
            {space === 'Atlas' && (
              <Atlas
                state={state}
                storageError={error}
                onChange={commit}
                onOpen={openItem}
                onAdd={() => setMemory('new')}
              />
            )}
          </div>
        )}
        <footer className="page-footer">
          <AudioLines size={17} />
          <span className="footer-brand">A place for your music.</span>
          <span>Saved here. Backed up by you.</span>
        </footer>
        {notice && (
          <output className="save-status" aria-live="polite">
            <span>{notice}</span>
            {store.undoCount > 0 && (
              <button onClick={store.undo}>
                <Undo2 size={15} /> Undo
              </button>
            )}
            <button
              onClick={() => store.setNotice('')}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </output>
        )}
      </main>
      <Sheet open={!!item} onOpenChange={(v) => !v && closeItem()}>
        <SheetContent className="detail-sheet" finalFocus={opener}>
          {item && (
            <>
              <div
                className="detail-cover"
                style={{
                  viewTransitionName: `cover-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
                }}
              >
                <Artwork seed={item.title + item.artist} large />
              </div>
              <div className="detail-body">
                <span className="detail-type">
                  {item.type} ·{' '}
                  {item.status === 'saved' ? 'To hear' : item.status}
                </span>
                <SheetTitle className="detail-title">{item.title}</SheetTitle>
                <SheetDescription className="detail-artist">
                  {item.artist}
                </SheetDescription>
                {error && (
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                )}
                <div className="button-row">
                  <ProviderAction item={item} />
                  <button
                    className="icon-button"
                    aria-label="Edit music"
                    onClick={() => {
                      setEditor(item);
                      setDetailId(undefined);
                      delete document.documentElement.dataset.detail;
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                </div>
                {!item.links.length && (
                  <p className="form-help">
                    No exact provider link yet. Search Spotify and add the right
                    recording in Edit.
                  </p>
                )}
                <div className="detail-context">
                  {item.recommendedBy && (
                    <p className="recommender">
                      Recommended by <strong>{item.recommendedBy}</strong>
                    </p>
                  )}
                  <blockquote>
                    {item.note ||
                      'Add a note to remember what brought you here.'}
                  </blockquote>
                  <div className="tags">
                    {item.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="detail-status-controls">
                  <button
                    className="button small"
                    aria-pressed={item.status === 'tried'}
                    onClick={() => updateItem('tried')}
                  >
                    <Check size={16} /> Tried
                  </button>
                  <button
                    className="button small"
                    aria-pressed={item.status === 'keep'}
                    onClick={() => updateItem('keep')}
                  >
                    <Heart size={16} /> Keep
                  </button>
                  <button
                    className="button small quiet"
                    onClick={() =>
                      updateItem(
                        item.status === 'archived' ? 'saved' : 'archived',
                      )
                    }
                  >
                    <Archive size={16} />
                    {item.status === 'archived' ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
                <button
                  className="button memory-button"
                  onClick={() => {
                    setMemory(item);
                    setDetailId(undefined);
                    delete document.documentElement.dataset.detail;
                  }}
                >
                  <Plus size={16} /> Add a memory or listening session
                </button>
                <dl className="item-facts">
                  <div>
                    <dt>Saved</dt>
                    <dd>{dateLabel(item.savedAt)}</dd>
                  </div>
                  {item.revisitDate && (
                    <div>
                      <dt>Revisit</dt>
                      <dd>{dateLabel(item.revisitDate)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Metadata</dt>
                    <dd>
                      {item.metadata?.source === 'musicbrainz' ? (
                        <a
                          className="text-link"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`https://musicbrainz.org/${item.type === 'track' ? 'recording' : 'release-group'}/${item.metadata.id}`}
                        >
                          MusicBrainz <ArrowUpRight size={13} />
                        </a>
                      ) : (
                        'Entered by you'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Capsules</dt>
                    <dd>
                      {state.capsules
                        .filter((c) => c.itemIds.includes(item.id))
                        .map((c) => c.title)
                        .join(', ') || 'None yet'}
                    </dd>
                  </div>
                </dl>
                {item.links.slice(1).map((l) => (
                  <a
                    className="text-link extra-provider"
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in {l.provider}
                    <ArrowUpRight size={14} />
                  </a>
                ))}
                <button
                  className="text-link danger delete-item"
                  onClick={() => {
                    if (
                      commit(
                        {
                          ...state,
                          items: state.items.filter((i) => i.id !== item.id),
                          capsules: state.capsules.map((c) => ({
                            ...c,
                            itemIds: c.itemIds.filter((id) => id !== item.id),
                          })),
                          moments: state.moments.map((m) =>
                            m.itemId === item.id
                              ? {
                                  ...m,
                                  itemId: undefined,
                                  title: item.title,
                                  artist: item.artist,
                                }
                              : m,
                          ),
                        },
                        'Record deleted. Your memories are preserved. Undo is available.',
                      )
                    )
                      closeItem();
                  }}
                >
                  <Trash2 size={14} /> Delete from crate
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {editor && (
        <ItemEditor
          key={editor === 'new' ? 'new' : editor.id}
          item={editor === 'new' ? undefined : editor}
          state={state}
          onSave={commit}
          onClose={() => setEditor(undefined)}
        />
      )}{' '}
      {memory && (
        <MemoryEditor
          state={state}
          item={memory === 'new' ? undefined : memory}
          onSave={commit}
          onClose={() => setMemory(undefined)}
        />
      )}{' '}
      {settings && (
        <Settings store={store} onClose={() => setSettings(false)} />
      )}
    </SidebarProvider>
  );
}
