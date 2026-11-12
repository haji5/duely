import React from 'react';
import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta';
import { ISSUES_URL, LICENSE_URL, REPO_URL } from '../components/Footer';

const linkClass = 'font-semibold text-themed-primary underline decoration-[color:var(--border-secondary)] decoration-2 underline-offset-4 hover:decoration-[color:var(--accent-primary)]';

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section aria-labelledby={id} className="space-y-3">
    <h2 id={id} className="font-display text-[1.9rem] font-extrabold leading-tight text-themed-primary">{title}</h2>
    {children}
  </section>
);

const AboutPage: React.FC = () => (
  <div className="page max-w-3xl pb-24 pt-10 sm:pt-14">
    <PageMeta
      title="How Duely works: brackets, voting and rankings | Duely"
      description="How Duely brackets work: picking one of two each match, how the community ranking is calculated, what data is stored, the comment rules and the license."
    />
    <header className="mb-10">
      <h1 className="font-display text-[3rem] font-black leading-none text-themed-primary sm:text-[3.5rem]">
        How Duely works
      </h1>
      <p className="mt-3 max-w-xl text-lg text-themed-secondary">
        Duely is a free bracket maker for songs, YouTube videos and images. Here is how it works and what it keeps.
      </p>
    </header>

    <div className="space-y-10 text-[1.05rem] leading-relaxed text-themed-primary">
      <Section id="what-is-a-bracket" title="What is a bracket?">
        <p>
          A bracket is a knockout tournament. Its entries are shuffled and paired up, and the winner of each pair moves
          on to the next round until one champion is left. Anyone can play a bracket someone else made, and signed-in
          users can <Link to="/create" className={linkClass}>make their own</Link> by pasting links or importing a
          Spotify playlist.
        </p>
      </Section>

      <Section id="how-voting-works" title="How does voting work?">
        <p>
          You see two entries at a time and pick the one you like more. Before you start, you choose a bracket size. A
          smaller size plays a random selection of the entries, drawn by the server; a larger one gives some entries a
          bye, a free pass into the next round, and nobody gets more than one. A finished bracket is called a run, and
          each run is saved.
        </p>
      </Section>

      <Section id="how-rankings-work" title="How are the rankings calculated?">
        <p>
          Each run places every entry it included by how far it got. The champion scores 100 and the runner-up comes
          next; entries knocked out in the same round did equally well, so they share a place (say 5th to 8th) and a
          score. Scores are spread from 100 down to 0 by place, so runs of different sizes count the same.
        </p>
        <p>
          An entry’s score is its average over every run it appeared in, eased towards the middle while it has only been
          in a few runs, so one lucky run can’t put it on top. The community ranking is sorted by that score. The win
          rate shown next to it counts only matches that were actually played. Ties go to the higher win rate, then to
          the entry that has been in more runs.
        </p>
        <p>
          To keep one person from steering a ranking, only a limited number of each player’s runs of a bracket count
          towards it per day. Every run is still saved, and yours stay in your history.
        </p>
      </Section>

      <Section id="guests-and-accounts" title="Do I need an account?">
        <p>
          No. Guests can play any bracket, and their runs count towards the community ranking. A guest’s own runs are
          only listed for as long as the browser tab stays open. Signing in with Google lets you create brackets and
          keeps your run history across devices.
        </p>
      </Section>

      <Section id="data" title="What data does Duely store?">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Sign-in goes through Google via Firebase Authentication. Duely keeps your Firebase user ID with the
            brackets and runs you create; it is never shown publicly.
          </li>
          <li>
            When you finish a run you can add a display name and a comment. Both are public on the bracket’s results
            page.
          </li>
          <li>
            Guest runs are saved without an account. The list of your own runs lives in your browser’s session storage
            and disappears when the tab closes. Your theme and sign-in session are kept in local browser storage.
          </li>
          <li>Your IP address is used briefly to rate-limit requests. There are no ads and no analytics.</li>
          <li>
            Signed in, you can delete your data from the account menu. Brackets nobody else has played are deleted;
            your runs stay in the rankings anonymously, without your name or comments.
          </li>
        </ul>
      </Section>

      <Section id="comment-rules" title="What are the comment rules, and how do I report a problem?">
        <p>
          Comments are plain text, up to 500 characters. Keep them about the bracket: no harassment, hate, spam, other
          people’s personal details or anything illegal. Comments and brackets that break these rules can be removed.
        </p>
        <p>
          To report a bracket, use <span className="font-semibold text-themed-primary">Report</span> below its
          description; to report a comment, use <span className="font-semibold text-themed-primary">Report</span> next
          to it. You don’t need an account. A moderator looks at every report. People who made a bracket can delete it
          from <span className="font-semibold text-themed-primary">My brackets</span>.
        </p>
        <p>
          Found a bug? <a href={ISSUES_URL} className={linkClass}>Open an issue on GitHub</a>.
        </p>
      </Section>

      <Section id="license" title="Who runs Duely, and can I use the code?">
        <p>
          Duely is a noncommercial hobby project by Tobias Richardson. The <a href={REPO_URL} className={linkClass}>source
          code is on GitHub</a> under the <a href={LICENSE_URL} className={linkClass}>PolyForm Noncommercial License
          1.0.0</a>: you can use, change and share it for personal, study, research and other noncommercial purposes,
          but not to sell it or build a paid product on it.
        </p>
      </Section>
    </div>
  </div>
);

export default AboutPage;
