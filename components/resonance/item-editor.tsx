'use client';
import { useState } from 'react';
import { ArrowUpRight, Check, Link2, Search, Plus } from 'lucide-react';
import { Modal, Choice } from './shared';
import {
  safeProviderLink,
  findDuplicates,
  mergeItem,
  id,
} from '@/lib/resonance/domain';
import type { MusicItem, State } from '@/lib/resonance/domain';
type Match = {
  id: string;
  title: string;
  artist: string;
  disambiguation?: string;
};
export function ItemEditor({
  item,
  state,
  onSave,
  onClose,
  initialLink = '',
}: {
  item?: MusicItem;
  state: State;
  onSave: (state: State, message: string) => boolean;
  onClose: () => void;
  initialLink?: string;
}) {
  const [title, setTitle] = useState(item?.title || '');
  const [artist, setArtist] = useState(item?.artist || '');
  const [type, setType] = useState(item?.type || 'album');
  const [link, setLink] = useState(
    item?.links.map((l) => l.url).join('\n') || initialLink,
  );
  const [note, setNote] = useState(item?.note || '');
  const [who, setWho] = useState(item?.recommendedBy || '');
  const [tags, setTags] = useState(item?.tags.join(', ') || '');
  const [status, setStatus] = useState(item?.status || 'saved');
  const [revisit, setRevisit] = useState(item?.revisitDate || '');
  const [capsule, setCapsule] = useState('');
  const [newCapsule, setNewCapsule] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<MusicItem>();
  const [duplicate, setDuplicate] = useState<MusicItem>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [metadata, setMetadata] = useState(item?.metadata);
  const [lookupMessage, setLookupMessage] = useState('');
  function candidate(): MusicItem {
    if (!title.trim() || !artist.trim())
      throw Error('Add a title and artist so you can find this again.');
    const links = link
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(safeProviderLink);
    return {
      id: item?.id || id(),
      title: title.trim(),
      artist: artist.trim(),
      type,
      links,
      savedAt: item?.savedAt || new Date().toISOString(),
      note: note.trim(),
      recommendedBy: who.trim(),
      tags: [
        ...new Set(
          tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
      status,
      revisitDate: revisit || undefined,
      triedAt:
        item?.triedAt ||
        (['tried', 'keep'].includes(status)
          ? new Date().toISOString()
          : undefined),
      metadata: metadata || { source: 'manual' },
    };
  }
  function persist(value: MusicItem, mergeWith?: MusicItem) {
    let items = state.items;
    let savedId = value.id;
    if (mergeWith) {
      savedId = mergeWith.id;
      items = items.map((i) =>
        i.id === mergeWith.id ? mergeItem(i, value) : i,
      );
    } else
      items = item
        ? items.map((i) => (i.id === item.id ? value : i))
        : [value, ...items];
    let capsules = state.capsules;
    if (capsule === 'new' && newCapsule.trim())
      capsules = [
        ...capsules,
        {
          id: id(),
          title: newCapsule.trim(),
          description: '',
          theme: 'copper',
          itemIds: [savedId],
          createdAt: new Date().toISOString(),
        },
      ];
    else if (capsule)
      capsules = capsules.map((c) =>
        c.id === capsule
          ? { ...c, itemIds: [...new Set([...c.itemIds, savedId])] }
          : c,
      );
    if (
      onSave(
        { ...state, items, capsules },
        mergeWith
          ? 'Recommendation merged. Your context is preserved.'
          : item
            ? 'Music updated.'
            : 'Saved to your crate.',
      )
    )
      onClose();
    else
      setError(
        'Could not save. Your draft is still here. Check storage and recovery in Settings, then try again.',
      );
  }
  function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      const value = candidate();
      const match = findDuplicates(
        state.items.filter((i) => i.id !== item?.id),
        value,
      )[0];
      if (match && !item) {
        setPending(value);
        setDuplicate(match);
      } else persist(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this entry.');
    }
  }
  async function lookup() {
    setBusy(true);
    setLookupMessage('');
    setMatches([]);
    try {
      const res = await fetch(
        `/api/providers?kind=metadata&type=${type}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
      );
      const body = (await res.json()) as { error?: string; matches: Match[] };
      if (!res.ok)
        throw Error(
          body.error ||
            'Metadata service is unavailable. Your manual entry is ready to save.',
        );
      setMatches(body.matches);
      if (!body.matches.length)
        setLookupMessage('No matches. You can keep your own title and artist.');
    } catch (e) {
      setLookupMessage(
        e instanceof Error
          ? e.message
          : 'Offline. You can still save manually.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={
        item ? 'A little more context.' : 'A good recommendation starts here.'
      }
      description="Save the music. Keep the story."
      wide
    >
      <form className="entry-form" onSubmit={submit}>
        <label className="field">
          Music link <span className="optional">optional · one per line</span>
          <div className="input-icon">
            <Link2 size={17} />
            <textarea
              rows={1}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a Spotify, Apple Music, YouTube or Bandcamp link"
              maxLength={6000}
            />
          </div>
        </label>
        <div className="two-fields">
          <label className="field">
            Title
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setMetadata(undefined);
              }}
              maxLength={300}
              required
              placeholder="The album or song"
            />
          </label>
          <label className="field">
            Artist
            <input
              value={artist}
              onChange={(e) => {
                setArtist(e.target.value);
                setMetadata(undefined);
              }}
              maxLength={300}
              required
              placeholder="Who made it?"
            />
          </label>
        </div>
        <div className="button-row">
          <Choice
            label="Music type"
            value={type}
            onChange={(v) => setType(v as 'album' | 'track')}
            options={['album', 'track']}
          />
          <button
            type="button"
            className="button quiet small"
            onClick={lookup}
            disabled={busy || !title.trim() || !artist.trim()}
          >
            <Search size={15} />
            {busy ? 'Looking up…' : 'Match metadata'}
          </button>
          <a
            className="text-link"
            href={`https://musicbrainz.org/search?query=${encodeURIComponent(`${title} ${artist}`)}&type=${type === 'album' ? 'release_group' : 'recording'}&method=indexed`}
            target="_blank"
            rel="noopener noreferrer"
          >
            MusicBrainz <ArrowUpRight size={13} />
          </a>
        </div>
        {lookupMessage && (
          <output className="inline-message">{lookupMessage}</output>
        )}
        {!!matches.length && (
          <div className="match-list">
            <p>Choose the recording you meant. Versions can differ.</p>
            {matches.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => {
                  setTitle(m.title);
                  setArtist(m.artist);
                  setMetadata({ source: 'musicbrainz', id: m.id });
                  setMatches([]);
                  setLookupMessage(
                    'MusicBrainz match selected. You can correct it anytime.',
                  );
                }}
              >
                <span>
                  {m.title}
                  <small>
                    {m.artist} {m.disambiguation ? `· ${m.disambiguation}` : ''}
                  </small>
                </span>
                <Plus size={16} />
              </button>
            ))}
          </div>
        )}
        <div className="form-divider" />
        <div className="two-fields">
          <label className="field">
            Recommended by <span className="optional">optional</span>
            <input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="A friend, a record shop, you…"
              maxLength={300}
            />
          </label>
          <label className="field">
            Personal tags <span className="optional">comma separated</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="late nights, first listen"
              maxLength={1000}
            />
          </label>
        </div>
        <label className="field">
          Why save it? <span className="optional">optional</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Leave a little something for your future self."
            maxLength={10000}
            rows={2}
          />
        </label>
        <div className="two-fields">
          <label className="field">
            Add to a capsule
            <Choice
              label="Add to a capsule"
              value={capsule}
              onChange={setCapsule}
              options={[
                ['', 'Just my crate'],
                ...state.capsules.map(
                  (c) => [c.id, c.title] as [string, string],
                ),
                ['new', '+ Create a capsule'],
              ]}
            />
          </label>
          {capsule === 'new' ? (
            <label className="field">
              New capsule title
              <input
                value={newCapsule}
                onChange={(e) => setNewCapsule(e.target.value)}
                maxLength={300}
                required
                placeholder="Late-night journeys"
              />
            </label>
          ) : (
            <label className="field">
              Revisit on <span className="optional">optional</span>
              <input
                type="date"
                value={revisit}
                onChange={(e) => setRevisit(e.target.value)}
              />
            </label>
          )}
        </div>
        {item && (
          <label className="field">
            Status
            <Choice
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as MusicItem['status'])}
              options={['saved', 'tried', 'keep', 'archived']}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {pending && duplicate ? (
          <div className="duplicate-warning">
            <h3>This may already be in your crate.</h3>
            <p>
              {duplicate.title} · {duplicate.artist}. Merge your context, or
              keep a different recording separate.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button primary"
                onClick={() => persist(pending, duplicate)}
              >
                Merge recommendation
              </button>
              <button
                type="button"
                className="button"
                onClick={() => persist(pending)}
              >
                Keep separate
              </button>
            </div>
          </div>
        ) : (
          <div className="form-actions">
            <p>Private, saved on this device.</p>
            <button className="button primary" type="submit">
              <Check size={17} />
              {item ? 'Save changes' : 'Save to crate'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
