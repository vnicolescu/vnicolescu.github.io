import React from 'react';

const Hero = () => {
  return (
    // Outer container: Adjusted min-height based on example
    <div className="relative w-full min-h-[270px]">
      {/* Background Layer: Adjusted Gradient for more color */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#0f0f1a] via-[#2c2c3c] to-[#1a1a28]"
      ></div>

      {/* Grain Filter Layer */}
      <div
        className="absolute inset-0"
        style={{ filter: 'url(#refined-grain)' }}
      ></div>

      {/* Optional: Soft overlay layer with increased opacity */}
      <div className="absolute inset-0 bg-black/15 backdrop-blur-sm mix-blend-overlay pointer-events-none" aria-hidden="true" />

      {/* Content Layer: Added padding, refined styles */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 py-16 text-center">
        {/* Title: Updated text and font weight */}
        <h1
          className="font-serif text-4xl md:text-6xl font-medium leading-tight text-white"
          // Removed transition for now, can re-add if needed
        >
          Signals <span className="italic font-normal">from the</span> Future
        </h1>

        {/* Divider: Enhanced visibility */}
        <hr className="border-t border-gray-500 w-20 my-4 md:my-6 opacity-50" />

        {/* Subtitle: Added margin-top, aligned emoji, standard transition */}
        <p className="font-sans text-sm md:text-base text-gray-300 italic mt-2 flex items-center justify-center gap-2 transition-opacity duration-700 ease-in-out opacity-100">
          <span className="text-base">🔥</span> {/* Aligned emoji */}
          <span>Compiled from self-observation, AI reflection, and ongoing iteration.</span>
        </p>
      </div>
    </div>
  );
};

export default Hero;
