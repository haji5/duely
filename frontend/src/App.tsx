import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SessionBattleProvider } from './contexts/SessionBattleContext';
import HomePage from './pages/HomePage';
import BracketPage from './pages/BracketPage';
import ResultsPage from './pages/ResultsPage';
import CustomBracketPage from './pages/CustomBracketPage';
import BrowsePage from './pages/BrowsePage';
import Navbar from './components/Navbar';

// Component to handle logout functionality
const LogoutHandler: React.FC = () => {
  // This will be handled in the Navbar component instead
  return null;
};

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <SessionBattleProvider>
            <div className="min-h-screen bg-themed-primary">
              <Navbar />
              <LogoutHandler />
              <main>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/browse" element={<BrowsePage />} />
                  <Route path="/create" element={<CustomBracketPage />} />
                  <Route path="/bracket/:id" element={<BracketPage />} />
                  <Route path="/results/:id" element={<ResultsPage />} />
                </Routes>
              </main>
            </div>
          </SessionBattleProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
