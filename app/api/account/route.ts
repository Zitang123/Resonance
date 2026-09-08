import {
  ApiError,
  body,
  failure,
  json,
  mutation,
  user,
} from '@/lib/karina/server';
import { deleteAccount, ensureRoom, room } from '@/lib/account/collection';
import { database } from '@/lib/karina/server';
export async function GET(request: Request) {
  try {
    if (!request.headers.get('oai-authenticated-user-id'))
      return json({ account: null });
    const id = user(request);
    let name = request.headers.get('oai-authenticated-user-full-name') || '';
    if (
      request.headers.get('oai-authenticated-user-full-name-encoding') ===
      'percent-encoded-utf-8'
    ) {
      try {
        name = decodeURIComponent(name);
      } catch {
        name = '';
      }
    }
    const saved = await room(id);
    return json({
      account: {
        id,
        name:
          name.slice(0, 200) ||
          request.headers.get('oai-authenticated-user-email') ||
          'Your account',
        revision: saved?.revision || null,
        onboarded: !!saved?.onboarded,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const owner = user(request);
    mutation(request);
    const data = (await body(request, 2000)) as Record<string, unknown>;
    if (data.action === 'open') {
      const saved = await ensureRoom(owner);
      return json({ revision: saved.revision });
    }
    if (data.action === 'finish') {
      await database()
        .prepare('UPDATE rooms SET onboarded=1 WHERE user_id=?')
        .bind(owner)
        .run();
      return json({ complete: true });
    }
    if (
      data.action === 'delete' &&
      data.confirmation === 'DELETE' &&
      typeof data.revision === 'string'
    ) {
      await deleteAccount(owner, data.revision);
      return json({ deleted: true });
    }
    throw new ApiError('Choose a valid account action.');
  } catch (error) {
    return failure(error);
  }
}
