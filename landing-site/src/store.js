import { create } from 'zustand';

/**
 * Adjustable ventilator parameters shown as cards on the screen.
 * Order here matches the card order drawn in ScreenDisplay.
 */
export const PARAM_META = {
  ipap:    { label: 'IPAP / PINSP',        min: 5,   max: 40,   step: 1,   unit: 'cmH₂O', decimals: 0 },
  epap:    { label: 'EPAP / PEEP',         min: 0,   max: 20,   step: 1,   unit: 'cmH₂O', decimals: 0 },
  rr:      { label: 'CZĘSTOŚĆ (RR)',       min: 4,   max: 40,   step: 1,   unit: '/min',  decimals: 0 },
  ti:      { label: 'CZAS WDECHU (TI)',    min: 0.3, max: 2.0,  step: 0.1, unit: 's',     decimals: 1 },
  trigger: { label: 'WYZWALACZ',           min: 0.5, max: 15,   step: 0.5, unit: 'cmH₂O', decimals: 1 },
  vt:      { label: 'OBJ. ODDECHOWA (VT)', min: 200, max: 1000, step: 10,  unit: 'mL',    decimals: 0 },
};

// Keys in card order
export const SELECTABLE = ['ipap', 'epap', 'rr', 'ti', 'trigger', 'vt'];

const DEFAULTS = { ipap: 20, epap: 5, rr: 15, ti: 1.0, trigger: 2.0, vt: 500 };

// Patient model — default values & labels taken from the real project
// (backend DEFAULT_PATIENT + student-ui PATIENT_PARAM_LABELS)
export const PATIENT_PARAMS = [
  { label: 'R (opór)',      value: 12,  unit: 'cmH₂O/(L/s)' },
  { label: 'C (podatność)', value: 40,  unit: 'mL/cmH₂O' },
  { label: 'Rin',           value: 1,   unit: 'cmH₂O/(L/s)' },
  { label: 'Rout',          value: 8,   unit: 'cmH₂O/(L/s)' },
  { label: 'P0.1',          value: 2,   unit: 'cmH₂O' },
  { label: 'Tcykl',         value: 3.0, unit: 's' },
  { label: 'PTi',           value: 1.0, unit: 's' },
  { label: 'PriorityPR',    value: 0,   unit: '/min' },
  { label: 'PressureRaiseT', value: 0,  unit: 's' },
  { label: 'DoubleTrigger', value: 0,   unit: 's' },
];

export const useRespiratorStore = create((set) => ({
  mode: 'PC-CMV',
  params: { ...DEFAULTS },
  selected: 'ipap',     // currently highlighted card (driven by knob)
  paused: false,
  patientOpen: false,   // "Parametry pacjenta" panel expanded
  dark: true,           // colour theme (matches real student-ui light/dark)
  knobRotation: 0,      // radians, for the 3D dial spring

  toggleTheme: () => set((s) => ({ dark: !s.dark })),

  // Select which parameter the physical knob controls
  selectParam: (key) => set(() => (PARAM_META[key] ? { selected: key } : {})),

  togglePause: () => set((s) => ({ paused: !s.paused })),

  togglePatient: () => set((s) => ({ patientOpen: !s.patientOpen })),

  reset: () => set({
    params: { ...DEFAULTS },
    selected: 'ipap',
    paused: false,
    patientOpen: false,
    knobRotation: 0,
  }),

  // Turn the knob: nudge the selected parameter by `steps` clicks within its range
  adjustSelected: (steps) => set((s) => {
    const key = s.selected;
    const m = PARAM_META[key];
    if (!m) return {};
    const cur = s.params[key];
    let next = cur + steps * m.step;
    next = Math.max(m.min, Math.min(m.max, next));
    next = Math.round(next / m.step) * m.step; // kill float drift
    const moved = (next - cur) / m.step;       // how many real clicks happened
    return {
      params: { ...s.params, [key]: next },
      knobRotation: s.knobRotation + moved * (Math.PI / 6),
    };
  }),
}));
