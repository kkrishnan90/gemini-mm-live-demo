import { useState, useEffect, useRef, useCallback } from 'react';

export const useAudioVisualization = (isSessionActive, isMuted) => {
  const [audioLevels, setAudioLevels] = useState([0, 0, 0, 0, 0]);
  const animationRef = useRef(null);

  // Define stopVisualization first (no dependencies on other functions)
  const stopVisualization = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setAudioLevels([0, 0, 0, 0, 0]);
  }, []);

  // Define startVisualization second - generates realistic audio visualization
  const startVisualization = useCallback(() => {
    let frameCount = 0;
    
    const updateLevels = () => {
      // Generate realistic voice-like audio levels
      const time = frameCount * 0.1;
      const newLevels = [];
      
      for (let i = 0; i < 5; i++) {
        // Create voice-like frequency distribution (more energy in mid frequencies)
        const baseFreq = (i + 1) * 0.3;
        const voicePattern = Math.sin(time * baseFreq) * 0.4 + 0.3;
        const randomVariation = (Math.random() - 0.5) * 0.3;
        const breathingPattern = Math.sin(time * 0.05) * 0.2;
        
        // Combine patterns for realistic voice visualization
        let level = voicePattern + randomVariation + breathingPattern;
        
        // Mid frequencies (bars 2-3) get more energy (typical voice)
        if (i === 1 || i === 2) {
          level *= 1.4;
        }
        
        // Clamp between 0.1 and 1.0
        level = Math.max(0.1, Math.min(1.0, level));
        newLevels.push(level);
      }
      
      setAudioLevels(newLevels);
      frameCount++;
      
      if (isSessionActive && !isMuted) {
        animationRef.current = requestAnimationFrame(updateLevels);
      }
    };

    updateLevels();
  }, [isSessionActive, isMuted]);

  // Effect to manage audio analysis lifecycle
  useEffect(() => {
    if (isSessionActive && !isMuted) {
      startVisualization();
    } else {
      stopVisualization();
    }

    return () => {
      stopVisualization();
    };
  }, [isSessionActive, isMuted, startVisualization, stopVisualization]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVisualization();
    };
  }, [stopVisualization]);

  return audioLevels;
};