import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      {/* Hero Section */}
      <header className="px-8 py-16 text-center">
        <h1 className="text-6xl md:text-7xl font-serif italic text-gray-800 mb-4">
          Doodle World
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Step into an interactive 3D tavern where physics meets fantasy
        </p>
      </header>

      {/* Main Content */}
      <main className="px-8 pb-20">
        {/* Features Grid */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {/* Card 1 - Physics */}
          <div className="bg-gradient-to-br from-orange-400 to-orange-500 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-white rounded-2xl p-6 mb-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Realistic Physics
              </h2>
              <p className="text-gray-600">
                Powered by Rapier physics engine with dynamic collisions, grab mechanics, and interactive objects
              </p>
            </div>
          </div>

          {/* Card 2 - Graphics */}
          <div className="bg-gradient-to-br from-pink-400 to-pink-500 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-white rounded-2xl p-6 mb-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Stunning Graphics
              </h2>
              <p className="text-gray-600">
                Photorealistic environments using Gaussian Splats with Three.js rendering
              </p>
            </div>
          </div>

          {/* Card 3 - Characters */}
          <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-white rounded-2xl p-6 mb-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Animated Characters
              </h2>
              <p className="text-gray-600">
                Meet the tavern locals with skeletal animations and interactive voice lines
              </p>
            </div>
          </div>

          {/* Card 4 - Audio */}
          <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-white rounded-2xl p-6 mb-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Spatial Audio
              </h2>
              <p className="text-gray-600">
                Immersive 3D sound with distance-based attenuation and character voices
              </p>
            </div>
          </div>

          {/* Card 5 - Controls */}
          <div className="bg-gradient-to-br from-blue-400 to-blue-500 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-white rounded-2xl p-6 mb-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Intuitive Controls
              </h2>
              <p className="text-gray-600">
                First-person movement, jumping, flying, shooting projectiles, and object grabbing
              </p>
            </div>
          </div>

          {/* Card 6 - Tech */}
          <div className="bg-gradient-to-br from-purple-400 to-purple-500 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-white rounded-2xl p-6 mb-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Modern Stack
              </h2>
              <p className="text-gray-600">
                Built with Next.js 15, TypeScript, and cutting-edge 3D web technologies
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Link
            href="/tavern"
            className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xl font-bold px-12 py-6 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            Enter the Tavern →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-600 text-sm">
        <p>Built with Next.js, Three.js, and Rapier Physics</p>
      </footer>
    </div>
  );
}
