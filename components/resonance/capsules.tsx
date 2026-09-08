'use client';
import { useState } from 'react';
import Image from 'next/image';
import {
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Copy,
  Download,
  Plus,
  X,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Artwork, Ribbon } from './art';
import { Modal, Choice, Empty, download, dateLabel } from './shared';
import { id } from '@/lib/resonance/domain';
import type { Capsule, State, MusicItem } from '@/lib/resonance/domain';
function escapeHTML(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
export function exportCapsule(c: Capsule, s: State) {
  const items = c.itemIds
    .map((id) => s.items.find((i) => i.id === id))
    .filter((i): i is MusicItem => !!i);
  const color = {
    copper: '#b98c67',
    blue: '#7299ac',
    sage: '#8fa480',
    plum: '#ad839f',
  }[c.theme];
  const content = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(c.title)} — Resonance</title><style>body{margin:0;background:#151615;color:#eeece5;font:16px/1.7 system-ui}main{max-width:760px;margin:auto;padding:80px 28px}small{letter-spacing:.18em;color:${color}}h1{font:normal clamp(42px,7vw,74px)/1.08 Georgia;letter-spacing:-2px;margin:38px 0}p{white-space:pre-wrap;color:#bfc1b9}li{padding:24px 0;border-bottom:1px solid #383a35}h2{font:normal 26px Georgia;margin:0}a{color:${color}}footer{margin-top:70px;font-size:12px;color:#aaa}@media print{body{background:white;color:#111}p{color:#333}main{padding:20px}li{break-inside:avoid}}</style><main><small>RESONANCE / A PRIVATE CAPSULE</small><h1>${escapeHTML(c.title)}</h1><svg viewBox="0 0 700 140" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<path d="M0 ${30 + i * 4} Q175 ${160 - i * 3} 350 ${30 + i * 4} T700 ${30 + i * 4}" fill="none" stroke="${color}" stroke-width=".7"/>`).join('')}</svg><p>${escapeHTML(c.description)}</p><ol>${items.map((i) => `<li><h2>${escapeHTML(i.title)}</h2><p>${escapeHTML(i.artist)} · ${escapeHTML(i.type)}</p>${i.note ? `<p>${escapeHTML(i.note)}</p>` : ''}${i.links.map((l) => `<a href="${escapeHTML(l.url)}" rel="noopener noreferrer">Open in ${escapeHTML(l.provider)}</a>`).join(' · ')}</li>`).join('')}</ol><footer>Created ${escapeHTML(dateLabel(c.createdAt))} · Your writing and original Resonance graphics. Third-party and uploaded images are omitted from this export.</footer></main></html>`;
  download(
    `${c.title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 70) || 'capsule'}.html`,
    content,
    'text/html',
  );
}
export function Capsules({
  state,
  storageError,
  onChange,
  onOpen,
}: {
  state: State;
  storageError?: string;
  onChange: (s: State, msg: string) => Promise<boolean>;
  onOpen: (i: MusicItem) => void;
}) {
  const [editing, setEditing] = useState<Capsule | 'new'>();
  const [opened, setOpened] = useState<string>();
  const c = state.capsules.find((c) => c.id === opened);
  return (
    <>
      <div className="section-intro">
        <h2>
          Some music belongs
          <br />
          <em>to a moment.</em>
        </h2>
        <p>
          For a person, a place, a version of you. Keep the music and its story
          together.
        </p>
      </div>
      <button
        className="button primary new-capsule"
        onClick={() => setEditing('new')}
      >
        <Plus size={17} /> New capsule
      </button>
      {state.capsules.length ? (
        <div className="capsule-grid">
          {state.capsules.map((c, index) => (
            <button
              className={`capsule-card theme-${c.theme}`}
              key={c.id}
              data-motion="capsule"
              onClick={() => setOpened(c.id)}
            >
              <div className="capsule-art" data-motion-surface>
                {c.image ? (
                  <Image
                    unoptimized
                    width={1200}
                    height={800}
                    src={c.image}
                    alt="Your chosen capsule cover"
                  />
                ) : (
                  <Artwork seed={c.title} theme={c.theme} />
                )}
                <span className="capsule-index">
                  {String(index + 1).padStart(2, '0')} / CAPSULE
                </span>
                <ArrowUpRight className="capsule-arrow" size={25} />
              </div>
              <div className="capsule-card-copy">
                <span>
                  {c.itemIds.length}{' '}
                  {c.itemIds.length === 1 ? 'record' : 'records'} · Private
                </span>
                <h2>{c.title}</h2>
                <p>{c.description || 'A place for music and memory.'}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="Keep a moment together."
          description="Your first capsule can be as small as one song and a sentence."
        />
      )}
      {editing && (
        <CapsuleEditor
          capsule={editing === 'new' ? undefined : editing}
          state={state}
          onClose={() => setEditing(undefined)}
          onSave={onChange}
        />
      )}
      {c && (
        <Modal
          open
          onClose={() => setOpened(undefined)}
          title={c.title}
          description={`${c.itemIds.length} records · Private capsule`}
          wide
        >
          <div className={`capsule-detail theme-${c.theme}`}>
            {storageError && (
              <p role="alert" className="error-message">
                {storageError}
              </p>
            )}
            <div className="capsule-detail-art">
              {c.image ? (
                <Image
                  unoptimized
                  width={1200}
                  height={800}
                  src={c.image}
                  alt="Your chosen capsule cover"
                />
              ) : (
                <Ribbon quiet={state.preferences.lowerEffects} />
              )}
            </div>
            <p className="capsule-writing">
              {c.description || 'Add some writing to make this moment yours.'}
            </p>
            <div className="button-row">
              <button
                className="button small"
                onClick={async () => {
                  setOpened(undefined);
                  setEditing(c);
                }}
              >
                Edit capsule
              </button>
              <button
                className="button quiet small"
                onClick={() =>
                  onChange(
                    {
                      ...state,
                      capsules: [
                        ...state.capsules,
                        {
                          ...c,
                          id: id(),
                          title: `${c.title} (copy)`,
                          createdAt: new Date().toISOString(),
                        },
                      ],
                    },
                    'Capsule duplicated.',
                  )
                }
              >
                <Copy size={15} /> Duplicate
              </button>
              <button
                className="button quiet small"
                onClick={() => exportCapsule(c, state)}
              >
                <Download size={15} /> Export
              </button>
            </div>
            <ol className="capsule-tracklist">
              {c.itemIds.map((id, n) => {
                const item = state.items.find((i) => i.id === id);
                return item ? (
                  <li key={id}>
                    <span>{String(n + 1).padStart(2, '0')}</span>
                    <button
                      onClick={async () => {
                        setOpened(undefined);
                        onOpen(item);
                      }}
                    >
                      <strong>{item.title}</strong>
                      <p>{item.artist}</p>
                    </button>
                    <ArrowUpRight size={16} />
                  </li>
                ) : null;
              })}
            </ol>
          </div>
        </Modal>
      )}
    </>
  );
}
function CapsuleEditor({
  capsule,
  state,
  onSave,
  onClose,
}: {
  capsule?: Capsule;
  state: State;
  onSave: (s: State, msg: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(capsule?.title || '');
  const [writing, setWriting] = useState(capsule?.description || '');
  const [theme, setTheme] = useState(capsule?.theme || 'copper');
  const [image, setImage] = useState(capsule?.image);
  const [rights, setRights] = useState(false);
  const [ids, setIds] = useState(capsule?.itemIds || []);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  function move(index: number, delta: number) {
    const next = [...ids];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setIds(next);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!rights) {
      setError('Confirm you have the right to use this image.');
      return;
    }
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 1_000_000
    ) {
      setError('Choose a JPG, PNG or WebP under 1 MB.');
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () =>
        typeof r.result === 'string'
          ? resolve(r.result)
          : reject(Error('Could not read the image.'));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setImage(data);
    setError('');
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={capsule ? 'Shape this capsule.' : 'Give a moment a home.'}
      description="A little music. A little writing. All yours."
      wide
    >
      <form
        className="entry-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const c: Capsule = {
            id: capsule?.id || id(),
            title: title.trim(),
            description: writing,
            theme,
            itemIds: ids,
            createdAt: capsule?.createdAt || new Date().toISOString(),
            image,
          };
          if (
            await onSave(
              {
                ...state,
                capsules: capsule
                  ? state.capsules.map((x) => (x.id === c.id ? c : x))
                  : [...state.capsules, c],
              },
              'Capsule saved.',
            )
          )
            onClose();
          else
            setError(
              'Could not save. Your draft is still here. Check storage and recovery in Settings, then try again.',
            );
        }}
      >
        <label className="field">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Late-night journeys"
            required
            maxLength={300}
          />
        </label>
        <label className="field">
          Your writing
          <textarea
            rows={4}
            value={writing}
            onChange={(e) => setWriting(e.target.value)}
            placeholder="What does this music take you back to?"
            maxLength={10000}
          />
        </label>
        <label className="field">
          Theme
          <Choice
            label="Capsule theme"
            value={theme}
            onChange={(v) => setTheme(v as Capsule['theme'])}
            options={['copper', 'blue', 'sage', 'plum']}
          />
        </label>
        <div className="upload-block">
          <label>
            <Checkbox checked={rights} onCheckedChange={setRights} /> I own this
            image or have permission to use it.
          </label>
          <label className={`button small ${rights ? '' : 'disabled'}`}>
            <ImagePlus size={16} />
            {image ? 'Replace image' : 'Add an image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!rights}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          {image && (
            <button
              className="text-link"
              type="button"
              onClick={() => setImage(undefined)}
            >
              Remove image
            </button>
          )}
          <p>Optional · under 1 MB · private capsule cover</p>
        </div>
        <div className="form-divider" />
        <h3>Music in this capsule</h3>
        {ids.length > 0 && (
          <ol className="reorder-list">
            {ids.map((id, n) => (
              <li key={id}>
                <span>{n + 1}</span>
                <strong>{state.items.find((i) => i.id === id)?.title}</strong>
                <button
                  className="icon-button"
                  type="button"
                  disabled={n === 0}
                  aria-label={`Move ${state.items.find((i) => i.id === id)?.title} up`}
                  onClick={() => move(n, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={n === ids.length - 1}
                  aria-label={`Move ${state.items.find((i) => i.id === id)?.title} down`}
                  onClick={() => move(n, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove ${state.items.find((i) => i.id === id)?.title} from capsule`}
                  onClick={() => setIds(ids.filter((i) => i !== id))}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <input
          aria-label="Find music for capsule"
          placeholder="Find music in your crate…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="capsule-picker">
          {state.items
            .filter(
              (i) =>
                !ids.includes(i.id) &&
                `${i.title} ${i.artist}`
                  .toLowerCase()
                  .includes(q.toLowerCase()),
            )
            .slice(0, 30)
            .map((i) => (
              <button
                type="button"
                key={i.id}
                onClick={() => setIds([...ids, i.id])}
              >
                <span>
                  {i.title}
                  <small>{i.artist}</small>
                </span>
                <Plus size={16} />
              </button>
            ))}
          {!state.items.length && (
            <p>Save something to your crate, then add it here.</p>
          )}
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="form-actions">
          {capsule && (
            <button
              className="text-link danger"
              type="button"
              onClick={async () => {
                if (
                  await onSave(
                    {
                      ...state,
                      capsules: state.capsules.filter(
                        (c) => c.id !== capsule.id,
                      ),
                      moments: state.moments.map((m) =>
                        m.capsuleId === capsule.id
                          ? { ...m, capsuleId: undefined }
                          : m,
                      ),
                    },
                    'Capsule removed. Undo is available.',
                  )
                )
                  onClose();
                else
                  setError(
                    'Could not delete this capsule. Your collection is unchanged. Check Settings for storage and recovery.',
                  );
              }}
            >
              <Trash2 size={14} /> Delete capsule
            </button>
          )}
          <button type="submit" className="button primary">
            Save capsule
          </button>
        </div>
      </form>
    </Modal>
  );
}
