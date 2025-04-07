import React, { useState, useEffect } from 'react';

const PromptBubble = ({ promptText }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Simple fade-in effect on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 300); // Delay slightly for effect
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-xs p-4 rounded-lg shadow-lg bg-accent-1 text-white transition-opacity duration-500 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      <p className="text-xs font-mono italic">Original Prompt:</p>
      <p className="text-sm mt-1">{promptText}</p>
    </div>
  );
};

export default PromptBubble;
