import React from 'react';
import { motion } from 'framer-motion';
import { bracketApi } from '../services/api';
import { Bracket } from '../types';
import { Link, useNavigate } from "react-router-dom";

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [brackets, setBrackets] = React.useState<Bracket[]>([]);
  const [popularBrackets, setPopularBrackets] = React.useState<Bracket[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [allBrackets, popular] = await Promise.all([
          bracketApi.getAllBrackets(),
          bracketApi.getPopularBrackets()
        ]);
        setBrackets(allBrackets);
        setPopularBrackets(popular);
      } catch (error) {
        console.error('Error fetching brackets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl font-bold text-primary mb-6">
          Choose Your Champion
        </h1>
        <p className="text-xl text-secondary max-w-3xl mx-auto mb-8">
          Battle it out in tournament-style brackets! Compare songs, videos, or images head-to-head
          until only one remains victorious. Preview media on hover and watch the competition unfold.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/create')}
            className="btn btn-primary text-lg px-8 py-4 cursor-pointer"
          >
            Create Custom Bracket
          </button>
          <button
            onClick={() => navigate('/browse')}
            className="btn btn-secondary text-lg px-8 py-4 cursor-pointer"
          >
            Browse All Brackets
          </button>
        </div>
      </motion.div>

      {/* Popular Brackets */}
      {popularBrackets.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold text-primary mb-8">Popular Battles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {popularBrackets.slice(0, 6).map((bracket, index) => (
              <motion.div
                key={bracket.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <BracketCard bracket={bracket} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* All Brackets */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-primary">All Brackets</h2>
          <Link
            to="/browse"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-secondary border border-primary rounded-lg text-secondary hover:bg-tertiary hover:border-secondary transition-all duration-200 shadow-primary hover:shadow-secondary"
          >
            <span className="text-sm font-medium">View All</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brackets.map((bracket, index) => (
            <motion.div
              key={bracket.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <BracketCard bracket={bracket} />
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
};

const BracketCard: React.FC<{ bracket: Bracket }> = ({ bracket }) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'song':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        );
      case 'video':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case 'image':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
    }
  };

  return (
    <Link to={`/bracket/${bracket.id}`}>
      <div className="card hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 text-primary-600">
              {getTypeIcon(bracket.type)}
              <span className="text-sm font-medium capitalize">{bracket.type}</span>
            </div>
            <div className="bg-tertiary text-secondary px-2 py-1 rounded-full text-xs">
              Battle
            </div>
          </div>
          <h3 className="text-xl font-semibold text-primary mb-2">{bracket.name}</h3>
          <p className="text-secondary text-sm mb-4 line-clamp-2">{bracket.description}</p>
          <div className="flex items-center justify-between">
            <span className="text-primary-600 font-medium">Start Battle →</span>
            <div className="text-xs text-tertiary">
              {new Date(bracket.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default HomePage;
