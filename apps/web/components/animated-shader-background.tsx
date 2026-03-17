'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;

vec3 palette(float t) {
  vec3 a = vec3(0.12, 0.10, 0.08);
  vec3 b = vec3(0.08, 0.06, 0.04);
  vec3 c = vec3(0.6, 0.4, 0.2);
  vec3 d = vec3(0.1, 0.05, 0.0);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= uResolution.x / uResolution.y;

  float dist = length(uv);
  float angle = atan(uv.y, uv.x);

  float wave1 = sin(dist * 8.0 - uTime * 1.5) * 0.5 + 0.5;
  float wave2 = sin(dist * 12.0 + angle * 3.0 - uTime * 2.0) * 0.5 + 0.5;
  float wave3 = sin(dist * 5.0 - angle * 2.0 + uTime * 0.8) * 0.5 + 0.5;

  float combined = (wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25);
  vec3 color = palette(combined + uTime * 0.05) * (1.0 - dist * 0.6);

  gl_FragColor = vec4(color * 0.3, 1.0);
}
`;

export default function AnimatedShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let animationId: number;
    const startTime = Date.now();

    const animate = () => {
      uniforms.uTime.value = (Date.now() - startTime) * 0.001;
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
