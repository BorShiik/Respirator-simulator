import { create } from 'zustand';

/**
 * Zustand store to manage the state of the interactive 3D Respirator.
 * Handles the current mode, inspiratory pressure (clamped 5-40), and knob rotation.
 */
export const useRespiratorStore = create((set) => ({
  // State variables
  mode: 'PC-CMV',
  inspiratoryPressure: 20, // Default pressure in cm H2O to match screenshot
  knobRotation: 0,         // Rotation in radians

  // Actions
  setKnobRotation: (angle) => set({ knobRotation: angle }),
  
  adjustPressure: (delta) => set((state) => {
    const nextPressure = Math.max(5, Math.min(40, state.inspiratoryPressure + delta));
    // Calculate new rotation proportional to the change
    const rotationDelta = (nextPressure - state.inspiratoryPressure) * (Math.PI / 6); // 30 degrees per unit of pressure change
    return {
      inspiratoryPressure: nextPressure,
      knobRotation: state.knobRotation + rotationDelta
    };
  }),

  setMode: (newMode) => set({ mode: newMode })
}));
