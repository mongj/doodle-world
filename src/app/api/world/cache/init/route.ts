import { NextRequest, NextResponse } from "next/server";

/**
 * Initialize the world cache by downloading all preset world assets
 * This is a client-side operation now - the cache runs in the browser
 */
export async function POST(request: NextRequest) {
  try {
    // This endpoint is not needed anymore since caching happens client-side
    // But keeping it for backwards compatibility
    return NextResponse.json({
      message: "Cache initialization happens client-side now",
      success: true,
    });
  } catch (error) {
    console.error("Error initializing cache:", error);
    return NextResponse.json(
      { error: "Failed to initialize cache" },
      { status: 500 }
    );
  }
}

/**
 * Get cache status - not used anymore
 */
export async function GET() {
  return NextResponse.json({
    message: "Cache status is client-side only",
  });
}
