import React from 'react';

const QuoteBlock = ({ quote, source }) => {

  // Logic to bold the first part ending with a colon
  const parts = quote.split(/(:\s)/); // Split by colon and following space, keeping the delimiter
  let formattedQuote;
  if (parts.length > 1) {
    formattedQuote = (
      <>
        <span className="font-semibold">{parts[0]}{parts[1]}</span>
        {parts.slice(2).join('')}
      </>
    );
  } else {
    formattedQuote = quote; // No colon found, display as is
  }

  return (
    <blockquote className="mt-4 p-4 border-l-4 border-accent-1 bg-gray-50/40 rounded-r-md transition-shadow duration-200 hover:shadow-md">
      <p className="text-base italic text-gray-800 text-center md:text-justify leading-relaxed">{formattedQuote}</p>
      {source && source !== 'Indicator' && <cite className="block text-right text-sm mt-2 text-gray-600">- {source}</cite>} {/* Darker cite text, conditionally rendered */}
    </blockquote>
  );
};

export default QuoteBlock;
