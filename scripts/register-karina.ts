import { KARINA_COMMANDS } from '../lib/karina/protocol.ts';
import { createDiscordRequest } from '../lib/karina/discord-request.ts';
// Dry-run is the default. Publishing explicitly adds/updates only Karina's named commands.
if (!process.argv.includes('--publish')) {
  process.stdout.write(JSON.stringify(KARINA_COMMANDS, null, 2) + '\n');
} else {
  const clientId = process.env.DISCORD_CLIENT_ID,
    secret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !secret)
    throw Error(
      'Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in the shell environment.',
    );
  const request = createDiscordRequest();
  const tokenResponse = await request(
    'https://discord.com/api/v10/oauth2/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'applications.commands.update',
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!tokenResponse.ok)
    throw Error(
      `Discord command authorization failed (${tokenResponse.status}).`,
    );
  const token = (await tokenResponse.json()) as { access_token: string };
  if (!token.access_token)
    throw Error('Discord did not return a command token.');
  for (const command of KARINA_COMMANDS) {
    const response = await request(
      `https://discord.com/api/v10/applications/${clientId}/commands`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw Error(
        `Command ${command.name} could not register (${response.status}). Retry later; completed commands are safe to repeat.`,
      );
    process.stdout.write(`Registered /${command.name}\n`);
  }
}
