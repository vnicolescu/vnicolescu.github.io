import React from 'react';
import QuoteBlock from './QuoteBlock'; // We'll create this next

const TraitCard = ({ title, bullets, quote }) => {
  return (
    <div className="mb-6 p-6 border border-gray-200 rounded-component bg-white shadow-sm">
      <h3 className="text-xl font-heading font-semibold mb-3 text-accent-1">{title}</h3>
      <ul className="list-disc list-inside space-y-1 mb-4 text-gray-700">
        {bullets.map((bullet, index) => (
          <li key={index}>{bullet}</li>
        ))}
      </ul>
      {quote && <QuoteBlock quote={quote} source="Indicator" />}
    </div>
  );
};

export default TraitCard;
