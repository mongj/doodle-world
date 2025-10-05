"use client";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 flex flex-col items-center justify-center px-8 py-16">
      {/* Logo */}
      <div className="mb-12 max-w-5xl w-full">
        <img
          src="/logo transparent.png"
          alt="Doodle World"
          className="w-full"
        />
      </div>

      {/* Main Message Card */}
      <div
        className="bg-white border-4 border-black rounded-3xl p-12 max-w-3xl w-full text-center"
        style={{
          boxShadow: "12px 12px 0px 0px rgba(0, 0, 0, 1)",
        }}
      >
        <div className="mb-6">
          <div className="text-6xl mb-4">💜</div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
            Thank You for Your Support
          </h1>
        </div>

        <div className="space-y-4 text-lg text-gray-600 leading-relaxed">
          <p>
            We're incredibly grateful for the overwhelming response to Doodle
            World. Your enthusiasm and creativity exceeded all our expectations!
          </p>
          <p>
            Due to the high volume of usage and the associated infrastructure
            costs, we've had to temporarily pause the service. We're exploring
            ways to bring Doodle World back in a sustainable form.
          </p>
          <p className="text-gray-700 font-semibold mt-6">
            Thank you for being part of this journey. ✨
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 text-center text-gray-600 text-sm">
        <p>Built with ❤️ in Cambridge, MA</p>
      </footer>
    </div>
  );
}
