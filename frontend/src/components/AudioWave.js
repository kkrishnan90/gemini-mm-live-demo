import React from 'react';

export const AudioWave = ({ audioLevels, isActive }) => {
  if (!isActive) {
    return null;
  }

  return (
    <div className="audio-wave">
      {audioLevels.map((level, index) => (
        <span
          key={index}
          style={{
            transform: `scaleY(${Math.max(0.1, level)})`,
            transition: 'transform 0.1s ease-out'
          }}
        />
      ))}
    </div>
  );
};