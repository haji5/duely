import { FC, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Component that scrolls the window to the top whenever the route changes.
 * This ensures a clean user experience when navigating between pages.
 */
const ScrollToTop: FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
