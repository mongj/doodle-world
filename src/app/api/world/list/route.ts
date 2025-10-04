import fs from "fs";
import { NextResponse } from "next/server";
import path from "path";

export async function GET() {
  try {
    const jobsDir = path.join(process.cwd(), "jobs");

    // Create jobs directory if it doesn't exist
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
      return NextResponse.json({ jobs: [] });
    }

    // Read all job files
    const files = fs.readdirSync(jobsDir).filter((f) => f.endsWith(".json"));
    const jobs = files.map((file) => {
      const content = fs.readFileSync(path.join(jobsDir, file), "utf-8");
      return JSON.parse(content);
    });

    // Sort by creation time, newest first
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error listing jobs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
