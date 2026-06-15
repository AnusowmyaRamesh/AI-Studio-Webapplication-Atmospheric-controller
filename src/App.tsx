/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Snowflake, Wind, Sparkles, HelpCircle, AlertCircle, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Particle types for snowflakes and balloons
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  color: string;
  swayAmount: number;
  swaySpeed: number;
  swayOffset: number;
  // Specific balloon properties
  stringLength: number;
}

export default function App() {
  // Active study type: 'snowflakes' | 'balloons' | null
  const [activeEffect, setActiveEffect] = useState<"snowflakes" | "balloons" | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0); // remaining milliseconds (0 to 5000)
  
  // Audio state & Web Audio refs
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioLfoRef = useRef<OscillatorNode | null>(null);
  const audioFilterRef = useRef<BiquadFilterNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioChimeIntervalRef = useRef<any>(null);

  // Track continuous stats for the formal laboratory dashboard
  const [activeCount, setActiveCount] = useState<number>(0);
  const [renderedFrames, setRenderedFrames] = useState<number>(60);

  // References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const effectStartTimeRef = useRef<number>(0);

  // Spawn rates configuration
  const SPAWN_INTERVAL = 120; // ms between particle creation during active window
  const lastSpawnTimeRef = useRef<number>(0);

  // Editorial muted/translucent earthy and charcoal colors for balloons
  const BALLOON_PALETTES = [
    "rgba(18, 18, 18, 0.45)",     // Muted deep charcoal ink
    "rgba(58, 77, 95, 0.45)",     // Slate Prussian blue
    "rgba(110, 80, 65, 0.45)",     // Raw terracotta umber
    "rgba(75, 90, 75, 0.45)",      // Sage mineral olive
    "rgba(135, 115, 80, 0.45)",    // Antique ochre gold
    "rgba(115, 115, 120, 0.45)",   // Architectural ash grey
  ];

  // Particle creation functions
  const createSnowflake = (width: number, verticalDispersed = false): Particle => {
    return {
      id: Math.random(),
      x: Math.random() * width,
      // If true, spread them out so when the study initialises they aren't all clustered at the top
      y: verticalDispersed ? Math.random() * window.innerHeight : -20,
      size: 4 + Math.random() * 8, // Medium size: 4px to 12px
      speedY: 1.2 + Math.random() * 2.0, // Consistent gentle downward motion
      speedX: -0.4 + Math.random() * 0.8,
      opacity: 0.35 + Math.random() * 0.55,
      color: "rgba(18, 18, 18, 0.75)", // Delicate ink sketch color
      swayAmount: 0.6 + Math.random() * 1.4,
      swaySpeed: 0.01 + Math.random() * 0.02,
      swayOffset: Math.random() * Math.PI * 2,
      stringLength: 0,
    };
  };

  const createBalloon = (width: number, verticalDispersed = false): Particle => {
    const size = 18 + Math.random() * 12; // Medium size: 18px to 30px radius (36px to 60px diameter)
    const randomColor = BALLOON_PALETTES[Math.floor(Math.random() * BALLOON_PALETTES.length)];
    return {
      id: Math.random(),
      x: Math.random() * width,
      y: verticalDispersed 
        ? Math.random() * window.innerHeight 
        : window.innerHeight + 50 + (Math.random() * 100),
      size,
      speedY: -(1.5 + Math.random() * 1.8), // Uniform gentle weightless ascension
      speedX: -0.3 + Math.random() * 0.6,
      opacity: 0.85 + Math.random() * 0.15,
      color: randomColor,
      swayAmount: 12 + Math.random() * 16, // swaying width
      swaySpeed: 0.008 + Math.random() * 0.012,
      swayOffset: Math.random() * Math.PI * 2,
      stringLength: 45 + Math.random() * 25, // hanging string detail
    };
  };

  // Resize canvas to full viewport bounds
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Web Audio Synth dynamic setup
  useEffect(() => {
    // If audio is disabled, or no effect is active, make sure to smoothly fade out and stop
    if (!audioEnabled || !activeEffect) {
      if (audioGainRef.current && audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        const gainNode = audioGainRef.current;
        try {
          const now = ctx.currentTime;
          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now);
          gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.6); // smooth fade out
        } catch (e) {
          // ignore context state issues
        }
      }
      
      // Clear chime loops
      if (audioChimeIntervalRef.current) {
        clearInterval(audioChimeIntervalRef.current);
        audioChimeIntervalRef.current = null;
      }
      
      // Schedule complete shutdown after fade out
      const stopTimer = setTimeout(() => {
        if (!audioEnabled || !activeEffect) {
          try {
            if (audioSourceRef.current) {
              audioSourceRef.current.stop();
              audioSourceRef.current.disconnect();
              audioSourceRef.current = null;
            }
            if (audioLfoRef.current) {
              audioLfoRef.current.stop();
              audioLfoRef.current.disconnect();
              audioLfoRef.current = null;
            }
          } catch (e) {
            // Safe fallback
          }
        }
      }, 700);

      return () => clearTimeout(stopTimer);
    }

    // Otherwise, audio is enabled and activeEffect is specified:
    // 1. Initialise Context if missing
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Wake context if suspended (browser security constraint)
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Reset previous sources if any
    try {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      }
      if (audioLfoRef.current) {
        audioLfoRef.current.stop();
        audioLfoRef.current.disconnect();
      }
    } catch (e) {}

    // 2. Build our persistent dynamic volume node
    if (!audioGainRef.current) {
      audioGainRef.current = ctx.createGain();
      audioGainRef.current.connect(ctx.destination);
    }
    const mainGain = audioGainRef.current;
    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(0.35, now + 0.4); // smoothly fade in

    // 3. Build dynamic White Noise buffer source (acts as wind/buoyant currents)
    const bufferSize = ctx.sampleRate * 2.5; // 2.5s loop
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    audioSourceRef.current = noiseSource;

    // 4. Build resonant bandpass filter for simulating organic wind gusts
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    audioFilterRef.current = filter;

    // 5. Connect noise -> filter -> main gain
    noiseSource.connect(filter);
    filter.connect(mainGain);

    // 6. Customise synthesizer characteristics based on effect type
    if (activeEffect === "snowflakes") {
      // Wind whistling LFO for a cold arctic feel
      filter.Q.value = 6.0; // very resonant whistle
      filter.frequency.setValueAtTime(480, now);

      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.12, now); // slow rhythmic breath (0.12 Hz)
      
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(220, now); // swing up/down by 220Hz
      
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      
      lfo.start(now);
      audioLfoRef.current = lfo;

      // Start the wind loop
      noiseSource.start(now);

      // Trigger crisp crystalline ice chimes periodically
      const triggerChime = () => {
        try {
          const chimeOsc = ctx.createOscillator();
          const chimeGain = ctx.createGain();
          
          const freq = 1400 + Math.random() * 1600; // bell-like crystal harmonics
          chimeOsc.frequency.setValueAtTime(freq, ctx.currentTime);
          chimeOsc.type = "sine";
          
          chimeGain.gain.setValueAtTime(0, ctx.currentTime);
          chimeGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.04);
          chimeGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
          
          chimeOsc.connect(chimeGain);
          chimeGain.connect(mainGain);
          
          chimeOsc.start();
          chimeOsc.stop(ctx.currentTime + 2.0);
        } catch (err) {}
      };

      // Play initial chime and scheduled
      triggerChime();
      const chimeInterval = setInterval(triggerChime, 1100);
      audioChimeIntervalRef.current = chimeInterval;

    } else if (activeEffect === "balloons") {
      // Warm rising thermal expansion sound
      filter.Q.value = 1.8; // broad soft warm air draft
      filter.frequency.setValueAtTime(280, now);

      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.08, now); // extremely slow swell (0.08 Hz)
      
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(90, now); // swing between 190 and 370Hz
      
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      
      lfo.start(now);
      audioLfoRef.current = lfo;

      // Start the balloon warm air noise loop
      noiseSource.start(now);

      // Trigger soft buoyant rubber pops or bubbles periodically
      const triggerBubble = () => {
        try {
          const bubbleOsc = ctx.createOscillator();
          const bubbleGain = ctx.createGain();
          
          const pitch = 200 + Math.random() * 140; // warm wood/bubble tone
          bubbleOsc.frequency.setValueAtTime(pitch, ctx.currentTime);
          bubbleOsc.frequency.exponentialRampToValueAtTime(pitch * 1.5, ctx.currentTime + 0.22);
          bubbleOsc.type = "sine";
          
          bubbleGain.gain.setValueAtTime(0, ctx.currentTime);
          bubbleGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.03);
          bubbleGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
          
          bubbleOsc.connect(bubbleGain);
          bubbleGain.connect(mainGain);
          
          bubbleOsc.start();
          bubbleOsc.stop(ctx.currentTime + 0.4);
        } catch (err) {}
      };

      triggerBubble();
      const bubbleInterval = setInterval(triggerBubble, 850);
      audioChimeIntervalRef.current = bubbleInterval;
    }

    return () => {
      // Cleanup on component unmount or next trigger
      if (audioChimeIntervalRef.current) {
        clearInterval(audioChimeIntervalRef.current);
      }
    };
  }, [audioEnabled, activeEffect]);

  // Primary animation loop
  useEffect(() => {
    let frameCount = 0;
    let lastFpsUpdateTime = Date.now();

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const now = Date.now();
      const elapsedSinceStart = activeEffect ? now - effectStartTimeRef.current : 0;
      
      // Update dynamic timer count beautifully
      if (activeEffect) {
        const remaining = Math.max(0, 5000 - elapsedSinceStart);
        setTimeLeft(remaining);
        
        // Stop the active effect once exactly 5000ms has elapsed.
        // Let existing particles drift out and fade smoothly instead of abrupt destruction.
        if (remaining <= 0) {
          setActiveEffect(null);
        }
      }

      // Calculate performance FPS for standard diagnostic readout
      frameCount++;
      if (now - lastFpsUpdateTime >= 1000) {
        setRenderedFrames(Math.round((frameCount * 1000) / (now - lastFpsUpdateTime)));
        frameCount = 0;
        lastFpsUpdateTime = now;
      }

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Handle continuous spawning of particles during the 5 second study
      if (activeEffect && remainingTime() > 0) {
        if (now - lastSpawnTimeRef.current >= SPAWN_INTERVAL) {
          if (activeEffect === "snowflakes") {
            particlesRef.current.push(createSnowflake(canvas.width, false));
          } else if (activeEffect === "balloons") {
            particlesRef.current.push(createBalloon(canvas.width, false));
          }
          lastSpawnTimeRef.current = now;
        }
      }

      // Read current state of particles and update
      const currentParticles = particlesRef.current;
      const nextParticles: Particle[] = [];

      currentParticles.forEach((p) => {
        // Increment swaying cycles
        p.swayOffset += p.swaySpeed;
        const currentSway = Math.sin(p.swayOffset) * p.swayAmount;

        // Apply velocities
        let currentX = p.x + p.speedX;
        let currentY = p.y + p.speedY;

        // Overlay horizontal drift swayed elegantly by time
        if (activeEffect === "snowflakes") {
          currentX += Math.sin(p.swayOffset) * 0.7;
        } else {
          // Balloons sway wider
          currentX += Math.cos(p.swayOffset) * 0.45;
        }

        // Handle bounds and life-stages
        let isAlive = true;
        
        // If the active study has finished, let particles fade out gracefully to complete their arc
        let finalOpacity = p.opacity;
        if (!activeEffect) {
          // Decay faster once study is disabled
          finalOpacity -= 0.012;
          if (finalOpacity <= 0) isAlive = false;
        }

        // Boundary checks
        if (activeEffect === "snowflakes") {
          if (currentY > canvas.height + 20) {
            // Re-spawn at top if still in active session
            if (activeEffect && remainingTime() > 0) {
              currentY = -20;
              currentX = Math.random() * canvas.width;
              finalOpacity = 0.35 + Math.random() * 0.55;
            } else {
              isAlive = false;
            }
          }
        } else if (activeEffect === "balloons") {
          // If balloon completely floats off screen with its string
          if (currentY < -p.size - p.stringLength - 30) {
            // Re-spawn at bottom if still in active session
            if (activeEffect && remainingTime() > 0) {
              currentY = canvas.height + 50 + (Math.random() * 50);
              currentX = Math.random() * canvas.width;
              finalOpacity = 0.85 + Math.random() * 0.15;
            } else {
              isAlive = false;
            }
          }
        }

        p.x = currentX;
        p.y = currentY;
        p.opacity = finalOpacity;

        if (isAlive) {
          nextParticles.push(p);

          // Draw the particle
          if (p.stringLength > 0) {
            // Render a beautiful minimalist balloon
            drawBalloon(ctx, p.x, p.y, p.size, p.opacity, p.color, p.swayOffset, p.stringLength);
          } else {
            // Render a gorgeous high-fidelity snowflake
            drawSnowflake(ctx, p.x, p.y, p.size, p.opacity);
          }
        }
      });

      // Maintain internal states
      particlesRef.current = nextParticles;
      setActiveCount(nextParticles.length);

      // Request next frame
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeEffect]);

  // Read clean remaining time
  const remainingTime = () => {
    if (!activeEffect) return 0;
    return timeLeft;
  };

  // Drawing routines for high aesthetics (Editorial Aesthetic)
  const drawSnowflake = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    opacity: number
  ) => {
    ctx.save();
    
    // Subtle white glow backdrop underneath the dark ink line (makes them contrast beautifully on parchment)
    const radialGrad = ctx.createRadialGradient(x, y, 0, x, y, size * 1.4);
    radialGrad.addColorStop(0, `rgba(255, 255, 255, ${opacity * 0.8})`);
    radialGrad.addColorStop(0.5, `rgba(255, 255, 255, ${opacity * 0.4})`);
    radialGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    
    ctx.beginPath();
    ctx.arc(x, y, size * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = radialGrad;
    ctx.fill();

    // Fine, elegant, hand-sketched structure (ink/charcoal theme)
    // Core node
    ctx.beginPath();
    ctx.arc(x, y, size * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(18, 18, 18, ${opacity * 0.85})`;
    ctx.fill();

    // Slate-grey crystalline rays
    ctx.strokeStyle = `rgba(18, 18, 18, ${opacity * 0.75})`;
    ctx.lineWidth = 1.0;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 + (y * 0.003); // very slow majestic spin
      const extX = x + Math.cos(angle) * (size * 0.85);
      const extY = y + Math.sin(angle) * (size * 0.85);
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(extX, extY);
      ctx.stroke();

      // Delicate secondary branches
      const branchX = x + Math.cos(angle) * (size * 0.5);
      const branchY = y + Math.sin(angle) * (size * 0.5);
      const subAngleL = angle - Math.PI / 4;
      const subAngleR = angle + Math.PI / 4;

      ctx.beginPath();
      ctx.moveTo(branchX, branchY);
      ctx.lineTo(branchX + Math.cos(subAngleL) * (size * 0.3), branchY + Math.sin(subAngleL) * (size * 0.3));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(branchX, branchY);
      ctx.lineTo(branchX + Math.cos(subAngleR) * (size * 0.3), branchY + Math.sin(subAngleR) * (size * 0.3));
      ctx.stroke();
    }

    ctx.restore();
  };

  const drawBalloon = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    opacity: number,
    color: string,
    swayOffset: number,
    stringLength: number
  ) => {
    ctx.save();
    
    const rX = size;
    const rY = size * 1.35; // elongated oval matching the exact mathematical description of editorial theme

    // 1. Draw elegant delicate hanging string (behind biological body of balloon)
    ctx.beginPath();
    ctx.moveTo(x, y + rY);
    
    const cp1X = x + Math.sin(swayOffset) * rX * 0.4;
    const cp1Y = y + rY + stringLength * 0.33;
    const cp2X = x - Math.cos(swayOffset) * rX * 0.3;
    const cp2Y = y + rY + stringLength * 0.66;
    const endX = x + Math.sin(swayOffset * 0.6) * rX * 0.2;
    const endY = y + rY + stringLength;

    ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
    ctx.strokeStyle = `rgba(18, 18, 18, ${opacity * 0.38})`; // structured ink string
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 2. Draw crisp structural triangle joint at base of the balloon (tie)
    ctx.beginPath();
    ctx.moveTo(x, y + rY - 1);
    ctx.lineTo(x - rX * 0.14, y + rY + rX * 0.1);
    ctx.lineTo(x + rX * 0.14, y + rY + rX * 0.1);
    ctx.closePath();
    ctx.fillStyle = color.replace("0.45", `${opacity * 0.75}`);
    ctx.fill();

    // Secondary minimal stroke for the tie to match structured lineart
    ctx.strokeStyle = `rgba(18, 18, 18, ${opacity * 0.85})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 3. Draw main balloon body with exquisite translucent shading and a fine 1px charcoal outline
    ctx.beginPath();
    ctx.ellipse(x, y, rX, rY, 0, 0, Math.PI * 2);

    // Subtle premium gradient matching the physical 3D studio light matte description
    const gradient = ctx.createRadialGradient(x - rX * 0.2, y - rY * 0.2, 2, x, y, rY * 1.2);
    gradient.addColorStop(0, color.replace("0.45", `${opacity * 0.35}`));
    gradient.addColorStop(0.7, color.replace("0.45", `${opacity * 0.18}`));
    gradient.addColorStop(1, color.replace("0.45", `${opacity * 0.05}`));

    ctx.fillStyle = gradient;
    ctx.fill();

    // Crisp fine outer perimeter ink line
    ctx.strokeStyle = `rgba(18, 18, 18, ${opacity * 0.9})`;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 4. Subtle chic white reflection glare
    ctx.beginPath();
    ctx.ellipse(x - rX * 0.35, y - rY * 0.35, rX * 0.2, rY * 0.15, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.4})`;
    ctx.fill();

    ctx.restore();
  };

  // Click triggers
  const triggerStudy = (type: "snowflakes" | "balloons") => {
    // Clear any previous active status timers cleanly
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // Proactively wake up Web Audio context on user trigger if audio is enabled
    if (audioEnabled && audioCtxRef.current) {
      audioCtxRef.current.resume().catch(() => {});
    }
    
    // Transition or initial setting
    setActiveEffect(type);
    setTimeLeft(5000);
    effectStartTimeRef.current = Date.now();
    lastSpawnTimeRef.current = Date.now();

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Instant initial generation burst of medium particles across screen area
    const initialPool: Particle[] = [];
    const seedAmount = type === "snowflakes" ? 22 : 12;

    for (let i = 0; i < seedAmount; i++) {
      if (type === "snowflakes") {
        initialPool.push(createSnowflake(canvas.width, true));
      } else {
        initialPool.push(createBalloon(canvas.width, true));
      }
    }
    
    particlesRef.current = initialPool;
  };

  // Helper values for display computation
  const progressRatio = timeLeft / 5000;
  const formattedTime = (timeLeft / 1000).toFixed(2);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#F4F1EA] text-[#121212] flex flex-col justify-between p-6 sm:p-12 md:p-16 select-none font-serif">
      
      {/* Absolute Backdrop Canvas and Particle Surface */}
      <canvas
        id="particle-stage"
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Editorial aesthetic absolute borders */}
      <div className="absolute inset-0 border-[16px] sm:border-[24px] border-[#121212] pointer-events-none z-50 feedback-border" />

      {/* Grid division lines matching template */}
      <div className="absolute top-28 left-0 w-full h-px bg-[#121212] opacity-10 pointer-events-none" />
      <div className="absolute top-0 left-1/2 w-px h-full bg-[#121212] opacity-10 pointer-events-none hidden lg:block" />

      {/* Header telemetry display consistent with editorial style */}
      <header className="relative w-full z-10 flex justify-between items-baseline pt-2">
        <div className="font-sans text-[9px] sm:text-[10px] tracking-[0.2em] uppercase font-bold text-[#121212]">
          Atmospheric Control // Index 402
        </div>
        <div className="font-sans text-[9px] sm:text-[10px] tracking-[0.2em] uppercase font-bold text-[#121212] flex items-center gap-3">
          <span className="hidden md:inline">RENDER: {renderedFrames} FPS |</span>
          <span>Est. MMXXIV</span>
        </div>
      </header>

      {/* Main Study Control Panel Interface */}
      <main className="relative flex-1 flex flex-col justify-center items-center text-center z-10 py-8 max-w-4xl mx-auto w-full">
        {/* Editorial Heading */}
        <h1 className="text-[48px] sm:text-[85px] md:text-[110px] font-serif italic mb-3 tracking-tighter leading-none text-[#121212] select-none">
          Form &amp; <br className="sm:hidden" /> Gravity
        </h1>
        <p className="max-w-md font-sans text-[9px] sm:text-[10px] md:text-[11px] leading-relaxed opacity-60 mb-8 sm:mb-12 uppercase tracking-[0.4em] mx-auto select-none">
          A minimalist investigation into buoyant structures and thermal dynamics within a structured digital space.
        </p>

        {/* Core Navigation Buttons aligned horizontal with premium states */}
        <div id="selection-row" className="flex flex-col sm:flex-row gap-4 sm:gap-10 mb-8 sm:mb-12 w-full justify-center px-4 max-w-2xl">
          <motion.button
            id="trigger-snowflakes"
            onClick={() => triggerStudy("snowflakes")}
            whileHover={{ scale: 1.025 }}
            whileTap={{ scale: 0.975 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={`group relative px-8 py-4 sm:px-14 sm:py-5 border border-[#121212] font-sans text-[10px] uppercase tracking-[0.4em] transition-colors duration-300 outline-none select-none cursor-pointer ${
              activeEffect === "snowflakes"
                ? "bg-[#121212] text-[#F4F1EA]"
                : "bg-transparent text-[#121212] hover:bg-[#121212] hover:text-[#F4F1EA]"
            }`}
          >
            <span className="relative z-10">Snowflakes</span>
          </motion.button>

          <motion.button
            id="trigger-balloons"
            onClick={() => triggerStudy("balloons")}
            whileHover={{ scale: 1.025 }}
            whileTap={{ scale: 0.975 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={`group relative px-8 py-4 sm:px-14 sm:py-5 border border-[#121212] font-sans text-[10px] uppercase tracking-[0.4em] transition-colors duration-300 outline-none select-none cursor-pointer ${
              activeEffect === "balloons"
                ? "bg-[#121212] text-[#F4F1EA]"
                : "bg-transparent text-[#121212] hover:bg-[#121212] hover:text-[#F4F1EA]"
            }`}
          >
            <span className="relative z-10">Balloons</span>
          </motion.button>
        </div>

        {/* Display Telemetry Subcomponents & Dynamic Progress Bar */}
        <div id="telemetry-panel" className="w-full max-w-xs font-mono text-[10px] tracking-wider text-[#121212]/80">
          <AnimatePresence mode="wait">
            {activeEffect ? (
              <motion.div
                key="telemetry-active"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex flex-col gap-2.5"
              >
                <div className="flex justify-between uppercase">
                  <span>Simulation Duration:</span>
                  <span className="font-bold">{formattedTime}s</span>
                </div>
                
                {/* Progress meter (Thin subtle hairline) */}
                <div className="w-full h-[1px] bg-[#121212]/15 relative overflow-hidden">
                  <motion.div
                    className="h-full bg-[#121212] absolute left-0 top-0"
                    style={{ width: `${progressRatio * 100}%` }}
                    transition={{ ease: "linear", duration: 0 }}
                  />
                </div>

                <div className="flex justify-between text-[8px] opacity-60">
                  <span>ENTITIES: {activeCount}</span>
                  <span>SYSTEM STATUS: CALIBRATING</span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="telemetry-idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-center items-center gap-2 py-2 max-w-xs mx-auto border-t border-b border-[#121212]/10 uppercase text-[9px] opacity-60"
              >
                <span>Select state to initiate equilibrium study</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Formal minimal Footer note */}
      <footer className="relative w-full z-10 flex justify-between items-end pb-2">
        <div className="flex flex-col gap-1 text-left">
          <span className="font-sans text-[8px] sm:text-[9px] uppercase tracking-[0.1em] opacity-40">Ambient State</span>
          <span className="font-serif italic text-lg sm:text-xl text-[#121212]">Stable Equilibrium</span>
        </div>
        
        {/* Subtle, formal audio toggle button */}
        <div className="hidden md:flex flex-col items-center justify-center gap-1 mb-2">
          <button
            id="toggle-audio"
            onClick={() => {
              const nextVal = !audioEnabled;
              setAudioEnabled(nextVal);
              // Proactively resume context on click to guarantee immediate sound activation
              if (nextVal) {
                if (!audioCtxRef.current) {
                  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                  if (AudioContextClass) {
                    audioCtxRef.current = new AudioContextClass();
                  }
                }
                audioCtxRef.current?.resume().catch(() => {});
              }
            }}
            className="flex items-center gap-2 px-4 py-1.5 border border-[#121212]/20 hover:border-[#121212] transition-colors duration-300 font-sans text-[8px] sm:text-[9px] uppercase tracking-[0.15em] bg-transparent text-[#121212]/80 hover:text-[#121212] cursor-pointer outline-none select-none"
          >
            {audioEnabled ? (
              <>
                <Volume2 className="h-3 w-3 text-emerald-800 animate-pulse" />
                <span>Ambient Audio: On</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3 w-3 opacity-60" />
                <span>Ambient Audio: Off</span>
              </>
            )}
          </button>
        </div>

        <div className="text-right flex flex-col gap-1">
          <span className="font-sans text-[8px] sm:text-[9px] uppercase tracking-[0.1em] opacity-40">Global Reference</span>
          <div className="font-serif italic text-lg sm:text-xl text-[#121212]">48.8566° N, 2.3522° E</div>
        </div>
      </footer>
    </div>
  );
}
