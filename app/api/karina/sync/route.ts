import { failure, json, mutation, user } from '@/lib/karina/server';
import { queueSync, syncPage } from '@/lib/karina/sync';
export async function POST(request: Request) {
  try {
    const owner = user(request);
    mutation(request);
    await queueSync(owner);
    return json(await syncPage(owner));
  } catch (error) {
    return failure(error);
  }
}
