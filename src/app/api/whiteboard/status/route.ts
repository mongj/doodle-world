import fs from "fs";
import { NextResponse } from "next/server";
import path from "path";

export async function GET() {
  try {
    const statusPath = path.join(process.cwd(), "meshy_status.json");
    
    if (!fs.existsSync(statusPath)) {
      return NextResponse.json({ 
        progress: 0, 
        status: "NOT_STARTED" 
      });
    }

    const statusContent = fs.readFileSync(statusPath, "utf-8");
    const statusData = JSON.parse(statusContent);

    return NextResponse.json({
      progress: statusData.progress || 0,
      status: statusData.status || "UNKNOWN",
      model_urls: statusData.model_urls || {},
      task_error: statusData.task_error || null,
    });
  } catch (error) {
    console.error("Error reading status:", error);
    return NextResponse.json(
      { error: "Failed to read status" },
      { status: 500 }
    );
  }
}

