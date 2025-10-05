"use client";

import presetWorldsData from "@/data/preset-worlds.json";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Job {
  id: string;
  status: string;
  createdAt: number;
  updatedAt?: number;
  model: string;
  prompt: string;
  error: string | null;
  output: any;
  meshConversionStatus?: string;
  convertedMeshUrl?: string;
  musicGenerationStatus?: string;
  backgroundMusic?: string;
}

interface World {
  id: string;
  name: string;
  thumbnailUrl: string;
  splatUrl: string;
  meshUrl: string;
  isPreset: boolean;
  createdAt: number;
}

// Load preset worlds from JSON and add a fixed createdAt timestamp
// Using a fixed timestamp to avoid hydration errors (server/client mismatch)
const DEFAULT_PRESET_WORLDS: World[] = presetWorldsData.map((world) => ({
  ...world,
  createdAt: 0, // Use 0 for preset worlds to indicate they're defaults
}));

export default function Home() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [worlds, setWorlds] = useState<World[]>([]);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize worlds from localStorage and always update presets from JSON
  useEffect(() => {
    try {
      const storedWorlds = localStorage.getItem("doodle-worlds");
      let userGeneratedWorlds: World[] = [];

      if (storedWorlds) {
        const parsed: World[] = JSON.parse(storedWorlds);
        // Keep only user-generated worlds (not presets)
        userGeneratedWorlds = parsed.filter((world) => !world.isPreset);
      }

      // Merge preset worlds with user-generated worlds
      // Presets come first, then user-generated worlds
      const allWorlds = [...DEFAULT_PRESET_WORLDS, ...userGeneratedWorlds];

      setWorlds(allWorlds);
      // Always update localStorage with latest preset data
      localStorage.setItem("doodle-worlds", JSON.stringify(allWorlds));
    } catch (error) {
      console.error("Error parsing stored worlds:", error);
      // On error, just use presets
      setWorlds(DEFAULT_PRESET_WORLDS);
      localStorage.setItem(
        "doodle-worlds",
        JSON.stringify(DEFAULT_PRESET_WORLDS)
      );
    }
  }, []);

  // Sync worlds to localStorage whenever they change
  useEffect(() => {
    if (worlds.length > 0) {
      localStorage.setItem("doodle-worlds", JSON.stringify(worlds));
    }
  }, [worlds]);

  // Load existing jobs on mount
  useEffect(() => {
    loadJobs();
  }, []);

  // Poll active jobs
  useEffect(() => {
    const activeJobs = jobs.filter(
      (job) =>
        job.status === "PENDING" ||
        job.status === "INITIALIZING" ||
        job.status === "PROCESSING"
    );

    if (activeJobs.length > 0) {
      // Start polling
      if (!pollingInterval.current) {
        pollingInterval.current = setInterval(() => {
          activeJobs.forEach((job) => pollJobStatus(job.id));
        }, 5000); // Poll every 5 seconds
      }
    } else {
      // Stop polling if no active jobs
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    }

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [jobs]);

  const loadJobs = async () => {
    try {
      const response = await fetch("/api/world/list");
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error("Error loading jobs:", error);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/world/status?jobId=${jobId}`);
      const data = await response.json();

      setJobs((prevJobs) =>
        prevJobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: data.status,
                error: data.error,
                output: data.output,
                updatedAt: data.updatedAt,
                meshConversionStatus: data.meshConversionStatus,
                convertedMeshUrl: data.convertedMeshUrl,
                musicGenerationStatus: data.musicGenerationStatus,
                backgroundMusic: data.backgroundMusic,
              }
            : job
        )
      );
    } catch (error) {
      console.error("Error polling job status:", error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    // Require an image; text is optional
    if (!uploadedFile) {
      alert("Please upload an image to generate a world.");
      return;
    }

    setIsGenerating(true);

    try {
      const formData = new FormData();
      if (prompt.trim().length > 0) {
        formData.append("textPrompt", prompt.trim());
      }
      formData.append("model", "Marble 0.1-mini");
      formData.append("image", uploadedFile);

      const response = await fetch("/api/world/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to generate world");
      }

      const data = await response.json();

      // Add new job to the list
      const newJob: Job = {
        id: data.jobId,
        status: data.status,
        createdAt: Date.now(),
        model: "Marble 0.1-mini",
        prompt: prompt.trim(),
        error: null,
        output: null,
      };

      setJobs((prevJobs) => [newJob, ...prevJobs]);

      // Reset form
      setPrompt("");
      setUploadedImage(null);
      setUploadedFile(null);
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error generating world:", error);
      alert("Failed to start world generation. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Add completed job to worlds library
  const addJobToWorlds = (job: Job) => {
    if (job.status !== "SUCCEEDED" || !job.output) return;

    const worldExists = worlds.some((w) => w.id === job.id);
    if (worldExists) {
      // Update existing world if mesh conversion completed
      if (job.convertedMeshUrl && job.meshConversionStatus === "completed") {
        setWorlds((prevWorlds) =>
          prevWorlds.map((w) =>
            w.id === job.id
              ? { ...w, meshUrl: job.convertedMeshUrl || w.meshUrl }
              : w
          )
        );
      }
      return;
    }

    const baseName =
      job.prompt && job.prompt.trim().length > 0
        ? job.prompt.substring(0, 50) + (job.prompt.length > 50 ? "..." : "")
        : "Untitled World";

    const newWorld: World = {
      id: job.id,
      name: baseName,
      thumbnailUrl:
        job.output.cond_image_url || job.output.posed_cond_image || "",
      splatUrl: job.output.spz_urls?.["500k"] || job.output.ply_url || "",
      meshUrl: job.convertedMeshUrl || job.output.collider_mesh_url || "",
      isPreset: false,
      createdAt: job.createdAt,
    };

    setWorlds((prevWorlds) => [newWorld, ...prevWorlds]);
  };

  // Watch for job completion and add to worlds
  useEffect(() => {
    jobs.forEach((job) => {
      if (job.status === "SUCCEEDED" && job.output) {
        addJobToWorlds(job);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

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
        {/* Create Button on Top */}
        <div className="max-w-7xl mx-auto mb-8">
          <button
            onClick={() => setIsDialogOpen(true)}
            className="w-full bg-gradient-to-br from-purple-400 to-purple-500 rounded-3xl p-8 shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer"
          >
            <div className="bg-white rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                ✨ Create Your Own World
              </h2>
              <p className="text-gray-600">
                Generate custom 3D environments from your own images and
                imagination
              </p>
            </div>
          </button>
        </div>

        {/* OR Divider */}
        <div className="max-w-7xl mx-auto flex items-center gap-4 my-8">
          <div className="h-px bg-gray-300 flex-1"></div>
          <span className="text-gray-500 text-sm tracking-wide"> LIBRARY </span>
          <div className="h-px bg-gray-300 flex-1"></div>
        </div>

        {/* Worlds Grid */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {worlds.map((world, index) => {
            // Cycle through gradient colors
            const gradients = [
              "from-orange-400 to-orange-500",
              "from-pink-400 to-pink-500",
              "from-green-400 to-green-500",
              "from-yellow-400 to-yellow-500",
              "from-blue-400 to-blue-500",
              "from-purple-400 to-purple-500",
            ];
            const gradient = gradients[index % gradients.length];

            return (
              <Link
                key={world.id}
                href={`/world/${world.id}`}
                className={`bg-gradient-to-br ${gradient} rounded-3xl p-4 shadow-lg hover:shadow-xl transition-all cursor-pointer block`}
              >
                <div className="bg-white rounded-2xl overflow-hidden h-full hover:scale-105 transition-transform">
                  {world.thumbnailUrl && (
                    <div className="aspect-video bg-gray-200 relative">
                      <img
                        src={world.thumbnailUrl}
                        alt={world.name}
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                      />
                      {world.isPreset && (
                        <span className="absolute top-2 right-2 bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                          Preset
                        </span>
                      )}
                    </div>
                  )}
                  <div className="p-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                      {world.name}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {world.isPreset
                        ? "Built-in World"
                        : new Date(world.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Jobs Section */}
        {jobs.filter((job) => {
          // Hide fully completed jobs
          const isFullyComplete =
            job.status === "SUCCEEDED" &&
            (job.meshConversionStatus === "completed" ||
              job.meshConversionStatus === "failed") &&
            (job.musicGenerationStatus === "completed" ||
              job.musicGenerationStatus === "failed");
          return !isFullyComplete;
        }).length > 0 && (
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-left">
              Generating worlds
            </h2>
            <div className="space-y-4">
              {jobs
                .filter((job) => {
                  // Hide fully completed jobs
                  const isFullyComplete =
                    job.status === "SUCCEEDED" &&
                    (job.meshConversionStatus === "completed" ||
                      job.meshConversionStatus === "failed") &&
                    (job.musicGenerationStatus === "completed" ||
                      job.musicGenerationStatus === "failed");
                  return !isFullyComplete;
                })
                .map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-600 text-sm">
        <p>Built with Next.js, Three.js, and Rapier Physics</p>
      </footer>

      {/* Dialog Modal */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-white/30 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Dialog Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-3xl">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold">✨ Generate Your World</h2>
                <button
                  onClick={() => setIsDialogOpen(false)}
                  className="text-white hover:text-gray-200 text-3xl font-bold transition-colors"
                >
                  ×
                </button>
              </div>
              <p className="text-purple-100 mt-2">
                Upload an image and describe the world you want to create
              </p>
            </div>

            {/* Dialog Content */}
            <div className="p-8 space-y-6">
              {/* Image Upload Section */}
              <div>
                <label className="block text-lg font-semibold text-gray-800 mb-3">
                  Upload Reference Image
                </label>
                <div className="border-4 border-dashed border-purple-300 rounded-2xl p-8 text-center hover:border-purple-500 transition-colors">
                  {uploadedImage ? (
                    <div className="space-y-4">
                      <img
                        src={uploadedImage}
                        alt="Uploaded preview"
                        className="max-h-64 mx-auto rounded-lg shadow-lg"
                      />
                      <button
                        onClick={() => {
                          setUploadedImage(null);
                          setUploadedFile(null);
                        }}
                        className="text-red-500 hover:text-red-700 font-semibold"
                      >
                        Remove Image
                      </button>
                    </div>
                  ) : (
                    <div>
                      <svg
                        className="mx-auto h-16 w-16 text-purple-400 mb-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <label className="cursor-pointer">
                        <span className="text-purple-600 font-semibold hover:text-purple-700">
                          Click to upload a reference image
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                      <p className="text-sm text-gray-500 mt-2">
                        PNG, JPG, GIF up to 10MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Text Prompt Section */}
              <div>
                <label className="block text-lg font-semibold text-gray-800 mb-3">
                  Describe Your World (optional)
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the world you want to generate... e.g., 'A cozy medieval library with floating books and mystical lighting'"
                  className="w-full h-32 px-4 py-3 border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 resize-none text-gray-700"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setIsDialogOpen(false)}
                  className="flex-1 px-6 py-4 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!uploadedImage || isGenerating}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isGenerating ? "🔄 Generating..." : "🎨 Generate World"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white rounded-2xl shadow-lg border-2 border-purple-200 overflow-hidden">
      {/* Header - always visible */}
      <div
        className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-700 font-medium">
                {job.prompt || "Untitled World"}
              </p>
              {job.status === "FAILED" ? (
                <span className="text-sm font-medium ml-4 text-red-600">
                  ❌ Failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 ml-4 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-700 border-t-transparent rounded-full"></div>
                  In Progress
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Created: {new Date(job.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2">
            <span
              className={`transform transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            >
              ▼
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 pb-6">
          {job.status === "FAILED" ? (
            <div className="p-3 bg-red-50 rounded-lg text-red-700 text-sm">
              ❌ Generation failed: {job.error || "Unknown error"}
            </div>
          ) : (
            <ProgressSteps job={job} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressSteps({ job }: { job: Job }) {
  // Step 1: World Generation
  const step1Complete = job.status === "SUCCEEDED";
  const step1InProgress =
    job.status === "PENDING" ||
    job.status === "INITIALIZING" ||
    job.status === "PROCESSING";

  // Step 2: Mesh Conversion
  const step2Complete = job.meshConversionStatus === "completed";
  const step2InProgress = job.meshConversionStatus === "pending";
  const step2Failed = job.meshConversionStatus === "failed";

  // Step 3: Music Generation
  const step3Complete = job.musicGenerationStatus === "completed";
  const step3InProgress = job.musicGenerationStatus === "pending";
  const step3Failed = job.musicGenerationStatus === "failed";

  return (
    <div className="mt-4">
      {/* Progress Steps Row */}
      <div className="flex items-center">
        {/* Step 1: World Generation */}
        <div className="flex flex-col items-center px-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
              step1Complete
                ? "bg-green-100 border-green-500"
                : step1InProgress
                ? "bg-blue-100 border-blue-500"
                : "bg-gray-100 border-gray-300"
            }`}
          >
            {step1Complete ? (
              <span className="text-green-600 text-xl">✓</span>
            ) : step1InProgress ? (
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            ) : (
              <span className="text-gray-400 text-xl">○</span>
            )}
          </div>
          <p className="text-xs mt-2 text-center font-medium text-gray-700 whitespace-nowrap">
            World
            <br />
            Generation
          </p>
        </div>

        {/* Connector Line 1 */}
        <div className="flex-1 h-1 relative" style={{ top: "-20px" }}>
          <div
            className={`h-full transition-colors ${
              step1Complete ? "bg-green-500" : "bg-gray-300"
            }`}
          ></div>
        </div>

        {/* Step 2: Mesh Generation */}
        <div className="flex flex-col items-center px-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
              step2Complete
                ? "bg-green-100 border-green-500"
                : step2InProgress
                ? "bg-blue-100 border-blue-500"
                : step2Failed
                ? "bg-orange-100 border-orange-500"
                : "bg-gray-100 border-gray-300"
            }`}
          >
            {step2Complete ? (
              <span className="text-green-600 text-xl">✓</span>
            ) : step2InProgress ? (
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            ) : step2Failed ? (
              <span className="text-orange-600 text-xl">⚠</span>
            ) : (
              <span className="text-gray-400 text-xl">○</span>
            )}
          </div>
          <p className="text-xs mt-2 text-center font-medium text-gray-700 whitespace-nowrap">
            Mesh
            <br />
            Generation
          </p>
        </div>

        {/* Connector Line 2 */}
        <div className="flex-1 h-1 relative" style={{ top: "-20px" }}>
          <div
            className={`h-full transition-colors ${
              step2Complete ? "bg-green-500" : "bg-gray-300"
            }`}
          ></div>
        </div>

        {/* Step 3: Music Generation */}
        <div className="flex flex-col items-center px-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
              step3Complete
                ? "bg-green-100 border-green-500"
                : step3InProgress
                ? "bg-blue-100 border-blue-500"
                : step3Failed
                ? "bg-orange-100 border-orange-500"
                : "bg-gray-100 border-gray-300"
            }`}
          >
            {step3Complete ? (
              <span className="text-green-600 text-xl">✓</span>
            ) : step3InProgress ? (
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            ) : step3Failed ? (
              <span className="text-orange-600 text-xl">⚠</span>
            ) : (
              <span className="text-gray-400 text-xl">○</span>
            )}
          </div>
          <p className="text-xs mt-2 text-center font-medium text-gray-700 whitespace-nowrap">
            Music
            <br />
            Generation
          </p>
        </div>
      </div>
    </div>
  );
}
