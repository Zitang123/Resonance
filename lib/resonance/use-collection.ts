'use client';
import { useEffect, useRef, useState } from 'react';
import {
  EMPTY_STATE,
  readStorage,
  writeStorage,
  serializeBackup,
} from './domain';
import type { State } from './domain';
export type Mode = 'personal' | 'sample';
export function useCollection() {
  const [state, setState] = useState<State>(structuredClone(EMPTY_STATE));
  const live = useRef(state);
  const [mode, setModeState] = useState<Mode>('personal');
  const modeRef = useRef<Mode>('personal');
  const persisted = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const blocked = useRef(false);
  const [notice, setNotice] = useState('');
  const [undoCount, setUndoCount] = useState(0);
  const history = useRef<State[]>([]);
  const sync = (s: State) => {
    live.current = s;
    setState(s);
  };
  function switchMode(m: Mode) {
    try {
      const r = readStorage(m, window.localStorage);
      persisted.current = localStorage.getItem(`resonance:${m}:v1`);
      blocked.current = !!r.error;
      setError(r.error || '');
      modeRef.current = m;
      setModeState(m);
      sync(r.state);
      history.current = [];
      setUndoCount(0);
      try {
        localStorage.setItem('resonance:mode', m);
      } catch {}
      setReady(true);
    } catch {
      blocked.current = true;
      setError(
        'This browser is blocking storage. Allow site storage, or export your work before leaving.',
      );
      setReady(true);
    }
  }
  useEffect(() => {
    let m: Mode = 'personal';
    try {
      m =
        localStorage.getItem('resonance:mode') === 'sample'
          ? 'sample'
          : 'personal';
    } catch {}
    // Client-only storage is hydrated once after the server-rendered empty shell.
    // eslint-disable-next-line react/react-compiler
    switchMode(m);
    const other = (e: StorageEvent) => {
      if (e.key === `resonance:${modeRef.current}:v1`) {
        const r = readStorage(modeRef.current, localStorage);
        if (r.error) {
          setError(r.error);
          blocked.current = true;
          return;
        }
        persisted.current = e.newValue;
        blocked.current = false;
        setError('');
        sync(r.state);
        history.current = [];
        setUndoCount(0);
        setNotice('Collection updated from another tab.');
      }
    };
    window.addEventListener('storage', other);
    return () => window.removeEventListener('storage', other);
  }, []);
  function commit(next: State, label = 'Changes saved', recovery = false) {
    if (blocked.current && !recovery) {
      setError(
        'Existing storage could not be read. Restore a backup in Settings to protect the original data.',
      );
      return false;
    }
    try {
      if (
        !recovery &&
        localStorage.getItem(`resonance:${modeRef.current}:v1`) !==
          persisted.current
      ) {
        setError(
          'Another tab changed this collection. Reload before saving so neither change is overwritten.',
        );
        return false;
      }
      if (recovery)
        localStorage.setItem(
          `resonance:${modeRef.current}:v1`,
          serializeBackup(next),
        );
      else writeStorage(modeRef.current, next, localStorage);
      persisted.current = localStorage.getItem(
        `resonance:${modeRef.current}:v1`,
      );
      history.current.push(live.current);
      if (history.current.length > 10) history.current.shift();
      setUndoCount(history.current.length);
      sync(next);
      blocked.current = false;
      setError('');
      setNotice(label);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Storage is full or unavailable. Export a backup and free some space.',
      );
      return false;
    }
  }
  function undo() {
    const previous = history.current.at(-1);
    if (!previous) return;
    try {
      if (
        localStorage.getItem(`resonance:${modeRef.current}:v1`) !==
        persisted.current
      ) {
        setError('Another tab changed this collection. Reload before undoing.');
        return;
      }
      writeStorage(modeRef.current, previous, localStorage);
      persisted.current = localStorage.getItem(
        `resonance:${modeRef.current}:v1`,
      );
      history.current.pop();
      setUndoCount(history.current.length);
      sync(previous);
      setError('');
      setNotice('Change undone.');
    } catch {
      setError(
        'Could not save the undo. Your current collection is unchanged.',
      );
    }
  }
  return {
    state,
    mode,
    ready,
    error,
    notice,
    undoCount,
    commit,
    undo,
    switchMode,
    setNotice,
    setError,
  };
}
export type CollectionStore = ReturnType<typeof useCollection>;
