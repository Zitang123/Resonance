import { EMPTY_STATE, validateBackup, type State } from '../resonance/domain';
import { ApiError, database, runtime } from '../karina/server';

type Room = {
  user_id: string;
  revision: string;
  onboarded: number;
  image_key: string | null;
};
export const bucket = () => {
  const value = runtime().ROOM_IMAGES as R2Bucket | undefined;
  if (!value)
    throw new ApiError('Image storage is temporarily unavailable.', 503);
  return value;
};
export async function room(owner: string) {
  return database()
    .prepare('SELECT * FROM rooms WHERE user_id=?')
    .bind(owner)
    .first<Room>();
}
export async function ensureRoom(owner: string) {
  await database()
    .prepare(
      'INSERT OR IGNORE INTO rooms(user_id,revision,updated_at) VALUES (?,?,?)',
    )
    .bind(owner, crypto.randomUUID(), Date.now())
    .run();
  return (await room(owner))!;
}
export function chunks(text: string) {
  const result: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 450000, text.length);
    // Keep a Unicode surrogate pair together across D1 TEXT values.
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    result.push(text.slice(start, end));
    start = end;
  }
  return result;
}
export async function loadCollection(
  owner: string,
  retries = 2,
): Promise<{ revision: string; state: State }> {
  const db = database();
  const result = await db.batch([
    db.prepare('SELECT * FROM rooms WHERE user_id=?').bind(owner),
    db
      .prepare('SELECT data FROM room_chunks WHERE user_id=? ORDER BY part')
      .bind(owner),
  ]);
  const meta = result[0].results[0] as Room | undefined;
  if (!meta) throw new ApiError('Open your Resonance account first.', 409);
  const state = result[1].results.length
    ? (JSON.parse(
        result[1].results.map((r) => (r as { data: string }).data).join(''),
      ) as State)
    : structuredClone(EMPTY_STATE);
  if (meta.image_key) {
    const file = await bucket().get(meta.image_key);
    if (!file) {
      if (retries && (await room(owner))?.revision !== meta.revision)
        return loadCollection(owner, retries - 1);
      throw new ApiError(
        'Your capsule images could not load. Please retry before editing.',
        503,
      );
    }
    const images = await file.json<Record<string, string>>();
    state.capsules = state.capsules.map((c) =>
      Object.hasOwn(images, c.id) ? { ...c, image: images[c.id] } : c,
    );
  }
  return {
    revision: meta.revision,
    state: validateBackup(JSON.stringify(state)),
  };
}
export async function saveCollection(
  owner: string,
  revision: string,
  input: unknown,
) {
  let state: State;
  try {
    state = validateBackup(JSON.stringify(input));
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : 'Invalid collection.',
    );
  }
  const current = await room(owner);
  if (!current || current.revision !== revision)
    throw new ApiError(
      'Your room changed in another tab or device. Reload it before saving.',
      409,
    );
  const next = crypto.randomUUID();
  const images: Record<string, string> = Object.create(null);
  const stored = {
    ...state,
    capsules: state.capsules.map((c) => {
      if (!c.image?.startsWith('data:')) return c;
      images[c.id] = c.image;
      const { image: _image, ...without } = c;
      return without;
    }),
  };
  const imageKey = Object.keys(images).length ? `rooms/${next}.json` : null;
  if (imageKey)
    await database()
      .prepare('INSERT INTO room_image_cleanup(key,due_at) VALUES (?,?)')
      .bind(imageKey, Date.now() + 86400000)
      .run();
  if (imageKey)
    await bucket().put(imageKey, JSON.stringify(images), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'no-store',
      },
    });
  const db = database();
  const guard = 'EXISTS (SELECT 1 FROM rooms WHERE user_id=? AND revision=?)';
  try {
    // The compare, replacement, and revision advance form one D1 transaction.
    const queries = [
      db
        .prepare(`DELETE FROM room_chunks WHERE user_id=? AND ${guard}`)
        .bind(owner, owner, revision),
    ];
    chunks(JSON.stringify(stored)).forEach((data, part) =>
      queries.push(
        db
          .prepare(
            `INSERT INTO room_chunks(user_id,part,data) SELECT ?,?,? WHERE ${guard}`,
          )
          .bind(owner, part, data, owner, revision),
      ),
    );
    queries.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO room_image_cleanup(key,due_at) SELECT image_key,? FROM rooms WHERE user_id=? AND revision=? AND image_key IS NOT NULL`,
        )
        .bind(Date.now(), owner, revision),
    );
    if (imageKey)
      queries.push(
        db
          .prepare(`DELETE FROM room_image_cleanup WHERE key=? AND ${guard}`)
          .bind(imageKey, owner, revision),
      );
    queries.push(
      db
        .prepare(
          'UPDATE rooms SET revision=?,image_key=?,updated_at=? WHERE user_id=? AND revision=?',
        )
        .bind(next, imageKey, Date.now(), owner, revision),
    );
    const result = await db.batch(queries);
    if (!result.at(-1)?.meta.changes)
      throw new ApiError(
        'Your room changed in another tab or device. Reload it before saving.',
        409,
      );
  } catch (error) {
    // An acknowledgement can fail after commit. Never remove a possibly live image.
    const observed = await room(owner).catch(() => undefined);
    if (observed?.revision === next) return { revision: next, state };
    if (observed !== undefined && imageKey && observed?.image_key !== imageKey)
      await bucket()
        .delete(imageKey)
        .catch(() => {});
    throw error;
  }
  await cleanupImages().catch(() => {});
  return { revision: next, state };
}
export async function deleteAccount(owner: string, revision: string) {
  const current = await room(owner);
  if (!current || current.revision !== revision)
    throw new ApiError('Your room changed. Reload before deleting.', 409);
  const db = database();
  const guard = 'EXISTS (SELECT 1 FROM rooms WHERE user_id=? AND revision=?)';
  const queries = [
    'room_chunks',
    'oauth_states',
    'connections',
    'sync_jobs',
    'archive_owners',
    'listens',
  ].map((table) =>
    db
      .prepare(`DELETE FROM ${table} WHERE user_id=? AND ${guard}`)
      .bind(owner, owner, revision),
  );
  queries.push(
    db
      .prepare(
        'INSERT OR IGNORE INTO room_image_cleanup(key,due_at) SELECT image_key,? FROM rooms WHERE user_id=? AND revision=? AND image_key IS NOT NULL',
      )
      .bind(Date.now(), owner, revision),
  );
  queries.push(
    db
      .prepare('DELETE FROM rooms WHERE user_id=? AND revision=?')
      .bind(owner, revision),
  );
  const result = await db.batch(queries);
  if (!result.at(-1)?.meta.changes)
    throw new ApiError('Your room changed. Reload before deleting.', 409);
  // The durable queue retains cleanup work if object storage is temporarily unavailable.
  await cleanupImages().catch(() => {});
}

export async function cleanupImages() {
  const db = database();
  const pending = await db
    .prepare(
      'SELECT key FROM room_image_cleanup WHERE due_at<=? AND NOT EXISTS (SELECT 1 FROM rooms WHERE image_key=key) ORDER BY due_at LIMIT 3',
    )
    .bind(Date.now())
    .all<{ key: string }>();
  for (const file of pending.results) {
    await bucket().delete(file.key);
    await db
      .prepare('DELETE FROM room_image_cleanup WHERE key=?')
      .bind(file.key)
      .run();
  }
}
