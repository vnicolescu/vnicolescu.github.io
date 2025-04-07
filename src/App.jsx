import React from 'react';
import Header from './components/Header';
import Section from './components/Section';
// Import Footer and PromptBubble later when created

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Section title="🔍 Overview">
          <p>This is a placeholder for the overview section content. We'll pull this from `profileData.js` later.</p>
        </Section>
        {/* Add more sections here */}
      </main>
      {/* <Footer /> */}
      {/* <PromptBubble /> */}
    </div>
  );
}

export default App;
