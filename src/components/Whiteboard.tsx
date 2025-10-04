"use client";

import { useEffect, useState } from "react";
import { Editor, Tldraw } from "tldraw";
import "tldraw/tldraw.css";

interface WhiteboardProps {
  onClose: () => void;
  onGenerationStart: () => void;
  onGenerationProgress: (progress: number, message: string) => void;
  onGenerationComplete: () => void;
}

export default function Whiteboard({ 
  onClose, 
  onGenerationStart, 
  onGenerationProgress, 
  onGenerationComplete 
}: WhiteboardProps) {
  const [editor, setEditor] = useState<Editor | null>(null);

  const handleEditorMount = (instance: Editor) => {
    setEditor(instance);
    try {
      instance.setCurrentTool('draw');
    } catch (error) {
      console.warn('Failed to set default tool to draw:', error);
    }
  };

  useEffect(() => {
    // Exit pointer lock if active
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleSendImage = async () => {
    if (!editor) return;

    // Close whiteboard immediately
    onClose();

    try {
      onGenerationStart();
      onGenerationProgress(0, "Converting drawing to image...");

      // Convert all shapes to array
      const allShapes = Array.from(editor.getCurrentPageShapeIds());

      // Export the canvas as an image blob
      const imageResult = await editor.toImage(allShapes, {
        format: "png",
        quality: 0.9,
        background: true,
        padding: 10,
      });

      // Convert blob to base64 data URL for transport
      const imageUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageResult.blob);
      });

      onGenerationProgress(5, "Sending to Meshy AI...");

      // Poll for progress
      const progressInterval = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/whiteboard/status");
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            const progress = statusData.progress || 0;
            if (progress > 0 && progress < 100) {
              onGenerationProgress(
                Math.max(5, Math.min(95, progress)),
                `Generating model... ${progress}% complete`
              );
            }
          }
        } catch (err) {
          console.error("Error polling status:", err);
        }
      }, 2000);

      const response = await fetch("/api/whiteboard/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        clearInterval(progressInterval);
        throw new Error(data?.error || "Failed to create 3D model");
      }

      console.log('Meshy task created:', data);

      // Now poll for completion (webhook updates the status file)
      const maxTries = 120;
      const delayMs = 3000;
      
      for (let i = 0; i < maxTries; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        const statusRes = await fetch("/api/whiteboard/status");
        if (!statusRes.ok) continue;
        
        const statusData = await statusRes.json();
        console.log('Status check:', statusData);
        
        if (statusData.status === 'FAILED') {
          clearInterval(progressInterval);
          const errorMsg = statusData.task_error?.message || "Model generation failed";
          alert(`❌ Model Generation Failed\n\n${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        if (statusData.status === 'SUCCEEDED' && statusData.model_urls?.glb) {
          clearInterval(progressInterval);
          onGenerationProgress(100, "Loading model into scene...");

          const loader = (window as any)?.__LOAD_DYNAMIC_MODEL__;
          if (typeof loader === 'function') {
            await loader(statusData.model_urls.glb);
            onGenerationProgress(100, "✓ Model loaded successfully!");
            
            setTimeout(() => {
              onGenerationComplete();
            }, 2000);
            return;
          } else {
            throw new Error('Model loader unavailable');
          }
        }
      }
      
      clearInterval(progressInterval);
      throw new Error('Model generation timeout');
    } catch (error) {
      console.error("Error creating 3D model:", error);
      onGenerationProgress(
        0,
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setTimeout(() => {
        onGenerationComplete();
      }, 3000);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
      }}
      onClick={() => {
        onClose();
        // Re-lock pointer after closing
        setTimeout(() => {
          const controls = (
            window as Window & { __TAVERN_CONTROLS__?: { lock: () => void } }
          ).__TAVERN_CONTROLS__;
          if (controls) {
            controls.lock();
          }
        }, 100);
      }}
    >
      <div
        style={{
          position: "relative",
          width: "90%",
          height: "85%",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Tldraw onMount={handleEditorMount} />
        <button
          onClick={handleSendImage}
          disabled={!editor}
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            zIndex: 100000,
            backgroundColor: !editor ? '#9ca3af' : '#8b5cf6',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            cursor: !editor ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '14px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (editor) {
              e.currentTarget.style.backgroundColor = '#7c3aed';
            }
          }}
          onMouseLeave={(e) => {
            if (editor) {
              e.currentTarget.style.backgroundColor = '#8b5cf6';
            }
          }}
        >
          Create 3D Model
        </button>
      </div>
    </div>
  );
}
