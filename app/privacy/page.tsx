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
      <p>Updated 8 September 2026.</p>
      <section>
        <h2>Your account and connections</h2>
        <p>
          Resonance uses ChatGPT sign-in to keep your room, listening archive
          and service connections separate. Your sign-in name or email is shown
          only to you. Spotify and Discord connections are optional. Linking
          Discord stores your Discord ID and display name. Linking Spotify
          stores its verified account ID, display name and encrypted access and
          refresh tokens. Your Spotify password stays with Spotify; Resonance
          does not request your email address, change your playlists or control
          playback.
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
          Your records, memories, capsule writing and preferences are saved in
          your account by OpenAI Sites on Cloudflare. Uploaded capsule images
          are kept in private object storage and returned only with your
          authenticated room. The listening archive and encrypted connections
          are also stored there. Spotify and Last.fm receive the requests needed
          for the connections you authorize. Discord receives the replies you
          request. The labelled sample stays in this browser. Older device
          collections are uploaded only when you explicitly choose to move or
          restore them. An original device copy is retained for recovery;
          clearing browser storage removes that copy and the sample, not your
          saved account.
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
          its sync. Account &amp; settings lets you export or clear your room,
          export your listening archive, or delete all Resonance account data
          and sign out. Deletion removes account access immediately and stops
          connections. Image removal is retried automatically if storage is
          temporarily unavailable. Device copies and files you previously
          exported remain under your control.
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
