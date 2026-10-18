import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => (
  <div className="page flex min-h-[60vh] flex-col items-start justify-center py-16">
    <h1 className="font-display text-[2.75rem] font-black leading-none">Page not found</h1>
    <p className="mt-3 text-lg text-themed-secondary">The link may be wrong or out of date.</p>
    <div className="mt-8 flex flex-wrap gap-3">
      <Link to="/" className="btn btn-primary">Go to home</Link>
      <Link to="/browse" className="btn btn-secondary">Browse brackets</Link>
    </div>
  </div>
);

export default NotFoundPage;
