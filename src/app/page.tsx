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
          <span className="text-gray-500 text-sm tracking-wide"> OR </span>
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
                className={`bg-gradient-to-br ${gradient} rounded-3xl p-8 shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer block`}
              >
                <div className="bg-white rounded-2xl overflow-hidden mb-4">
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
        {jobs.length > 0 && (
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">
              Generation Jobs
            </h2>
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white rounded-2xl p-6 shadow-lg border-2 border-purple-200"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <p className="text-gray-700 font-medium mb-2">
                        {job.prompt}
                      </p>
                      <p className="text-sm text-gray-500">
                        Model: {job.model} • Created:{" "}
                        {new Date(job.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="ml-4">
                      <StatusBadge status={job.status} />
                    </div>
                  </div>

                  {/* Progress or Error */}
                  {job.status === "PENDING" ||
                  job.status === "INITIALIZING" ||
                  job.status === "PROCESSING" ? (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 text-blue-600">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                        <span className="text-sm font-medium">
                          Generating world... This may take 1-5 minutes
                        </span>
                      </div>
                    </div>
                  ) : job.status === "FAILED" ? (
                    <div className="mt-4 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
                      ❌ Generation failed: {job.error || "Unknown error"}
                    </div>
                  ) : job.status === "SUCCEEDED" && job.output ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-green-600 font-medium">
                        ✅ Generation complete!
                      </p>
                      {job.meshConversionStatus === "pending" && (
                        <div className="flex items-center gap-2 text-orange-600 text-sm">
                          <div className="animate-spin h-4 w-4 border-2 border-orange-600 border-t-transparent rounded-full"></div>
                          <span>Converting mesh...</span>
                        </div>
                      )}
                      {job.meshConversionStatus === "completed" &&
                        job.convertedMeshUrl && (
                          <p className="text-green-600 text-sm">
                            ✅ Mesh conversion complete!
                          </p>
                        )}
                      {job.meshConversionStatus === "failed" && (
                        <p className="text-orange-600 text-sm">
                          ⚠️ Mesh conversion in progress or failed
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {job.output.spz_urls?.["500k"] && (
                          <a
                            href={job.output.spz_urls["500k"]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-center"
                          >
                            Download SPZ (500k)
                          </a>
                        )}
                        {job.output.ply_url && (
                          <a
                            href={job.output.ply_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition-colors text-center"
                          >
                            Download PLY
                          </a>
                        )}
                        {job.convertedMeshUrl ? (
                          <a
                            href={job.convertedMeshUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-center"
                          >
                            Download Converted Mesh
                          </a>
                        ) : job.output.collider_mesh_url ? (
                          <a
                            href={job.output.collider_mesh_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-center"
                          >
                            Download Collider Mesh
                          </a>
                        ) : null}
                        {job.output.wlg_url && (
                          <a
                            href={job.output.wlg_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-center"
                          >
                            Download WLG
                          </a>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
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

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<
    string,
    { color: string; label: string; emoji: string }
  > = {
    PENDING: {
      color: "bg-yellow-100 text-yellow-700",
      label: "Pending",
      emoji: "⏳",
    },
    INITIALIZING: {
      color: "bg-blue-100 text-blue-700",
      label: "Initializing",
      emoji: "🔄",
    },
    PROCESSING: {
      color: "bg-blue-100 text-blue-700",
      label: "Processing",
      emoji: "⚙️",
    },
    SUCCEEDED: {
      color: "bg-green-100 text-green-700",
      label: "Completed",
      emoji: "✅",
    },
    FAILED: { color: "bg-red-100 text-red-700", label: "Failed", emoji: "❌" },
  };

  const config = statusConfig[status] || {
    color: "bg-gray-100 text-gray-700",
    label: status,
    emoji: "❓",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
