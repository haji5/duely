import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SessionBattleProvider } from './contexts/SessionBattleContext';
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';
import Footer from './components/Footer';
import { PageLoader } from './components/BracketCard';

// Each page is its own chunk, so the first visit only downloads what it shows.
const HomePage = React.lazy(() => import('./pages/HomePage'));
const BrowsePage = React.lazy(() => import('./pages/BrowsePage'));
const CustomBracketPage = React.lazy(() => import('./pages/CustomBracketPage'));
const BracketPage = React.lazy(() => import('./pages/BracketPage'));
const ResultsPage = React.lazy(() => import('./pages/ResultsPage'));
const AboutPage = React.lazy(() => import('./pages/AboutPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <SessionBattleProvider>
            <ScrollToTop />
            <div className="flex min-h-screen flex-col bg-themed-primary">
              <Navbar />
              <main className="flex-1">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/browse" element={<BrowsePage />} />
                    <Route path="/create" element={<CustomBracketPage />} />
                    <Route path="/bracket/:id" element={<BracketPage />} />
                    <Route path="/results/:id" element={<ResultsPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </main>
              <Footer />
            </div>
          </SessionBattleProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
