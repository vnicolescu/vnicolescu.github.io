import React from 'react';
import QuoteBlock from './QuoteBlock'; // We'll create this next

const TraitCard = ({ title, bullets, quote }) => {
  return (
    <div className="mb-6 p-6 border border-gray-200/50 rounded-component bg-gradient-to-br from-white to-gray-50 shadow-sm transition-all duration-300 ease-in-out hover:shadow-lg hover:-translate-y-1">
      <h3 className="text-xl font-heading font-semibold mb-3 text-accent-1">{title}</h3>
      <ul className="list-disc list-inside space-y-1 mb-4 text-gray-800">
        {bullets.map((bullet, index) => (
          <li key={index}>{bullet}</li>
        ))}
      </ul>
      {quote && <QuoteBlock quote={quote} source="Indicator" />}
    </div>
  );
};

export default TraitCard;
