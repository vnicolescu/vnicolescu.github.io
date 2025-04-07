import React from 'react';
import Header from './components/Header';
import Section from './components/Section';
import TraitCard from './components/TraitCard';
import QuoteBlock from './components/QuoteBlock';
import DataTable from './components/DataTable';
import PromptBubble from './components/PromptBubble';
import Footer from './components/Footer';

// Import the profile data
import { profileData } from './data/profileData';

function App() {
  return (
    <div className="min-h-screen bg-background relative pb-20">
      <Header />
      <PromptBubble promptText={profileData.prompt} />

      <main className="pt-5">
        <Section title={profileData.overview.title}>
          <p className="text-gray-700 leading-relaxed">{profileData.overview.content}</p>
        </Section>

        <Section title="🧬 Core Traits">
          {profileData.traits.map((trait) => (
            <TraitCard
              key={trait.id}
              title={trait.title}
              bullets={trait.bullets}
              quote={trait.quote}
            />
          ))}
        </Section>

        <Section title={profileData.motivations.title}>
          <DataTable headers={profileData.motivations.headers} rows={profileData.motivations.rows} />
        </Section>

        <Section title={profileData.growth.title}>
          {profileData.growth.patterns.map((pattern) => (
            <div key={pattern.id} className="mb-6 p-4 border border-gray-200 rounded-md bg-white shadow-sm">
              <h3 className="text-lg font-heading font-semibold mb-2 text-accent-1">{pattern.title}</h3>
              <p className="text-gray-700 mb-3">{pattern.description}</p>
              <QuoteBlock quote={pattern.quote} source="Coaching Advice" />
            </div>
          ))}
        </Section>

        <Section title={profileData.potential.title}>
            {profileData.potential.items.map((item) => (
                <div key={item.id} className="mb-4">
                    <h3 className="text-lg font-heading font-semibold text-accent-1">{item.title}</h3>
                    <p className="text-gray-700">{item.description}</p>
                </div>
            ))}
        </Section>

        <Section title={profileData.recommendations.title}>
            <div className="mb-6">
                <h3 className="text-xl font-heading font-semibold mb-3 text-primary">{profileData.recommendations.shortTerm.title}</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {profileData.recommendations.shortTerm.list.map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>
            </div>
            <div>
                <h3 className="text-xl font-heading font-semibold mb-3 text-primary">{profileData.recommendations.mediumTerm.title}</h3>
                 <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {profileData.recommendations.mediumTerm.list.map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>
            </div>
        </Section>

        <Section title={profileData.closing.title}>
          <QuoteBlock quote={profileData.closing.quote} />
          <p className="mt-4 text-gray-700 leading-relaxed">{profileData.closing.description}</p>
        </Section>
      </main>

      <Footer />
    </div>
  );
}

export default App;
