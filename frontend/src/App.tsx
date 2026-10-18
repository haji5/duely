import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SessionBattleProvider } from './contexts/SessionBattleContext';
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';
import { PageLoader } from './components/BracketCard';

// Each page is its own chunk, so the first visit only downloads what it shows.
const HomePage = React.lazy(() => import('./pages/HomePage'));
const BrowsePage = React.lazy(() => import('./pages/BrowsePage'));
const CustomBracketPage = React.lazy(() => import('./pages/CustomBracketPage'));
const BracketPage = React.lazy(() => import('./pages/BracketPage'));
const ResultsPage = React.lazy(() => import('./pages/ResultsPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <SessionBattleProvider>
            <ScrollToTop />
            <div className="min-h-screen bg-themed-primary">
              <Navbar />
              <main>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/browse" element={<BrowsePage />} />
                    <Route path="/create" element={<CustomBracketPage />} />
                    <Route path="/bracket/:id" element={<BracketPage />} />
                    <Route path="/results/:id" element={<ResultsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
          </SessionBattleProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
