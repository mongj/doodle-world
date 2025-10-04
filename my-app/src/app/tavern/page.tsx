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
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading tavern scene...</p>
        </div>
      </div>
    );
  }

  return <TavernScene />;
}
