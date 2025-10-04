"use client";

import React, { useState, memo } from "react";

export interface InventoryItem {
  id: string;
  name: string;
  modelUrl: string;
  icon?: string;
}

interface InventoryProps {
  items: InventoryItem[];
  onClose: () => void;
  onSelectItem: (item: InventoryItem) => void;
}

function Inventory({ items, onClose, onSelectItem }: InventoryProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const GRID_COLS = 9;
  const GRID_ROWS = 4;
  const TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

  const handleSlotClick = (index: number) => {
    if (items[index]) {
      setSelectedSlot(index);
      onSelectItem(items[index]);
      // Auto-close after selection
      setTimeout(() => {
        onClose();
      }, 200);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-6 shadow-2xl border-2 border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">Inventory</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Grid */}
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: TOTAL_SLOTS }).map((_, index) => {
            const item = items[index];
            const isSelected = selectedSlot === index;

            return (
              <div
                key={index}
                onClick={() => handleSlotClick(index)}
                className={`
                  relative aspect-square w-16 h-16
                  bg-gray-700 border-2 rounded-lg
                  transition-all duration-150
                  ${
                    item
                      ? "border-gray-600 hover:border-purple-500 hover:bg-gray-600 cursor-pointer"
                      : "border-gray-800"
                  }
                  ${isSelected ? "border-purple-400 bg-purple-900/30" : ""}
                `}
              >
                {item && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
                    {/* Icon or placeholder */}
                    {item.icon ? (
                      <img
                        src={item.icon}
                        alt={item.name}
                        className="w-10 h-10 object-contain"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          />
                        </svg>
                      </div>
                    )}
                    {/* Item name */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-1 py-0.5 truncate rounded-b-lg">
                      {item.name}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Instructions */}
        <div className="mt-4 text-center text-gray-400 text-sm">
          Click an item to spawn it • ESC or I to close
        </div>
      </div>
    </div>
  );
}

export default memo(Inventory);
