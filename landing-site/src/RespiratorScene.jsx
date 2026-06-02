import React, { useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';
import { useDrag } from '@use-gesture/react';
import { useRespiratorStore } from './store';
import EnclosureGeometry from './EnclosureGeometry';
import ScreenDisplay from './ScreenDisplay';

// Slant angle math:
// The slanted face of the enclosure connects (Y=0.4, Z=1.6) to (Y=0.9, Z=0) in 2D profile.
// Height change (dY) = 0.9 - 0.4 = 0.5
// Depth change (dZ) = 1.6 - 0 = 1.6
// Slant angle from vertical: alpha = atan(1.6 / 0.5) ≈ 1.2687 radians (~72.68 degrees)
const SLANT_ANGLE = Math.atan(1.6 / 0.5);
const SLANT_LEN = Math.sqrt(0.5 * 0.5 + 1.6 * 1.6);

// Midpoint of the slanted face in centered world coordinates:
// Y_mid = (0.4 + 0.9) / 2 - 0.45 = 0.20
// Z_mid = (1.6 + 0) / 2 - 0.8 = 0
const SLANTED_FACE_POS = [0, 0.20, 0];

/**
 * InteractiveKnob Component
 * 
 * Renders the rotary knob on the slanted plane.
 * Detects drag gestures to update the inspiratory pressure in Zustand (clicky encoder feel).
 * Animates the rotation smoothly using @react-spring/three.
 */
function InteractiveKnob({ setControlsEnabled }) {
  const knobRotation = useRespiratorStore((state) => state.knobRotation);
  const adjustPressure = useRespiratorStore((state) => state.adjustPressure);
  
  const accumDrag = useRef(0);

  // Animate the rotation using a spring for a satisfying physical/clicky feel
  const spring = useSpring({
    rotationZ: knobRotation,
    config: { mass: 0.5, tension: 350, friction: 15 } // Sharp, responsive click
  });

  // Bind drag gestures
  const bind = useDrag(({ delta: [dx, dy], first, last, event }) => {
    // Prevent camera rotation during drag
    event.stopPropagation();
    
    if (first) setControlsEnabled(false);
    if (last) {
      setControlsEnabled(true);
      accumDrag.current = 0;
      return;
    }

    // Dragging UP (negative dy) increases pressure, dragging DOWN (positive dy) decreases it
    // Dragging RIGHT (positive dx) increases pressure, dragging LEFT (negative dx) decreases it
    const dragAmount = -dy + dx;
    accumDrag.current += dragAmount;

    // Tactical Click feel: 12 pixels of drag equals 1 step of pressure change (1 cmH2O)
    const threshold = 12;
    if (Math.abs(accumDrag.current) >= threshold) {
      const steps = Math.trunc(accumDrag.current / threshold);
      adjustPressure(steps);
      accumDrag.current = accumDrag.current % threshold;
    }
  }, {
    pointer: { capture: false }
  });

  return (
    <animated.group
      {...bind()}
      position={[0.85, -0.2, 0.04]} // Positioned further right to clear the wider screen
      rotation={spring.rotationZ.to(r => [0, 0, r])}
    >
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.15, 0.15, 0.09, 32]} />
        <meshStandardMaterial
          color="#ECEFF4"      // Nord6: Light silver metallic
          metalness={0.95}     // Highly reflective brushed aluminum
          roughness={0.2}      // Soft specular highlights
        />

        {/* Visual notch indicator for knob rotation */}
        <mesh position={[0, 0.046, -0.09]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.02, 0.005, 0.06]} />
          <meshStandardMaterial 
            color="#38BDF8"    // Sky Blue indicator matching the active parameter border
            emissive="#38BDF8"
            emissiveIntensity={0.5}
          />
        </mesh>
      </mesh>
    </animated.group>
  );
}

/**
 * RespiratorScene Component
 * 
 * Sets up the 3D Canvas, lighting, orbit controls, and groups the components.
 */
export default function RespiratorScene() {
  const [controlsEnabled, setControlsEnabled] = useState(true);

  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.8, 3.8], fov: 42 }}
      style={{ width: '100%', height: '100%', outline: 'none' }}
    >
      {/* Lights */}
      <ambientLight intensity={0.5} />
      
      {/* Key Light */}
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      
      {/* Soft Blue Fill Light to represent hospital screen glow */}
      <directionalLight
        position={[-5, -1, -5]}
        intensity={0.4}
        color="#8FBCBB" // Nord7: Soft Teal
      />

      {/* Main Assembly */}
      <group position={[0, 0.1, 0]}>
        {/* Procedural Enclosure */}
        <EnclosureGeometry />

        {/* Slanted Face Components Group */}
        <group 
          position={SLANTED_FACE_POS} 
          rotation={[-SLANT_ANGLE, 0, 0]}
        >
          {/* Volumetric Casing Rim (Raised outer border around slanted face) */}
          {/* Top border */}
          <mesh position={[0, SLANT_LEN / 2 - 0.02, 0.015]} castShadow receiveShadow>
            <boxGeometry args={[2.4, 0.04, 0.03]} />
            <meshStandardMaterial color="#ECEFF4" roughness={0.3} metalness={0.1} />
          </mesh>
          {/* Bottom border */}
          <mesh position={[0, -SLANT_LEN / 2 + 0.02, 0.015]} castShadow receiveShadow>
            <boxGeometry args={[2.4, 0.04, 0.03]} />
            <meshStandardMaterial color="#ECEFF4" roughness={0.3} metalness={0.1} />
          </mesh>
          {/* Left border */}
          <mesh position={[-1.2 + 0.02, 0, 0.015]} castShadow receiveShadow>
            <boxGeometry args={[0.04, SLANT_LEN - 0.08, 0.03]} />
            <meshStandardMaterial color="#ECEFF4" roughness={0.3} metalness={0.1} />
          </mesh>
          {/* Right border */}
          <mesh position={[1.2 - 0.02, 0, 0.015]} castShadow receiveShadow>
            <boxGeometry args={[0.04, SLANT_LEN - 0.08, 0.03]} />
            <meshStandardMaterial color="#ECEFF4" roughness={0.3} metalness={0.1} />
          </mesh>

          {/* White Outer Frame around the display bezel */}
          <RoundedBox
            args={[0.82, 0.56, 0.01]}
            radius={0.025}
            smoothness={4}
            position={[-0.25, 0, 0.002]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial 
              color="#E5E9F0"       // Nord5: Slightly darker light gray to create a subtle depth shadow
              roughness={0.4}
              metalness={0.1}
            />
          </RoundedBox>

          {/* Physical Bezel under the Screen */}
          <RoundedBox
            args={[0.76, 0.50, 0.01]}
            radius={0.02}
            smoothness={4}
            position={[-0.25, 0, 0.005]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial 
              color="#05080c"       // Dark black glass bezel
              roughness={0.15}      // High gloss reflections
              metalness={0.9}       // Metallic shiny appearance
            />
          </RoundedBox>

          {/* Flat Screen */}
          <group position={[-0.25, 0, 0.011]}>
            <ScreenDisplay />
          </group>

          {/* Interactive settings dial */}
          <InteractiveKnob setControlsEnabled={setControlsEnabled} />
        </group>
      </group>

      {/* Orbit Controls */}
      <OrbitControls
        enabled={controlsEnabled}
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2 - 0.05} // Prevent camera going through the floor
        minDistance={2}
        maxDistance={6}
      />
    </Canvas>
  );
}
