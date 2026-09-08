import {
  ApiError,
  body,
  failure,
  json,
  mutation,
  user,
} from '@/lib/karina/server';
import { loadCollection, saveCollection } from '@/lib/account/collection';
export async function GET(request: Request) {
  try {
    return json(await loadCollection(user(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const owner = user(request);
    mutation(request);
    if (request.headers.get('x-resonance-account') !== owner)
      throw new ApiError(
        'Your sign-in changed. Reopen your room before saving.',
        409,
      );
    const data = (await body(request, 17 * 1024 * 1024)) as Record<
      string,
      unknown
    >;
    if (
      typeof data.revision !== 'string' ||
      !data.state ||
      Object.keys(data).some((k) => !['revision', 'state'].includes(k))
    )
      throw new ApiError('Invalid collection request.');
    return json(await saveCollection(owner, data.revision, data.state));
  } catch (error) {
    return failure(error);
  }
}
