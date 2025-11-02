import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SessionBattleProvider } from './contexts/SessionBattleContext';
import HomePage from './pages/HomePage';
import BracketPage from './pages/BracketPage';
import ResultsPage from './pages/ResultsPage';
import CustomBracketPage from './pages/CustomBracketPage';
import BrowsePage from './pages/BrowsePage';
import SettingsPage from './pages/SettingsPage';
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';

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
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/browse" element={<BrowsePage />} />
                  <Route path="/create" element={<CustomBracketPage />} />
                  <Route path="/bracket/:id" element={<BracketPage />} />
                  <Route path="/results/:id" element={<ResultsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
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
