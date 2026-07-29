"use client";
import React, { useEffect, useRef, useState } from "react";

type GameState = "menu" | "playing" | "gameover";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const dprRef = useRef<number>(1);

  // Game objects
  const pengRef = useRef<any>(null);
  const pipesRef = useRef<any[]>([]);
  const snowRef = useRef<any[]>([]);
  const scoreRef = useRef<number>(0);
  const highScoreKey = "floppy-penguin-highscore-v1";
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(highScoreKey) ?? 0);
    } catch {
      return 0;
    }
  });
  const [gameState, setGameState] = useState<GameState>("menu");
  const [score, setScore] = useState(0);
  const [scoreBounce, setScoreBounce] = useState(false);

  // Settings (tweak for "heavy flop")
  const gravity = 2200; // px/s^2 (heavy)
  const flapImpulse = -560; // px/s (strong, awkward)
  const flapSpin = 6.0; // radians/sec impulse
  const pipeSpeed = 360; // px/s
  const pipeGap = 160; // vertical gap
  const pipeSpacing = 220; // horizontal distance
  const pipeWidth = 74;
  const groundHeight = 80;
  const spawnOffset = 800;

  // Initialize / reset
  function resetGame(width: number, height: number) {
    scoreRef.current = 0;
    setScore(0);
    pipesRef.current = [];
    // Penguin properties
    pengRef.current = {
      x: Math.round(width * 0.28),
      y: Math.round(height * 0.45),
      w: 56,
      h: 46,
      vy: 0,
      angle: 0,
      av: 0,
      flapCooldown: 0,
      flapTimer: 0,
      isFlapping: false,
      spin: 0,
    };
    // Snow
    initSnow(width, height);
    // spawn initial pipes
    const initialCount = 3;
    for (let i = 0; i < initialCount; i++) {
      spawnPipe(width + i * pipeSpacing + 400, height);
    }
  }

  function initSnow(width: number, height: number) {
    const n = Math.max(40, Math.floor((width * height) / 25000));
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1 + Math.random() * 3,
        vy: 20 + Math.random() * 60,
        sway: Math.random() * 40,
        swPhase: Math.random() * Math.PI * 2,
      });
    }
    snowRef.current = arr;
  }

  function spawnPipe(x: number, height: number) {
    const minGapY = 120;
    const maxGapY = height - groundHeight - 120;
    const gapY = minGapY + Math.random() * (maxGapY - minGapY);
    const topH = gapY - pipeGap / 2;
    const bottomY = gapY + pipeGap / 2;
    pipesRef.current.push({
      x,
      w: pipeWidth,
      topH: Math.max(40, topH),
      bottomY: bottomY,
      passed: false,
      counted: false,
      jag: Math.random() * 8 - 4,
    });
  }

  // Input handling: flap
  function flap() {
    if (gameState === "menu") {
      startPlay();
      return;
    }
    if (gameState === "gameover") {
      return;
    }
    const peng = pengRef.current;
    if (!peng) return;
    // give awkward upward bounce and spin
    peng.vy = flapImpulse;
    peng.av = (Math.random() * 2 - 1) * flapSpin;
    peng.isFlapping = true;
    peng.flapTimer = 0.22;
    // small visual bounce on score?
  }

  function startPlay() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resetGame(canvas.width / dprRef.current, canvas.height / dprRef.current);
    setGameState("playing");
    lastTimeRef.current = performance.now();
    // start loop if not running
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(loop);
    }
  }

  function endGame() {
    setGameState("gameover");
    const final = scoreRef.current;
    try {
      const existing = Number(localStorage.getItem(highScoreKey) ?? 0);
      if (final > existing) {
        localStorage.setItem(highScoreKey, String(final));
        setHighScore(final);
      }
    } catch {}
  }

  // Collision detection (AABB)
  function checkCollisionRect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Main loop
  function loop(ts: number) {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = null;
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = null;
      return;
    }
    const dt = Math.min(0.033, (ts - lastTimeRef.current) / 1000 || 0.016);
    lastTimeRef.current = ts;
    const w = canvas.width / dprRef.current;
    const h = canvas.height / dprRef.current;

    // Update snow
    for (const s of snowRef.current) {
      s.y += s.vy * dt;
      s.swPhase += dt * 0.6;
      s.x += Math.sin(s.swPhase) * 6 * dt;
      if (s.y - s.r > h) {
        s.y = -s.r;
        s.x = Math.random() * w;
      }
    }

    // Game updates
    if (gameState === "playing") {
      const peng = pengRef.current;
      // physics
      peng.vy += gravity * dt;
      peng.y += peng.vy * dt;
      peng.angle += peng.av * dt;
      // angular damping
      peng.av *= Math.max(0, 1 - dt * 1.8);

      // flap timer for wing animation
      if (peng.isFlapping) {
        peng.flapTimer -= dt;
        if (peng.flapTimer <= 0) {
          peng.isFlapping = false;
        }
      }

      // pipes movement
      for (const p of pipesRef.current) {
        p.x -= pipeSpeed * dt;
      }
      // spawn
      if (pipesRef.current.length === 0 || pipesRef.current[pipesRef.current.length - 1].x < w + spawnOffset - pipeSpacing) {
        spawnPipe(w + spawnOffset, h);
      }
      // remove off-screen
      if (pipesRef.current.length > 0 && pipesRef.current[0].x + pipeWidth < -100) {
        pipesRef.current.shift();
      }

      // collisions & scoring
      const pb = pengRef.current;
      const pengBox = { x: pb.x - pb.w / 2, y: pb.y - pb.h / 2, w: pb.w, h: pb.h };

      // ground / ceiling
      if (pengBox.y + pengBox.h > h - groundHeight) {
        // hit ground
        pengRef.current.y = h - groundHeight - pb.h / 2;
        endGame();
      }
      if (pengBox.y < 0) {
        pengRef.current.y = pb.h / 2;
        endGame();
      }

      for (const p of pipesRef.current) {
        // top rect: x, 0, w, topH
        // bottom rect: x, bottomY, w, h-bottomY-ground
        const topRect = { x: p.x, y: 0, w: p.w, h: p.topH };
        const bottomRect = { x: p.x, y: p.bottomY, w: p.w, h: h - p.bottomY - groundHeight };
        if (
          checkCollisionRect(pengBox.x, pengBox.y, pengBox.w, pengBox.h, topRect.x, topRect.y, topRect.w, topRect.h) ||
          checkCollisionRect(pengBox.x, pengBox.y, pengBox.w, pengBox.h, bottomRect.x, bottomRect.y, bottomRect.w, bottomRect.h)
        ) {
          endGame();
        }
        // scoring when passed center
        if (!p.counted && p.x + p.w < pb.x) {
          p.counted = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
          bounceScore();
        }
      }
    }

    // Drawing
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background gradient (icy blues)
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#d9f1ff");
    g.addColorStop(0.35, "#b6e8ff");
    g.addColorStop(0.7, "#9ddfff");
    g.addColorStop(1, "#a7e3ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // soft vignette
    const vg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 10, canvas.width / 2, canvas.height / 2, canvas.width * 0.9);
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(1, "rgba(0,20,40,0.16)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Snowflakes (small, subtle)
    ctx.save();
    ctx.scale(dprRef.current, dprRef.current);
    ctx.globalAlpha = 0.9;
    for (const s of snowRef.current) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      const x = s.x;
      const y = s.y;
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Draw icy pillars / pipes
    ctx.save();
    ctx.scale(dprRef.current, dprRef.current);
    ctx.lineJoin = "round";
    for (const p of pipesRef.current) {
      // slight wobble for frozen look
      const wob = Math.sin((ts / 600) + p.jag) * 3;
      // top
      const tx = p.x;
      const ty = 0;
      const tw = p.w;
      const th = p.topH;
      // gradient for icy pillar
      const pg = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
      pg.addColorStop(0, "#cfefff");
      pg.addColorStop(0.5, "#9fd9ff");
      pg.addColorStop(1, "#8fcfff");
      ctx.fillStyle = pg;
      // draw top icicle jagged edge
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + tw, ty);
      // jagged inner
      const jagCount = Math.max(4, Math.floor(tw / 12));
      for (let i = 0; i <= jagCount; i++) {
        const px = tx + (i / jagCount) * tw;
        const py = ty + (Math.sin(i + p.jag * 3) * 6 + 6);
        ctx.lineTo(px, py);
      }
      ctx.lineTo(tx + tw, ty + th);
      ctx.lineTo(tx, ty + th);
      ctx.closePath();
      ctx.fill();
      // snow cap on bottom side of top pillar
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.ellipse(tx + tw / 2, Math.max(ty + th - 6, 0), tw / 2 + 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // bottom pillar
      const bx = p.x;
      const by = p.bottomY;
      const bh = h - by - groundHeight;
      const bg = ctx.createLinearGradient(bx, by, bx + tw, by + bh);
      bg.addColorStop(0, "#bfeaff");
      bg.addColorStop(0.6, "#8fd8ff");
      bg.addColorStop(1, "#7fc9ff");
      ctx.fillStyle = bg;
      ctx.fillRect(bx, by, tw, bh);
      // snow cap on top of bottom pillar
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.ellipse(bx + tw / 2, by + 6, tw / 2 + 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // subtle highlight
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 2;
      ctx.strokeRect(tx + 2, ty + 4, tw - 4, th - 8);
    }
    ctx.restore();

    // Ground (icy ridge)
    ctx.save();
    ctx.scale(dprRef.current, dprRef.current);
    ctx.fillStyle = "#e9f7ff";
    ctx.fillRect(0, h - groundHeight, w, groundHeight);
    // ridged snowy ground
    ctx.fillStyle = "#f6fcff";
    for (let i = 0; i < w; i += 40) {
      ctx.beginPath();
      ctx.ellipse(i + 20, h - groundHeight + 8, 28, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw penguin (center stage)
    const peng = pengRef.current;
    if (peng) {
      ctx.save();
      ctx.scale(dprRef.current, dprRef.current);
      ctx.translate(peng.x, peng.y);
      ctx.rotate(peng.angle);
      // body shadow
      ctx.beginPath();
      ctx.fillStyle = "#0a2a3a";
      ctx.ellipse(0, 6, peng.w * 0.5, peng.h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // body
      const bodyGrad = ctx.createLinearGradient(-peng.w / 2, -peng.h / 2, peng.w / 2, peng.h / 2);
      bodyGrad.addColorStop(0, "#ffffff");
      bodyGrad.addColorStop(0.4, "#f6f6f9");
      bodyGrad.addColorStop(1, "#E6F5FF");
      ctx.fillStyle = "#11161b"; // outer dark shell
      // outer shell
      ctx.beginPath();
      ctx.ellipse(0, 0, peng.w / 2, peng.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // tummy
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 4, peng.w * 0.34, peng.h * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // beak
      const beakY = -6;
      ctx.beginPath();
      ctx.fillStyle = "#ff9b00";
      ctx.moveTo(8, beakY);
      ctx.quadraticCurveTo(16, beakY + 4, 8, beakY + 8);
      ctx.quadraticCurveTo(0, beakY + 4, 8, beakY);
      ctx.fill();

      // eyes (big and goofy)
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.ellipse(-8, -6, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, -6, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#06121c";
      ctx.beginPath();
      ctx.arc(-9, -5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-1, -5, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // flippers: animated around flap timer
      const flapAmp = peng.isFlapping ? Math.min(1, peng.flapTimer / 0.22) : Math.max(0, Math.min(1, Math.abs(peng.av) * 0.12));
      const leftAngle = -0.9 - flapAmp * 1.2 - peng.av * 0.07;
      const rightAngle = 0.9 + flapAmp * 1.2 + peng.av * 0.07;

      ctx.save();
      // left flipper
      ctx.rotate(leftAngle);
      ctx.fillStyle = "#0b2430";
      ctx.beginPath();
      ctx.ellipse(-peng.w * 0.65, 6, peng.w * 0.22, peng.h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      // right flipper
      ctx.rotate(rightAngle);
      ctx.fillStyle = "#0b2430";
      ctx.beginPath();
      ctx.ellipse(peng.w * 0.65, 6, peng.w * 0.22, peng.h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // rosy cheek
      ctx.fillStyle = "rgba(255,120,160,0.12)";
      ctx.beginPath();
      ctx.arc(6, -1, 6, 0, Math.PI * 2);
      ctx.fill();

      // wobble accent (tiny stars)
      ctx.restore();
    }

    // UI overlay drawing can be done in HTML elements; but draw score on canvas for in-play clarity
    ctx.save();
    ctx.scale(dprRef.current, dprRef.current);
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.font = "bold 28px 'Segoe UI', Roboto, Arial";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 6;
    ctx.fillText("Flops: " + scoreRef.current, 18, 46);
    ctx.restore();

    // continue loop
    rafRef.current = requestAnimationFrame(loop);
  }

  function bounceScore() {
    setScoreBounce(true);
    setTimeout(() => setScoreBounce(false), 420);
  }

  // Canvas sizing
  useEffect(() => {
    function fitCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement!;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      // reset or adjust peng position to new size if in menu or starting
      if (gameState === "menu") {
        resetGame(canvas.width / dpr, canvas.height / dpr);
      } else if (gameState === "playing") {
        // keep peng relative
        const peng = pengRef.current;
        if (peng) {
          peng.x = Math.round((canvas.width / dpr) * 0.28);
        }
      }
    }
    fitCanvas();
    const ro = new ResizeObserver(fitCanvas);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    window.addEventListener("resize", fitCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fitCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Start animation loop on mount (keeps background alive)
  useEffect(() => {
    if (!rafRef.current) {
      lastTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Input attach
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (gameState === "menu") startPlay();
        else if (gameState === "playing") flap();
        else if (gameState === "gameover") {
          // nothing - click button to restart
        }
      }
      if (e.key === "r" || e.key === "R") {
        // quick restart
        if (gameState === "gameover") {
          setTimeout(() => {
            startPlay();
          }, 100);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Pointer / click
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (gameState === "menu") startPlay();
      else if (gameState === "playing") flap();
    };
    el.addEventListener("pointerdown", onPointer);
    return () => el.removeEventListener("pointerdown", onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // keep displayed score sync with ref
  useEffect(() => {
    setScore(scoreRef.current);
  }, [scoreRef.current]);

  // Simple CSS for overlays
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100vh",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
  };

  // Start button handler
  function onPlayClicked() {
    startPlay();
  }
  function onFlopAgain() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resetGame(canvas.width / dprRef.current, canvas.height / dprRef.current);
    setGameState("playing");
  }

  // Render UI overlays
  return (
    <div style={containerStyle}>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100vh",
          cursor: gameState === "playing" ? "none" : "pointer",
        }}
      />
      {/* Top overlay: Score with bouncing animation */}
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 14,
          color: "white",
          textShadow: "0 6px 18px rgba(0,0,0,0.45)",
          fontWeight: 800,
          fontSize: 22,
          transformOrigin: "left center",
          transition: "transform 220ms cubic-bezier(.2,.9,.2,1)",
          transform: scoreBounce ? "scale(1.18)" : "scale(1)",
          background: "linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          padding: "6px 12px",
          borderRadius: 12,
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.85 }}>SCORE</div>
        <div style={{ fontSize: 24 }}>{score}</div>
      </div>

      {/* Start Screen */}
      {gameState === "menu" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: "92%",
              background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
              borderRadius: 18,
              padding: 28,
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(3,18,30,0.45)",
              color: "#05202b",
              backdropFilter: "blur(8px)",
            }}
          >
            <h1
              style={{
                margin: 0,
                marginBottom: 6,
                fontSize: 38,
                color: "#08374a",
                letterSpacing: 0.6,
              }}
            >
              Floppy Bird: Penguin Edition
            </h1>
            <p style={{ marginTop: 0, marginBottom: 18, color: "#0b4b60" }}>
              Get Ready to Flop — guide the chubby penguin through icy icicle pillars!
            </p>
            <button
              onClick={onPlayClicked}
              style={{
                fontSize: 18,
                padding: "12px 26px",
                borderRadius: 999,
                border: "none",
                background:
                  "linear-gradient(90deg, #7fe0ff, #4fb8ff)",
                color: "#012533",
                fontWeight: 800,
                boxShadow: "0 10px 30px rgba(34,170,255,0.12)",
                cursor: "pointer",
              }}
            >
              Get Ready to Flop
            </button>
            <div style={{ marginTop: 16, fontSize: 13, color: "#083b4c" }}>
              Click/tap or press Spacebar to flop.
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#083b4c" }}>
              High Score: <strong>{highScore}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === "gameover" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(180deg, rgba(0,12,20,0.1), rgba(0,8,16,0.36))",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: "92%",
              background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
              borderRadius: 14,
              padding: 24,
              color: "white",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              textAlign: "center",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <h2 style={{ margin: 0, marginBottom: 8, fontSize: 28 }}>Oh no — Flop-tastrophe!</h2>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 18 }}>
              The penguin took a clumsy tumble.
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 18, marginBottom: 8 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 10, minWidth: 120 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>SCORE</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{score}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 10, minWidth: 120 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>HIGH</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{highScore}</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={onFlopAgain}
                style={{
                  fontSize: 16,
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    "linear-gradient(90deg, #9be7ff, #4fb8ff)",
                  color: "#012533",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Flop Again
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Press R to restart quickly
            </div>
          </div>
        </div>
      )}

      {/* small help / credits */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          color: "rgba(255,255,255,0.72)",
          fontSize: 12,
          textShadow: "0 6px 14px rgba(0,0,0,0.28)",
          background: "rgba(255,255,255,0.02)",
          padding: "8px 10px",
          borderRadius: 8,
        }}
      >
        Click / Tap / Space — Flap!
      </div>
    </div>
  );
}
