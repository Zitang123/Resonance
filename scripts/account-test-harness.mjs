import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

export const root = resolve(process.argv[2] || process.cwd());
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');
export const domain = await import(
  pathToFileURL(resolve(root, 'lib/resonance/domain.ts'))
);
export const history = await import(
  pathToFileURL(resolve(root, 'lib/karina/history.ts'))
);
export const budget = await import(
  pathToFileURL(resolve(root, 'lib/karina/storage-budget.ts'))
);

export function load(relative, imports, extra = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(
    readFileSync(resolve(root, relative), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require(id) {
      if (!(id in imports)) throw Error(`Unexpected import: ${id}`);
      return imports[id];
    },
    crypto,
    structuredClone,
    Response,
    Request,
    URL,
    Date,
    TextEncoder,
    console,
    queueMicrotask,
    ...extra,
  });
  return module.exports;
}

export function backend() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync(resolve(root, 'drizzle'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync(resolve(root, 'drizzle', file), 'utf8'));
  const flags = { failDelete: false, failAck: false, beforeBatch: null };
  const images = new Map();
  function execute(query) {
    const results = sql.prepare(query.sql).all(...query.args);
    return {
      results,
      meta: { changes: Number(sql.prepare('SELECT changes() n').get().n) },
    };
  }
  const db = {
    prepare(text) {
      return {
        sql: text,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          return sql.prepare(text).get(...this.args) ?? null;
        },
        async run() {
          return execute(this);
        },
        async all() {
          return execute(this);
        },
      };
    },
    async batch(queries) {
      flags.beforeBatch?.();
      sql.exec('BEGIN');
      let result;
      try {
        result = queries.map(execute);
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
      if (flags.failAck) {
        flags.failAck = false;
        throw Error('Injected lost D1 acknowledgement');
      }
      return result;
    },
  };
  const server = {
    ApiError: class extends Error {
      constructor(message, status = 400) {
        super(message);
        this.status = status;
      }
    },
    database: () => db,
    runtime: () => ({
      ROOM_IMAGES: {
        async put(key, value) {
          images.set(key, value);
        },
        async delete(key) {
          if (flags.failDelete) throw Error('Injected R2 outage');
          images.delete(key);
        },
        async get(key) {
          return images.has(key)
            ? {
                async json() {
                  return JSON.parse(images.get(key));
                },
              }
            : null;
        },
      },
    }),
    configured: () => true,
    setting: () => 'https://room.test',
    provider: (value) => value,
    user: (request) => request.headers.get('oai-authenticated-user-id'),
    failure: (error) =>
      Response.json({ error: error.message }, { status: error.status || 503 }),
  };
  const collection = load('lib/account/collection.ts', {
    '../resonance/domain': domain,
    '../karina/server': server,
  });
  return { sql, flags, images, server, collection };
}

// A deterministic hook runner, not a React DOM or browser accessibility test.
// It exercises the actual hook's async guards with controllable request ordering.
export function hook(request) {
  const slots = [],
    effects = [],
    cleanups = [],
    listeners = new Map(),
    navigations = [];
  let cursor = 0,
    activeAccount = null,
    store;
  const react = {
    useState(initial) {
      const n = cursor++;
      if (!(n in slots)) slots[n] = initial;
      return [
        slots[n],
        (value) => {
          slots[n] = typeof value === 'function' ? value(slots[n]) : value;
        },
      ];
    },
    useRef(initial) {
      const n = cursor++;
      return (slots[n] ??= { current: initial });
    },
    useEffect(fn) {
      const n = cursor++;
      if (!(n in slots)) {
        slots[n] = true;
        effects.push(fn);
      }
    },
  };
  const add = (name, fn) => {
    const all = listeners.get(name) || [];
    all.push(fn);
    listeners.set(name, all);
  };
  const remove = (name, fn) =>
    listeners.set(
      name,
      (listeners.get(name) || []).filter((f) => f !== fn),
    );
  const loaded = load(
    'lib/resonance/use-collection.ts',
    {
      react,
      './domain': domain,
      '../account/client': {
        setActiveAccount(value) {
          activeAccount = value;
        },
        accountRequest(url, options = {}, owner = activeAccount) {
          return request(url, options, owner);
        },
      },
    },
    {
      localStorage: { getItem: () => null, setItem() {} },
      document: {
        visibilityState: 'visible',
        addEventListener: add,
        removeEventListener: remove,
      },
      window: { addEventListener: add, removeEventListener: remove },
      location: {
        assign(url) {
          navigations.push(url);
        },
      },
    },
  );
  function render() {
    cursor = 0;
    store = loaded.useCollection();
    return store;
  }
  return {
    render,
    mount() {
      render();
      for (const effect of effects) cleanups.push(effect());
    },
    async flush() {
      for (let i = 0; i < 6; i++) {
        await new Promise(setImmediate);
        render();
      }
      return store;
    },
    fire(name, event = {}) {
      for (const fn of listeners.get(name) || []) fn(event);
    },
    active: () => activeAccount,
    navigations,
    dispose() {
      for (const cleanup of cleanups) cleanup?.();
    },
  };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
