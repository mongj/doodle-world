"use client";

import { useEffect, useState } from "react";

export interface Task {
  id: string;
  progress: number;
  message: string;
  status: "pending" | "processing" | "completed" | "error";
}

interface TaskProgressListProps {
  tasks: Task[];
  onRemoveTask: (taskId: string) => void;
}

export default function TaskProgressList({ tasks, onRemoveTask }: TaskProgressListProps) {
  const [displayTasks, setDisplayTasks] = useState<Task[]>([]);

  useEffect(() => {
    setDisplayTasks(tasks);

    // Auto-remove completed tasks after 2 seconds
    const completedTasks = tasks.filter(t => t.status === "completed");
    if (completedTasks.length > 0) {
      completedTasks.forEach(task => {
        setTimeout(() => {
          onRemoveTask(task.id);
        }, 2000);
      });
    }

    // Auto-remove error tasks after 5 seconds
    const errorTasks = tasks.filter(t => t.status === "error");
    if (errorTasks.length > 0) {
      errorTasks.forEach(task => {
        setTimeout(() => {
          onRemoveTask(task.id);
        }, 5000);
      });
    }
  }, [tasks, onRemoveTask]);

  if (displayTasks.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-20 right-6 z-30 flex flex-col gap-3 pointer-events-none">
      {displayTasks.map((task) => (
        <div
          key={task.id}
          className="bg-black/80 text-white px-5 py-3 rounded-xl shadow-2xl backdrop-blur min-w-[320px] max-w-[400px] animate-slide-in-right pointer-events-auto"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold truncate flex-1">
              {task.status === "completed" ? "✓ " : task.status === "error" ? "✗ " : ""}
              {task.message || "Processing..."}
            </span>
            <button
              onClick={() => onRemoveTask(task.id)}
              className="ml-2 text-gray-400 hover:text-white text-lg leading-none"
              title="Dismiss"
            >
              ×
            </button>
          </div>
          
          {(task.status === "pending" || task.status === "processing") && (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 to-pink-500"
                  style={{ width: `${Math.max(1, task.progress)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-purple-400 min-w-[40px] text-right">
                {Math.round(task.progress)}%
              </span>
            </div>
          )}

          {task.status === "error" && (
            <p className="text-xs text-red-400 mt-1">
              Click × to dismiss
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

