import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        { error: "Missing taskId parameter" },
        { status: 400 }
      );
    }

    // Read from task-specific file
    const taskFilePath = path.join(process.cwd(), "meshy_tasks", `${taskId}.json`);
    
    if (!fs.existsSync(taskFilePath)) {
      return NextResponse.json({ 
        progress: 0, 
        status: "NOT_STARTED" 
      });
    }

    const statusContent = fs.readFileSync(taskFilePath, "utf-8");
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

