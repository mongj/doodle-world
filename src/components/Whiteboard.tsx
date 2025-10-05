"use client";

import { useEffect, useState } from "react";
import { Editor, Tldraw } from "tldraw";
import "tldraw/tldraw.css";

interface WhiteboardProps {
  onClose: () => void;
  onGenerationStart: (taskId: string) => void;
  onGenerationProgress: (taskId: string, progress: number, message: string) => void;
  onGenerationComplete: (taskId: string) => void;
  onGenerationError: (taskId: string, error: string) => void;
}

export default function Whiteboard({ 
  onClose, 
  onGenerationStart, 
  onGenerationProgress, 
  onGenerationComplete,
  onGenerationError
}: WhiteboardProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [localUseGemini, setLocalUseGemini] = useState(true);
  const [localCustomPrompt, setLocalCustomPrompt] = useState("");
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

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
      // Don't handle shortcuts if textarea is focused
      if (isTextareaFocused) return;
      
      if (e.code === "Escape") {
        if (showOptionsModal) {
          setShowOptionsModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose, showOptionsModal, isTextareaFocused]);

  // Set a global flag when textarea is focused to disable all shortcuts
  useEffect(() => {
    if (isTextareaFocused) {
      document.body.setAttribute('data-textarea-focused', 'true');
    } else {
      document.body.removeAttribute('data-textarea-focused');
    }
  }, [isTextareaFocused]);

  const handleCreateClick = () => {
    if (!editor) return;
    setShowOptionsModal(true);
  };

  const handleGenerate = async () => {
    if (!editor) return;

    // Close modal and whiteboard
    setShowOptionsModal(false);
    onClose();

    const taskId = `whiteboard-${Date.now()}`;
    
    try {
      onGenerationStart(taskId);
      onGenerationProgress(taskId, 1, "Converting drawing to image...");

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

      onGenerationProgress(taskId, 5, "Sending to AI...");

      const response = await fetch("/api/whiteboard/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          image_url: imageUrl,
          use_gemini: localUseGemini,
          custom_prompt: localCustomPrompt || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to create 3D model");
      }

      console.log('Meshy task created:', data.id);
      
      onGenerationProgress(taskId, 10, "Starting 3D generation...");

      // Poll for progress with backend taskId
      const backendTaskId = data.id;
      const progressInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/whiteboard/status?taskId=${backendTaskId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            const progress = statusData.progress || 0;
            if (progress > 0 && progress < 100) {
              onGenerationProgress(
                taskId, // Use the frontend taskId for UI updates
                Math.max(5, Math.min(95, progress)),
                `Generating model... ${progress}% complete`
              );
            }
          }
        } catch (err) {
          console.error("Error polling status:", err);
        }
      }, 5000);

      // Now poll for completion (webhook updates the status file)
      const maxTries = 100;
      const delayMs = 5000;
      
      for (let i = 0; i < maxTries; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        const statusRes = await fetch(`/api/whiteboard/status?taskId=${backendTaskId}`);
        if (!statusRes.ok) continue;
        
        const statusData = await statusRes.json();
        const glbUrl = statusData.model_urls?.glb || statusData.model_url;
        console.log('[Whiteboard] Status check:', {
          status: statusData.status,
          progress: statusData.progress,
          hasGlbPlural: !!statusData.model_urls?.glb,
          hasGlbSingular: !!statusData.model_url,
          finalGlbUrl: glbUrl,
          provider: statusData.provider,
          switchedToTripo: statusData.switched_to_tripo3d
        });
        
        if (statusData.status === 'FAILED') {
          clearInterval(progressInterval);
          const errorMsg = statusData.task_error?.message || "Model generation failed";
          console.error('[Whiteboard] Task failed:', errorMsg);
          onGenerationError(taskId, errorMsg);
          throw new Error(errorMsg);
        }
        
        
        if (statusData.status === 'SUCCEEDED' && glbUrl) {
          clearInterval(progressInterval);
          console.log('[Whiteboard] Task succeeded! GLB URL:', glbUrl);
          console.log('[Whiteboard] Provider:', statusData.provider);
          onGenerationProgress(taskId, 100, "Loading model into scene...");

          const loader = (window as any)?.__LOAD_DYNAMIC_MODEL__;
          console.log('[Whiteboard] Loader available:', typeof loader === 'function');
          console.log('[Whiteboard] Window object:', typeof window !== 'undefined');
          
          if (typeof loader === 'function') {
            console.log('[Whiteboard] Calling loader with URL:', glbUrl);
            try {
              await loader(glbUrl);
              console.log('[Whiteboard] Model loaded successfully!');
              onGenerationProgress(taskId, 100, "Model loaded successfully!");
              
              setTimeout(() => {
                onGenerationComplete(taskId);
              }, 2000);
              return;
            } catch (loadError) {
              console.error('[Whiteboard] Model loading failed:', loadError);
              throw new Error('Failed to load model into scene');
            }
          } else {
            console.error('[Whiteboard] Model loader unavailable! Window object:', {
              hasWindow: typeof window !== 'undefined',
              loaderType: typeof (window as any).__LOAD_DYNAMIC_MODEL__,
              windowKeys: typeof window !== 'undefined' ? Object.keys(window).filter(k => k.includes('LOAD')) : []
            });
            throw new Error('Model loader unavailable');
          }
        }
      }
      
      clearInterval(progressInterval);
      onGenerationError(taskId, 'Model generation timeout');
      throw new Error('Model generation timeout');
    } catch (error) {
      console.error("Error creating 3D model:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      onGenerationError(taskId, errorMsg);
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
          onClick={handleCreateClick}
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

      {/* Options Modal */}
      {showOptionsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowOptionsModal(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "bold",
                marginBottom: "16px",
                color: "#1f2937",
              }}
            >
              Generate 3D Model
            </h2>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "16px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: "600",
                color: "#111827",
              }}
            >
              <input
                type="checkbox"
                checked={localUseGemini}
                onChange={(e) => setLocalUseGemini(e.target.checked)}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                }}
              />
              Enhance with Gemini 2.5 Flash Image
            </label>

            {localUseGemini && (
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#1f2937",
                  }}
                >
                  Custom Prompt (optional):
                </label>
                <textarea
                  value={localCustomPrompt}
                  onChange={(e) => setLocalCustomPrompt(e.target.value)}
                  onFocus={() => setIsTextareaFocused(true)}
                  onBlur={() => setIsTextareaFocused(false)}
                  placeholder="e.g., Make it look like a realistic fantasy creature with scales and wings"
                  style={{
                    width: "100%",
                    minHeight: "80px",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "2px solid #d1d5db",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    resize: "vertical",
                    color: "#111827",
                  }}
                />
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginTop: "6px",
                  }}
                >
                  Leave empty for default: &quot;Make a 3d model with depth and realism&quot;
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowOptionsModal(false)}
                style={{
                  backgroundColor: "#e5e7eb",
                  color: "#1f2937",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#d1d5db";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#e5e7eb";
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                style={{
                  backgroundColor: "#8b5cf6",
                  color: "white",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "15px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#7c3aed";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#8b5cf6";
                }}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
