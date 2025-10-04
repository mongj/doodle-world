'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const TavernScene = dynamic(() => import('@/components/TavernScene'), {
  ssr: false,
});

export default function TavernPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-purple-600 mx-auto"></div>
          </div>
          <h2 className="text-3xl font-serif italic text-gray-800 mb-2">
            Welcome to the Tavern
          </h2>
          <p className="text-lg text-gray-600">
            Preparing your adventure...
          </p>
        </div>
      </div>
    );
  }

  return <TavernScene />;
}
