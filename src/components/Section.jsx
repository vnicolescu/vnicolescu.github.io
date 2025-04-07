import React from 'react';

const Section = ({ title, children }) => {
  return (
    <section className="max-w-4xl mx-auto my-8 p-8 bg-white text-gray-800 rounded-component shadow-card">
      {title && <h2 className="text-3xl font-heading font-semibold mb-6 text-primary border-b pb-2 border-gray-200">{title}</h2>}
      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
};

export default Section;
