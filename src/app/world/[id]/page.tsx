"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const Scene = dynamic(() => import("@/components/Scene"), { ssr: false });

interface WorldData {
  id: string;
  name: string;
  thumbnailUrl?: string;
  splatUrl: string;
  meshUrl: string;
  backgroundMusic?: string;
  walkingSound?: string;
  isPreset: boolean;
}

export default function WorldPage() {
  const params = useParams();
  const [world, setWorld] = useState<WorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure we only render on client side
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchWorld = async () => {
      try {
        const response = await fetch(`/api/world/${params.id}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load world");
        }
        const data = await response.json();
        setWorld(data);
      } catch (err) {
        console.error("Error fetching world:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchWorld();
    }
  }, [params.id, mounted]);

  // Don't render anything until mounted on client
  if (!mounted || loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mb-4 mx-auto"></div>
          <p className="text-white text-xl">Loading world...</p>
        </div>
      </div>
    );
  }

  if (error || !world) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="text-white text-2xl font-bold mb-4">
            Error Loading World
          </h1>
          <p className="text-gray-400 mb-6">{error || "World not found"}</p>
          <Link
            href="/"
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors inline-block"
          >
            Go Back Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Scene
      meshUrl={world.meshUrl}
      splatUrl={world.splatUrl}
      backgroundMusic={world.backgroundMusic}
      walkingSound={world.walkingSound}
    />
  );
}
