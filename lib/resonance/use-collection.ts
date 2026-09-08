'use client';
import { useEffect, useRef, useState } from 'react';
import {
  EMPTY_STATE,
  readStorage,
  writeStorage,
  serializeBackup,
  validateBackup,
  type State,
} from './domain';
import {
  accountRequest,
  setActiveAccount,
  type Account,
} from '../account/client';
export type Mode = 'personal' | 'sample';
export function useCollection() {
  const [state, setState] = useState<State>(structuredClone(EMPTY_STATE));
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setMode] = useState<Mode>('personal');
  const [checking, setChecking] = useState(false);
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [legacy, setLegacy] = useState<State | null>(null),
    [legacyError, setLegacyError] = useState('');
  const [undoCount, setUndoCount] = useState(0);
  const current = useRef({
    state,
    account,
    mode,
    revision: '',
    loaded: false,
    generation: 0,
    busy: false,
    persisted: null as string | null,
  });
  const history = useRef<State[]>([]);
  const sync = (next: State) => {
    current.current.state = next;
    setState(next);
  };
  const clear = (invalidateReads = true) => {
    if (invalidateReads) checkRun.current++;
    current.current.loaded = false;
    current.current.generation++;
    current.current.busy = false;
    setSaving(false);
    history.current = [];
    setUndoCount(0);
    setNotice('');
    setError('');
    sync(structuredClone(EMPTY_STATE));
  };
  const checkRun = useRef(0);
  async function refresh(nextMode = current.current.mode, replace = true) {
    const replacing = replace || !current.current.loaded;
    const run = ++checkRun.current;
    const previous = current.current.account;
    const revisionAtStart = current.current.revision;
    setChecking(true);
    if (replacing) {
      clear(false);
      setReady(false);
      setError('');
    }
    current.current.mode = nextMode;
    setMode(nextMode);
    try {
      const { account: next } = await accountRequest<{
        account: Account | null;
      }>('/api/account', {}, null);
      if (run !== checkRun.current) return;
      const changed = next?.id !== previous?.id;
      if (changed && !replacing) {
        clear(false);
        setReady(false);
      }
      current.current.account = next;
      setAccount(next);
      setActiveAccount(next?.id || null);
      if (!replacing && !changed) {
        if (
          next &&
          nextMode === 'personal' &&
          revisionAtStart === current.current.revision &&
          next.revision !== current.current.revision &&
          !current.current.busy
        )
          setError(
            'Your room changed in another tab or device. Your draft is still here. Reload before saving.',
          );
        setChecking(false);
        return;
      }
      if (nextMode === 'sample') {
        const result = readStorage('sample', localStorage);
        if (result.error) throw Error(result.error);
        current.current.persisted = localStorage.getItem('resonance:sample:v1');
        sync(result.state);
      } else if (next) {
        if (!next.revision)
          await accountRequest(
            '/api/account',
            { method: 'POST', body: JSON.stringify({ action: 'open' }) },
            next.id,
          );
        const collection = await accountRequest<{
          state: State;
          revision: string;
        }>('/api/account/collection', {}, next.id);
        if (run !== checkRun.current) return;
        current.current.revision = collection.revision;
        sync(collection.state);
      }
      if (run === checkRun.current) {
        current.current.loaded = true;
        setReady(true);
        setChecking(false);
      }
    } catch (e) {
      if (run !== checkRun.current) return;
      setError(e instanceof Error ? e.message : 'Could not open your room.');
      // Keep an existing room hidden if identity could not be revalidated.
      if (replacing) {
        setReady(true);
        setChecking(false);
      }
    }
  }
  function invalidate() {
    current.current.generation++;
    checkRun.current++;
    setActiveAccount(null);
  }
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      try {
        const raw = localStorage.getItem('resonance:personal:v1');
        if (raw) {
          const old = validateBackup(raw);
          if (old.items.length || old.moments.length || old.capsules.length)
            setLegacy(old);
        }
      } catch {
        setLegacyError(
          'An older collection on this device could not be read. Download it in Account settings for recovery.',
        );
      }
      void refresh();
    });
    const visible = () => {
      if (document.visibilityState === 'hidden') {
        setChecking(true);
      } else void refresh(current.current.mode, false);
    };
    const changed = (event: StorageEvent) => {
      if (
        event.key === 'resonance:account-event' &&
        event.newValue?.startsWith('signout:')
      ) {
        clear();
        setAccount(null);
        current.current.account = null;
        setActiveAccount(null);
        setReady(true);
        setChecking(false);
        return;
      }
      if (
        event.key === 'resonance:account-event' ||
        (current.current.mode === 'sample' &&
          event.key === 'resonance:sample:v1')
      )
        void refresh(current.current.mode, false);
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh(current.current.mode, false);
    };
    const focused = () => {
      if (document.visibilityState === 'visible')
        void refresh(current.current.mode, false);
    };
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('storage', changed);
    window.addEventListener('pageshow', restored);
    return () => {
      disposed = true;
      invalidate();
      window.removeEventListener('focus', focused);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('storage', changed);
      window.removeEventListener('pageshow', restored);
    };
  }, []);
  function broadcast(kind = 'save') {
    try {
      localStorage.setItem(
        'resonance:account-event',
        kind + ':' + crypto.randomUUID(),
      );
    } catch {}
  }
  async function commit(
    next: State,
    label = 'Saved to your account.',
    recovery = false,
    undoing = false,
  ) {
    const c = current.current;
    if (c.busy) {
      setError('A save is still finishing. Please try again in a moment.');
      return false;
    }
    if (!ready || checking || state !== c.state || (!recovery && error)) {
      setError('Reload your room before saving so existing work is protected.');
      return false;
    }
    if (c.mode === 'personal' && !c.account) {
      setError('Sign in to save your music.');
      return false;
    }
    const generation = c.generation,
      before = c.state;
    c.busy = true;
    setSaving(true);
    try {
      let saved: State;
      if (c.mode === 'sample') {
        if (
          !recovery &&
          localStorage.getItem('resonance:sample:v1') !== c.persisted
        )
          throw Error(
            'The sample changed in another tab. Reload before saving.',
          );
        if (recovery)
          localStorage.setItem('resonance:sample:v1', serializeBackup(next));
        else writeStorage('sample', next, localStorage);
        c.persisted = localStorage.getItem('resonance:sample:v1');
        saved = next;
      } else {
        const result = await accountRequest<{ state: State; revision: string }>(
          '/api/account/collection',
          {
            method: 'PUT',
            body: JSON.stringify({ revision: c.revision, state: next }),
          },
          c.account!.id,
        );
        if (generation !== current.current.generation) return false;
        c.revision = result.revision;
        saved = result.state;
        broadcast();
      }
      if (undoing) history.current.pop();
      else {
        history.current.push(before);
        if (history.current.length > 10) history.current.shift();
      }
      setUndoCount(history.current.length);
      sync(saved);
      setError('');
      setNotice(label);
      return true;
    } catch (e) {
      if (generation === current.current.generation)
        setError(
          e instanceof Error
            ? e.message
            : 'Save failed. Your last saved room is unchanged.',
        );
      return false;
    } finally {
      if (generation === current.current.generation) {
        c.busy = false;
        setSaving(false);
      }
    }
  }
  async function undo() {
    const previous = history.current.at(-1);
    if (previous) await commit(previous, 'Change undone.', false, true);
  }
  async function finishOnboarding() {
    const generation = current.current.generation;
    try {
      await accountRequest('/api/account', {
        method: 'POST',
        body: JSON.stringify({ action: 'finish' }),
      });
      if (generation !== current.current.generation) return false;
      if (current.current.account) {
        const next = { ...current.current.account, onboarded: true };
        current.current.account = next;
        setAccount(next);
      }
      return true;
    } catch (e) {
      if (generation === current.current.generation)
        setError((e as Error).message);
      return false;
    }
  }
  async function migrate() {
    if (!legacy) return false;
    if (JSON.stringify(state) === JSON.stringify(legacy)) {
      setLegacy(null);
      setNotice('This device collection is already in your account.');
      return true;
    }
    if (state.items.length || state.moments.length || state.capsules.length) {
      setError(
        'Your account already has music. Export this device collection first; restoring it in Account settings lets you review a replacement.',
      );
      return false;
    }
    const owner = current.current.account?.id,
      generation = current.current.generation;
    if (
      !(await commit(legacy, 'Saving the device collection to your account…'))
    )
      return false;
    try {
      const result = await accountRequest<{ state: State; revision: string }>(
        '/api/account/collection',
        {},
        owner,
      );
      if (
        generation !== current.current.generation ||
        owner !== current.current.account?.id
      )
        return false;
      if (JSON.stringify(result.state) !== JSON.stringify(legacy))
        throw Error(
          'The saved copy changed before verification. Your original device copy is kept.',
        );
      setLegacy(null);
      setNotice(
        'Device collection saved and verified. Your original copy is kept for recovery.',
      );
      return true;
    } catch (e) {
      if (generation === current.current.generation) {
        setNotice('');
        setError(
          e instanceof Error
            ? 'Could not verify the saved copy. Your original is kept. Please reload and review it again.'
            : 'Could not verify the saved copy. Your original is kept.',
        );
      }
      return false;
    }
  }

  async function eraseAccount() {
    const c = current.current;
    if (c.busy || checking || !c.account) return false;
    const generation = c.generation;
    c.busy = true;
    setSaving(true);
    try {
      await accountRequest('/api/account', {
        method: 'POST',
        body: JSON.stringify({
          action: 'delete',
          confirmation: 'DELETE',
          revision: c.revision,
        }),
      });
      if (generation !== current.current.generation) return false;
      clear();
      setAccount(null);
      c.account = null;
      setActiveAccount(null);
      broadcast('signout');
      location.assign('/signout-with-chatgpt?return_to=%2F');
      return true;
    } catch (e) {
      if (generation === current.current.generation)
        setError((e as Error).message);
      return false;
    } finally {
      if (generation === current.current.generation) {
        c.busy = false;
        setSaving(false);
      }
    }
  }
  function signOut() {
    clear();
    setAccount(null);
    current.current.account = null;
    setActiveAccount(null);
    broadcast('signout');
  }
  return {
    state,
    account,
    mode,
    ready,
    checking,
    saving,
    error,
    notice,
    undoCount,
    legacy,
    legacyError,
    commit,
    undo,
    switchMode: (m: Mode) => void refresh(m),
    reload: () => void refresh(),
    finishOnboarding,
    migrate,
    eraseAccount,
    signOut,
    setNotice,
    setError,
    dismissLegacy: () => setLegacy(null),
  };
}
export type CollectionStore = ReturnType<typeof useCollection>;
