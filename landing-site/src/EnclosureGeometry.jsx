import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * EnclosureGeometry Component
 * 
 * Generates the 3D enclosure of the respirator procedurally.
 * Profile:
 *   - Flat bottom from Z=0 to Z=1.6
 *   - Straight vertical face at the front up to Y=0.4
 *   - Slanted front panel going up-back from (Y=0.4, Z=1.6) to (Y=1.8, Z=0.7)
 *   - Flat top from Z=0.7 to Z=0 at Y=1.8
 *   - Vertical back face from Y=1.8 to Y=0 at Z=0
 * 
 * This shape is defined in 2D (Y-Z plane) and extruded along the X-axis (width = 2.4).
 */
export default function EnclosureGeometry() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // Starting bottom-back corner (x represents depth/Z, y represents height/Y)
    s.moveTo(0, 0); 
    s.lineTo(1.6, 0);       // Bottom face
    s.lineTo(1.6, 0.4);     // Front flat strip
    s.lineTo(0, 0.9);       // Slanted front panel (no top shelf)
    s.lineTo(0, 0);         // Back face
    return s;
  }, []);

  const extrudeSettings = useMemo(() => ({
    depth: 2.4,             // Extrusion depth (maps to width of device)
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.03,   // Subtle, high-quality beveled edge
    bevelSize: 0.02,
    bevelOffset: 0,
    bevelSegments: 4,
  }), []);

  return (
    <group>
      {/* 
        We rotate the extruded shape by -Math.PI / 2 around the Y-axis.
        This aligns:
          - Extrusion depth (Z) to the X-axis (Width = 2.4)
          - Shape X (depth = 1.6) to the Z-axis
          - Shape Y (height = 1.8) remains aligned with the Y-axis
        
        Offsets center the mesh at (0, 0, 0):
          - X offset: -1.2 (half of depth 2.4)
          - Y offset: -0.45 (half of height 0.9)
          - Z offset: -0.8 (half of depth 1.6)
      */}
      <mesh 
        castShadow 
        receiveShadow
        rotation={[0, -Math.PI / 2, 0]}
        position={[1.2, -0.45, -0.8]} // Align translation to center the rotated box
      >
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial 
          color="#ECEFF4"      // Nord6: Light Snow Storm
          roughness={0.3}      // Semi-matte finish
          metalness={0.1}      // Slight plastic/composite sheen
        />
      </mesh>
    </group>
  );
}
