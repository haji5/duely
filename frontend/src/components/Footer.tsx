import * as React from 'react';
import { Link } from 'react-router-dom';

export const REPO_URL = 'https://github.com/haji5/duely';
export const LICENSE_URL = `${REPO_URL}/blob/master/LICENSE`;
export const ISSUES_URL = `${REPO_URL}/issues`;

// min-h-6: standalone links get a 24 px target (WCAG 2.2 target size)
const linkClass = 'inline-flex min-h-6 items-center rounded-md font-semibold text-themed-secondary hover:text-themed-primary';

const Footer: React.FC = () => (
  <footer className="border-t border-themed-primary">
    <div className="page flex flex-col gap-4 py-8 text-[0.95rem] sm:flex-row sm:items-center sm:justify-between">
      <p className="text-themed-tertiary">
        Duely is a free, noncommercial hobby project by Tobias Richardson.
      </p>
      <nav aria-label="Footer">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li><Link to="/about" className={linkClass}>How Duely works</Link></li>
          <li><a href={REPO_URL} className={linkClass}>GitHub</a></li>
          <li><a href={LICENSE_URL} className={linkClass}>License</a></li>
        </ul>
      </nav>
    </div>
  </footer>
);

export default Footer;
