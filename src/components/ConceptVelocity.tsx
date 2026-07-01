import React from 'react';
import { LogItem } from '../types';

interface ConceptVelocityProps {
  loggedSessions: LogItem[];
}

export default function ConceptVelocity({ loggedSessions }: ConceptVelocityProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center py-8">
      <h3 className="text-lg font-bold text-white mb-2">Concept Velocity</h3>
      <p className="text-zinc-400 text-sm">
        {loggedSessions.filter(l => !l.isMissed).length} active focus sessions recorded.
      </p>
    </div>
  );
}
