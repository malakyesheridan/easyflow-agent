import { useEffect, useState } from 'react';

const MOBILE_MAX_WIDTH = 767;

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_MAX_WIDTH;
  });

  useEffect(() => {
    const update = () => {
      setIsMobile(window.innerWidth <= MOBILE_MAX_WIDTH);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile;
}
