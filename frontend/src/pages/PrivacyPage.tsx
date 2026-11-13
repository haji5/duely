import React from 'react';
import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta';
import { ISSUES_URL } from '../components/Footer';

const linkClass = 'font-semibold text-themed-primary underline decoration-[color:var(--border-secondary)] decoration-2 underline-offset-4 hover:decoration-[color:var(--accent-primary)]';

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section aria-labelledby={id} className="space-y-3">
    <h2 id={id} className="font-display text-[1.9rem] font-extrabold leading-tight text-themed-primary">{title}</h2>
    {children}
  </section>
);

/** What Duely stores, what other sites see, and how to delete it. Keep in step with the code. */
const PrivacyPage: React.FC = () => (
  <div className="page max-w-3xl pb-24 pt-10 sm:pt-14">
    <PageMeta
      title="Privacy | Duely"
      description="What Duely stores about players and bracket makers, which other sites see what when you play, and how to delete your data."
    />
    <header className="mb-10">
      <h1 className="font-display text-[3rem] font-black leading-none text-themed-primary sm:text-[3.5rem]">Privacy</h1>
      <p className="mt-3 max-w-xl text-lg text-themed-secondary">
        Duely keeps as little as a voting game can. There are no ads, no analytics and no tracking cookies of its own.
      </p>
    </header>

    <div className="space-y-10 text-[1.05rem] leading-relaxed text-themed-primary">
      <Section id="stored" title="What Duely stores">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Signing in.</strong> Sign-in goes through Google, via Firebase Authentication. Duely’s server keeps
            only your Firebase user ID, next to the brackets you make, the runs you finish and the reports you send. It
            is never shown to anyone. Your name, email address and picture stay with Google and in your browser.
          </li>
          <li>
            <strong>Brackets.</strong> A bracket’s name, description, category and entries (titles and links) are
            public.
          </li>
          <li>
            <strong>Runs.</strong> A finished run is saved: which entries played, who beat whom and when. A run can
            carry a display name and a comment if you add them, and both are public on the bracket’s results page.
            Guests’ runs are saved without any account. A guest’s run that doesn’t count toward the rankings (played
            faster than the game allows, or past the day’s limit for that bracket) is deleted within a day.
          </li>
          <li>
            <strong>Reports.</strong> A report keeps the reason and any details you wrote. If you were signed in, your
            user ID is kept with it so moderators can tell repeated reports apart; it is never shown.
          </li>
          <li>
            <strong>Your network address.</strong> Rate limits count requests per IPv4 address, or per IPv6 network,
            for at most a day. The web server’s access log records each request with its address, time and browser;
            those logs are kept only as long as needed to run the site. Addresses are never stored with runs or
            brackets.
          </li>
          <li>
            <strong>Backups.</strong> The database is backed up every night and each backup is kept for 14 days, so
            something deleted stays in the backups for up to two weeks.
          </li>
        </ul>
      </Section>

      <Section id="browser" title="What your browser keeps">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Local storage</strong>, until you clear it: your theme, whether you were signed in, and a draft of
            a bracket you are making, so it survives closing the tab.
          </li>
          <li>
            <strong>Session storage</strong>, until the tab closes: a guest’s own runs, and a run in progress, so a
            reload doesn’t lose it.
          </li>
          <li>
            <strong>IndexedDB</strong>, only once you sign in: Firebase keeps your sign-in session there.
          </li>
        </ul>
      </Section>

      <Section id="other-sites" title="What other sites see">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>YouTube.</strong> Videos play in YouTube’s privacy-enhanced player (youtube-nocookie.com), which sets
            no cookies until you press play. Once a video plays, YouTube’s own privacy policy applies. Thumbnails are
            loaded from YouTube’s image server.
          </li>
          <li>
            <strong>Spotify.</strong> Songs from Spotify play in Spotify’s embedded player, which loads from Spotify and
            may set Spotify’s cookies.
          </li>
          <li>
            <strong>Images and audio files</strong> load straight from wherever the bracket’s maker linked them, so that
            site sees your network address. Duely tells it nothing about which page you were on.
          </li>
          <li>
            <strong>Making a bracket.</strong> Pasting a YouTube or Spotify link asks that site for the title, from your
            browser. Importing a playlist and finding videos for it is done by Duely’s server, so those sites never see
            your address.
          </li>
          <li>
            <strong>Google</strong> sees your sign-in, as with any “Sign in with Google”.
          </li>
        </ul>
      </Section>

      <Section id="delete" title="Deleting your data">
        <p>
          Signed in, open the account menu and choose <span className="font-semibold">Delete my data</span>. Brackets
          nobody else has played are deleted. Your runs stay in the rankings, so other people’s results don’t change,
          but they lose your user ID, your display names and your comments. Brackets other people have played stay up
          without an owner. Your Google account itself isn’t Duely’s to delete.
        </p>
        <p>
          Played as a guest? Your runs were never linked to you. Closing the tab clears the list of them in your
          browser.
        </p>
      </Section>

      <Section id="questions" title="Questions">
        <p>
          Duely is a hobby project; see <Link to="/about" className={linkClass}>how it works</Link>. For anything about
          your data, <a href={ISSUES_URL} className={linkClass}>open an issue on GitHub</a> (don’t post personal details
          there; say how to reach you instead).
        </p>
      </Section>
    </div>
  </div>
);

export default PrivacyPage;
