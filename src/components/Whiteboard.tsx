"use client";

import { useEffect, useState } from "react";
import { Editor, Tldraw } from "tldraw";
import "tldraw/tldraw.css";

interface WhiteboardProps {
  onClose: () => void;
}

export default function Whiteboard({ onClose }: WhiteboardProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isSending, setIsSending] = useState(false);

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

    try {
      setIsSending(true);

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

      const response = await fetch("/api/whiteboard/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Request failed");

      console.log("Meshy result:", data);
      const status = data?.status || "UNKNOWN";
      alert(status === "SUCCEEDED" ? "3D model ready!" : `Status: ${status}`);
    } catch (error) {
      console.error("Error sending image:", error);
      alert("Error sending image");
    } finally {
      setIsSending(false);
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
        <Tldraw onMount={setEditor} />
        <button
          onClick={handleSendImage}
          disabled={isSending || !editor}
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            zIndex: 100000,
            backgroundColor: isSending ? "#9ca3af" : "#3b82f6",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            border: "none",
            cursor: isSending || !editor ? "not-allowed" : "pointer",
            fontWeight: "600",
            fontSize: "14px",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!isSending && editor) {
              e.currentTarget.style.backgroundColor = "#2563eb";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSending && editor) {
              e.currentTarget.style.backgroundColor = "#3b82f6";
            }
          }}
        >
          {isSending ? "Sending..." : "Send to API"}
        </button>
      </div>
    </div>
  );
}
