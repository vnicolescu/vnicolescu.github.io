import React from 'react';

const Hero = () => {
  return (
    <div className="w-full min-h-[300px] md:min-h-[400px] bg-gradient-to-br from-[#1e1e2f] to-[#2e2e3f] flex flex-col items-center justify-center px-4 py-16 text-center">
      {/* Title with fade-in animation */}
      <h1 className="font-serif text-4xl md:text-6xl font-normal leading-tight text-white opacity-0 animate-fade-in-up">
        Signals from the Future Self
      </h1>

      {/* Optional Divider */}
      <hr className="border-t border-gray-600 w-12 my-6 opacity-30" />

      {/* Subtitle */}
      <p className="font-sans text-sm md:text-base text-gray-300 italic mt-0 flex items-center justify-center gap-2 opacity-0 animate-fade-in-up animation-delay-300">
        <span>🔥</span>
        <span>Compiled from self-observation, AI reflection, and ongoing iteration.</span>
      </p>
    </div>
  );
};

export default Hero;
