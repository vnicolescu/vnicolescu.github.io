import React from 'react';

const Section = ({ title, children }) => {
  return (
    <section className="max-w-4xl mx-auto my-12 p-8 bg-white/80 backdrop-blur-sm text-text-base rounded-component shadow-card border border-gray-200/50">
      {title && <h2 className="text-3xl font-heading font-semibold mb-6 text-primary border-b pb-3 border-gray-200/70">{title}</h2>}
      <div className="space-y-6">
        {children}
      </div>
    </section>
  );
};

export default Section;
