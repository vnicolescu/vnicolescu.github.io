import React, { useState, useEffect } from 'react';
import { FiMessageSquare, FiX } from 'react-icons/fi'; // Import icons

const PromptBubble = ({ promptText }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showHint, setShowHint] = useState(true); // State to control initial hint animation

  useEffect(() => {
    const visibilityTimer = setTimeout(() => {
      setIsVisible(true);
      // Hint animation timer
      const hintTimer = setTimeout(() => setShowHint(false), 2500); // Show hint for 2.5s
      return () => clearTimeout(hintTimer);
    }, 500); // Delay visibility slightly longer
    return () => clearTimeout(visibilityTimer);
  }, []);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    setShowHint(false); // Hide hint on interaction
  };

  return (
    <div
      className={`
        fixed top-4 left-4 z-50
        transition-opacity duration-500 ease-in-out
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      {/* Collapsed State: Icon Button */}
      {!isExpanded && (
        <button
          onClick={toggleExpand}
          className={`
            p-3 rounded-full bg-accent-1 text-white shadow-lg
            hover:bg-indigo-700 hover:shadow-xl
            focus:outline-none focus:ring-2 focus:ring-accent-1 focus:ring-offset-2
            transition-all duration-300
            ${showHint ? 'animate-light-ripple' : ''} // Use light ripple hint
          `}
          aria-label="Show prompt"
        >
          <FiMessageSquare size={24} />
        </button>
      )}

      {/* Expanded State: Text Bubble */}
      {isExpanded && (
        <div
          className={`
            p-4 rounded-lg shadow-lg bg-accent-1 text-white
            max-w-xs relative // Added relative positioning
            transition-all duration-300 ease-in-out // Smooth transition for expand/collapse
            origin-top-left // Animation origin
            ${isExpanded ? 'scale-100 opacity-100' : 'scale-95 opacity-0'} // Scale/fade animation
          `}
        >
          {/* Close Button */}
          <button
            onClick={toggleExpand}
            className="absolute top-1 right-1 p-1 text-indigo-200 hover:text-white focus:outline-none"
            aria-label="Hide prompt"
          >
            <FiX size={18} />
          </button>

          <p className="text-sm font-mono italic mb-1 font-semibold">Original Prompt:</p>
          <p className="text-sm">{promptText}</p>
        </div>
      )}
    </div>
  );
};

export default PromptBubble;
