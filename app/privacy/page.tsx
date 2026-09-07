import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Your data — Resonance' };
export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <Link className="text-button" href="/?space=Karina">
        ← Back to Resonance
      </Link>
      <h1>Your music. Your data.</h1>
      <p>Updated 7 September 2026.</p>
      <section>
        <h2>Your account and connections</h2>
        <p>
          Resonance uses your signed-in account to keep listening archives and
          service connections separate. Linking Discord stores your Discord ID
          and display name. Linking Spotify stores its verified account ID,
          display name and encrypted access and refresh tokens. Your Spotify
          password stays with Spotify; Resonance does not request your email
          address, change your playlists or control playback.
        </p>
      </section>
      <section>
        <h2>Spotify playback</h2>
        <p>
          Resonance requests Spotify playback when you open or refresh the
          playback panel, or ask Karina what is playing. These playback
          snapshots are displayed temporarily and are not added to the
          historical archive or used to calculate listening statistics. The
          connection remains available between visits until it is revoked or
          Spotify requires renewed permission.
        </p>
      </section>
      <section>
        <h2>Listening history</h2>
        <p>
          You can separately authorize a Last.fm history connection or import a
          supported listening-history file. Resonance stores the selected
          records and calculates your archive statistics. Last.fm and imported
          records retain their source and available date range. A Spotify
          connection alone does not supply lifetime history.
        </p>
      </section>
      <section>
        <h2>What Discord can see</h2>
        <p>
          When you run a listening command, Karina posts the requested result
          into that Discord conversation. Other participants can see it in a
          server channel or group chat. Use Karina’s own direct messages when
          you want the result in a one-to-one conversation. Connection and
          account-control replies are visible only to you. Resonance does not
          read your ordinary Discord messages.
        </p>
      </section>
      <section>
        <h2>Storage and service providers</h2>
        <p>
          The listening archive and encrypted connections are stored by the
          OpenAI Sites hosting service on Cloudflare. Spotify and Last.fm
          receive the requests needed for the connections you authorize. Discord
          receives the replies you request. Crate, Tonight, Atlas and Capsules
          currently remain in this browser’s local storage; they are not yet
          synchronized to your account.
        </p>
        <p>
          Resonance does not add advertising trackers or send music data into an
          AI model. Hosting services may retain operational request logs.
          Application error logs contain fixed error classifications rather than
          connection secrets or listening records.
        </p>
      </section>
      <section>
        <h2>Disconnect, export or delete</h2>
        <p>
          Open Karina in Resonance to disconnect a service, export your archive
          or delete a history source. Disconnecting Spotify deletes its stored
          identity and tokens and stops future playback checks. Disconnecting
          Last.fm stops future sync; previously imported records remain until
          you delete that history source. Deleting Last.fm history also stops
          its sync. Export or clear browser-local collections through Settings
          &amp; backup.
        </p>
        <p>
          You can also revoke access in{' '}
          <a
            href="https://www.spotify.com/account/apps/"
            target="_blank"
            rel="noreferrer"
          >
            Spotify’s app settings
          </a>{' '}
          or the connected service’s account settings. Messages already posted
          in Discord are governed by Discord’s message and privacy controls.
        </p>
      </section>
    </main>
  );
}
