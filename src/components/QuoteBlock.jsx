import React from 'react';

const QuoteBlock = ({ quote, source }) => {
  return (
    <blockquote className="mt-4 p-4 border-l-4 border-accent-2 bg-amber-50 text-gray-600 rounded-r-md">
      <p className="font-serif italic leading-relaxed">{quote}</p>
      {source && <cite className="block text-right text-sm mt-2 text-gray-500">- {source}</cite>}
    </blockquote>
  );
};

export default QuoteBlock;
