"use client";
import React, { useEffect, useRef, useState } from "react";

type GameState = "menu" | "playing" | "gameover";

type PipeRect = { x: number; y: number; w: number; h: number; isTop?: boolean; id?: number };
// Single column (one pair) representation to avoid duplicated/overlapping columns
type PipeColumn = { x: number; w: number; topH: number; bottomH: number; id: number; counted?: boolean };

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const dprRef = useRef<number>(1);

  // Game objects
  const pengRef = useRef<any>(null);
  // use columns as authoritative representation to keep pairs together
  const pipesRef = useRef<PipeColumn[]>([]); // authoritative fast-ref (columns)
  const snowRef = useRef<any[]>([]);
  const scoreRef = useRef<number>(0);
  const highScoreKey = "floppy-penguin-highscore-v1";

  // Exposed React state for pipes (kept in sync on spawn/cleanup)
  const [pipes, setPipes] = useState<PipeColumn[]>([]);
  const [highScore, setHighScore] = useState<number>(0);
  const [gameState, setGameState] = useState<GameState>("menu");
  const gameStateRef = useRef<GameState>(gameState);
  const [score, setScore] = useState(0);
  const [scoreBounce, setScoreBounce] = useState(false);

  // mount guard to avoid hydration mismatch (render only on client)
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // Ensure immediate initial canvas sizing and one forced draw right after mount.
  // This prevents a blank screen on first load when layout measurements may lag.
  useEffect(() => {
    if (!isMounted) return;
    const canvas = canvasRef.current;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    dprRef.current = dpr;

    if (canvas) {
      // Force canvas pixel size to window dimensions as a safe initial fallback
      const iw = Math.max(1, Math.floor(window.innerWidth * dpr));
      const ih = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.width = iw;
      canvas.height = ih;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      // ensure game objects match these logical sizes
      if (!pengRef.current) resetGame(iw / dpr, ih / dpr);
      else pengRef.current.x = Math.round((canvas.width / dpr) * 0.28);
    }

    // Force an initial render tick so the splash background appears immediately
    lastTimeRef.current = performance.now();
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      // leave RAF to the central management; cleanup here only if we started one
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [isMounted]);

  // Spawning control
  const MIN_PIPE_DISTANCE = 300; // px minimum horizontal distance from right edge
  let nextPipeId = useRef<number>(1);

  // Settings (tweak for "heavy flop")
  // Use simple per-frame gravity and jump velocity for predictable behavior across sizes
  const gravity = 0.6; // px per frame
  const jumpVelocity = -10; // px per flap (instant upward velocity)
  const flapSpin = 6.0; // radians/sec impulse (visual only)
  const pipeSpeed = 360; // px/s (pipes still use dt for smoothness)
  const pipeGap = 160; // vertical gap
  const pipeWidth = 74;
  const groundHeight = 80;
  const spawnOffset = 60; // px from right edge

  // Initialize / reset
  function resetGame(width: number, height: number) {
    // defensively compute safe dimensions (fall back to window if container is collapsed/minimized)
    const safeW = width && width > 10 ? width : Math.max(1, window.innerWidth);
    const safeH = height && height > 10 ? height : Math.max(1, window.innerHeight);

    // reset score and pipes
    scoreRef.current = 0;
    setScore(0);
    pipesRef.current = [];
    setPipes([]);
    // reset any counters/state; pipes array already cleared in resetGame

    nextPipeId.current = 1;

    // reset peng
    pengRef.current = {
      x: Math.round(safeW * 0.28),
      y: Math.round(safeH * 0.45),
      w: 56,
      h: 46,
      vy: 0,
      angle: 0,
      av: 0,
      flapTimer: 0,
      isFlapping: false,
    };

    initSnow(safeW, safeH);

    // pre-populate a couple of columns spaced out off-screen to the right
    const spacing = Math.max(220, Math.floor(safeW * 0.34));
    for (let i = 0; i < 3; i++) {
      spawnPipePair(safeW + spawnOffset + i * spacing, safeH);
    }
  }

  function initSnow(width: number, height: number) {
    const n = Math.max(40, Math.floor((width * height) / 25000));
    const arr: any[] = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1 + Math.random() * 3,
        vy: 20 + Math.random() * 60,
        swPhase: Math.random() * Math.PI * 2,
      });
    }
    snowRef.current = arr;
  }

  // Spawn a single column (one top + one bottom) sharing the same X coordinate
  function spawnPipePair(baseX: number, height: number) {
    // safe vertical bounds for gap center
    const minGapY = 120;
    const maxGapY = Math.max(minGapY + 1, height - groundHeight - 120);
    const gapCenter = minGapY + Math.random() * (maxGapY - minGapY);

    // compute top and bottom heights (ensure minimum heights)
    const topH = Math.max(40, Math.round(gapCenter - pipeGap / 2));
    const bottomH = Math.max(40, Math.round(height - groundHeight - (gapCenter + pipeGap / 2)));

    const col: PipeColumn = { x: baseX, w: pipeWidth, topH, bottomH, id: nextPipeId.current++, counted: false };
    pipesRef.current.push(col);
    // update React state snapshot (only on structural change)
    setPipes([...pipesRef.current]);
  }

  // Input handling: flap
  function flap() {
    const peng = pengRef.current;
    if (!peng) return;

    // If still on menu splash, kick into play
    if (gameStateRef.current === "menu") {
      startPlay();
      return;
    }
    // don't flap if game over
    if (gameStateRef.current === "gameover") return;

    // apply an instantaneous upward velocity
    peng.vy = jumpVelocity;
    // visual spin impulse
    peng.av = (Math.random() * 2 - 1) * flapSpin;
    peng.isFlapping = true;
    peng.flapTimer = 0.22;
  }

  function startPlay() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resetGame(canvas.width / dprRef.current, canvas.height / dprRef.current);
    setGameState("playing");
    gameStateRef.current = "playing"; // ensure loop reads latest
    lastTimeRef.current = performance.now();
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
  function rectsOverlap(a: PipeRect, b: { x: number; y: number; w: number; h: number }) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Main loop
  function loop(ts: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // dt
    let dt = 0;
    if (lastTimeRef.current) dt = Math.min(0.033, (ts - lastTimeRef.current) / 1000);
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

    // Frame-based spawn
    // Distance-based spawning: spawn when no columns exist, or when last column has moved
    if (gameStateRef.current === "playing") {
      const last = pipesRef.current[pipesRef.current.length - 1];
      const shouldSpawn = !last || (w - last.x >= MIN_PIPE_DISTANCE);
      if (shouldSpawn) spawnPipePair(w + spawnOffset, h);
    }

    // Game updates
    if (gameStateRef.current === "playing") {
      const peng = pengRef.current;
      // physics (simple per-frame gravity for consistent flapping feel)
      peng.vy += gravity;
      peng.y += peng.vy;

      // keep angle updates time-based so rotation stays smooth independent of gravity model
      peng.angle += peng.av * dt;
      peng.av *= Math.max(0, 1 - dt * 1.8);

      if (peng.isFlapping) {
        peng.flapTimer -= dt;
        if (peng.flapTimer <= 0) peng.isFlapping = false;
      }

      // move pipes (update ref; avoid setState each frame)
      for (const p of pipesRef.current) {
        p.x -= pipeSpeed * dt;
      }

      // cleanup off-screen pipes
      const before = pipesRef.current.length;
      pipesRef.current = pipesRef.current.filter((p) => p.x + p.w > -50);
      if (pipesRef.current.length !== before) setPipes([...pipesRef.current]);

      // collision & scoring
      const pb = pengRef.current;
      const pengBox = { x: pb.x - pb.w / 2, y: pb.y - pb.h / 2, w: pb.w, h: pb.h };

      // ground / ceiling: clamp top, end game on hitting ground
      if (pengBox.y + pengBox.h > h - groundHeight) {
        pengRef.current.y = h - groundHeight - pb.h / 2;
        endGame();
      }
      if (pengBox.y < 0) {
        pengRef.current.y = pb.h / 2;
        pengRef.current.vy = 0;
      }

      // check collisions and scoring per column
      for (const col of pipesRef.current) {
        const topRect = { x: col.x, y: 0, w: col.w, h: col.topH };
        const bottomRect = { x: col.x, y: h - groundHeight - col.bottomH, w: col.w, h: col.bottomH };
        if (rectsOverlap(topRect as any, pengBox) || rectsOverlap(bottomRect as any, pengBox)) {
          endGame();
          break;
        }
        // scoring: when the column has moved past the peng and not yet counted
        if (!col.counted && col.x + col.w < pb.x) {
          col.counted = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
          bounceScore();
        }
      }
    } else if (gameStateRef.current === "menu") {
      const peng = pengRef.current;
      if (peng) {
        // gentle idle float while on menu
        peng.y += Math.sin(ts / 600) * 0.2;
        peng.vy = 0; // ensure no accumulated velocity while idle
      }
    }

    // Draw
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background: transparent so the container's CSS background image shows through.

    // Snow
    for (const s of snowRef.current) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw columns (each column has top and bottom)
    ctx.save();
    for (const col of pipesRef.current) {
      // top body gradient
      const topGrad = ctx.createLinearGradient(col.x, 0, col.x + col.w, col.topH);
      topGrad.addColorStop(0, "#071127"); topGrad.addColorStop(0.5, "#163343"); topGrad.addColorStop(1, "#2a5167");
      ctx.fillStyle = topGrad;
      ctx.fillRect(col.x, 0, col.w, col.topH);

      // bottom body gradient
      const bottomY = h - groundHeight - col.bottomH;
      const botGrad = ctx.createLinearGradient(col.x, bottomY, col.x + col.w, bottomY + col.bottomH);
      botGrad.addColorStop(0, "#071127"); botGrad.addColorStop(0.5, "#163343"); botGrad.addColorStop(1, "#2a5167");
      ctx.fillStyle = botGrad;
      ctx.fillRect(col.x, bottomY, col.w, col.bottomH);

      // caps (top cap at bottom edge of top pipe)
      const capRadiusX = col.w * 0.6;
      const capRadiusY = 12;
      // top cap
      const tgx = col.x + col.w / 2;
      const tgy = col.topH - 4;
      const trg = ctx.createRadialGradient(tgx, tgy, 2, tgx, tgy, capRadiusX);
      trg.addColorStop(0, "rgba(140,190,255,0.95)"); trg.addColorStop(0.45, "rgba(60,110,160,0.28)"); trg.addColorStop(1, "rgba(10,20,30,0)");
      ctx.fillStyle = trg; ctx.beginPath(); ctx.ellipse(tgx, tgy, capRadiusX, capRadiusY, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(200,230,255,0.9)"; ctx.beginPath(); ctx.ellipse(tgx, tgy, col.w / 2 + 6, 8, 0, 0, Math.PI * 2); ctx.fill();

      // bottom cap
      const bgx = col.x + col.w / 2;
      const bgy = bottomY + 4;
      const brg = ctx.createRadialGradient(bgx, bgy, 2, bgx, bgy, capRadiusX);
      brg.addColorStop(0, "rgba(140,190,255,0.95)"); brg.addColorStop(0.45, "rgba(60,110,160,0.28)"); brg.addColorStop(1, "rgba(10,20,30,0)");
      ctx.fillStyle = brg; ctx.beginPath(); ctx.ellipse(bgx, bgy, capRadiusX, capRadiusY, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(200,230,255,0.9)"; ctx.beginPath(); ctx.ellipse(bgx, bgy, col.w / 2 + 6, 8, 0, 0, Math.PI * 2); ctx.fill();

      // subtle stroke around both
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 2;
      ctx.strokeRect(col.x + 1, 1, col.w - 2, col.topH - 2);
      ctx.strokeRect(col.x + 1, bottomY + 1, col.w - 2, col.bottomH - 2);
    }
    ctx.restore();

    // Ground
    ctx.fillStyle = "#e9f7ff";
    ctx.fillRect(0, h - groundHeight, w, groundHeight);

    // Penguin draw
    const peng = pengRef.current;
    if (peng) {
      ctx.save();
      ctx.translate(peng.x, peng.y);
      ctx.rotate(peng.angle);
      // shadow
      ctx.beginPath(); ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.ellipse(0, 6, peng.w * 0.5, peng.h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      // body
      ctx.beginPath(); ctx.fillStyle = "#11161b"; ctx.ellipse(0, 0, peng.w / 2, peng.h / 2, 0, 0, Math.PI * 2); ctx.fill();
      // tummy
      const bodyGrad = ctx.createLinearGradient(-peng.w / 2, -peng.h / 2, peng.w / 2, peng.h / 2); bodyGrad.addColorStop(0, "#ffffff"); bodyGrad.addColorStop(1, "#E6F5FF"); ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.ellipse(0, 4, peng.w * 0.34, peng.h * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      // beak
      ctx.fillStyle = "#ff9b00"; ctx.beginPath(); ctx.moveTo(8, -6); ctx.quadraticCurveTo(16, -2, 8, 2); ctx.quadraticCurveTo(0, -2, 8, -6); ctx.fill();
      // eyes
      ctx.fillStyle = "white"; ctx.beginPath(); ctx.ellipse(-8, -6, 8, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(-2, -6, 8, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#06121c"; ctx.beginPath(); ctx.arc(-9, -5, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-1, -5, 3.2, 0, Math.PI * 2); ctx.fill();
      // flippers
      const flapAmp = peng.isFlapping ? Math.min(1, peng.flapTimer / 0.22) : Math.max(0, Math.min(1, Math.abs(peng.av) * 0.12));
      const leftAngle = -0.9 - flapAmp * 1.2 - peng.av * 0.07;
      const rightAngle = 0.9 + flapAmp * 1.2 + peng.av * 0.07;
      ctx.save(); ctx.rotate(leftAngle); ctx.fillStyle = "#0b2430"; ctx.beginPath(); ctx.ellipse(-peng.w * 0.65, 6, peng.w * 0.22, peng.h * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.save(); ctx.rotate(rightAngle); ctx.fillStyle = "#0b2430"; ctx.beginPath(); ctx.ellipse(peng.w * 0.65, 6, peng.w * 0.22, peng.h * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = "rgba(255,120,160,0.12)"; ctx.beginPath(); ctx.arc(6, -1, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // HUD
    ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = "bold 20px system-ui, 'Segoe UI', Roboto, Arial"; ctx.textAlign = "left"; ctx.fillText(`Flops: ${scoreRef.current}`, 18, 40); ctx.restore();

    rafRef.current = requestAnimationFrame(loop);
  }

  function bounceScore() { setScoreBounce(true); setTimeout(() => setScoreBounce(false), 420); }

  // Canvas sizing
  useEffect(() => {
    const isReadyRef = { current: false } as { current: boolean };
    function fitCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Use parent rect when available, fallback to window.inner* if parent size is zero
      const parent = canvas.parentElement!;
      let rect = parent.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        rect = { width: window.innerWidth, height: window.innerHeight, x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0 } as any;
      }

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;

      // set device pixels
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      // keep CSS size in logical pixels
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";

      // mark ready once we have valid sizes
      isReadyRef.current = canvas.width > 0 && canvas.height > 0;

      // ensure game resets to match real sizes (use logical pixels)
      if (!pengRef.current) resetGame(canvas.width / dpr, canvas.height / dpr);
      else pengRef.current.x = Math.round((canvas.width / dpr) * 0.28);

      // do not start RAF here — central RAF management is handled in the mount effect
    }

    // run immediately and observe changes
    fitCanvas();
    const ro = new ResizeObserver(fitCanvas);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    window.addEventListener("resize", fitCanvas);
    return () => { ro.disconnect(); window.removeEventListener("resize", fitCanvas); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start RAF — ensure only one loop exists. Cancel any existing before starting.
  useEffect(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Input attach (keyboard)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
      if ((e.key === "r" || e.key === "R") && gameStateRef.current === "gameover") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        resetGame(canvas.width / dprRef.current, canvas.height / dprRef.current);
        setGameState("playing");
        gameStateRef.current = "playing";
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pointer - canvas-local and a safe global fallback (ignore clicks on interactive UI)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onPointer = (e: PointerEvent) => { e.preventDefault(); flap(); };
    el.addEventListener("pointerdown", onPointer);

    const onPointerGlobal = (e: PointerEvent) => {
      // avoid interfering with UI controls (buttons/inputs/links)
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("button") || t.closest("a") || t.closest("input") || t.closest("textarea"))) return;
      flap();
    };
    window.addEventListener("pointerdown", onPointerGlobal);
    window.addEventListener("touchstart", onPointerGlobal, { passive: true });

    return () => {
      el.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerdown", onPointerGlobal);
      window.removeEventListener("touchstart", onPointerGlobal);
    };
  }, []);

  // sync gameState ref whenever state changes
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // load high score
  useEffect(() => { try { const v = Number(localStorage.getItem(highScoreKey) ?? 0); setHighScore(v); } catch {} }, []);

  // simple sync for displayed score
  useEffect(() => { setScore(scoreRef.current); }, [scoreRef.current]);

  const containerStyle: React.CSSProperties = { width: "100%", height: "100vh", position: "relative", overflow: "hidden", fontFamily: "'Segoe UI', Roboto, Arial, sans-serif", backgroundImage: "url('/background.png'), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)", backgroundSize: "cover, cover", backgroundRepeat: "no-repeat, no-repeat", backgroundPosition: "center center" };

  // Avoid rendering the interactive canvas on the server/hydration mismatch
  if (!isMounted) {
    return (
      <div style={{ width: "100%", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#08374a", background: "linear-gradient(180deg, #f6fbff, #e6f5ff)" }}>
        Loading Floppy Bird...
      </div>
    );
  }

  function startClicked() { startPlay(); }
  function onFlopAgain() { const canvas = canvasRef.current; if (!canvas) return; resetGame(canvas.width / dprRef.current, canvas.height / dprRef.current); setGameState("playing"); }

  return (
    <div style={containerStyle}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100vh", cursor: gameState === "playing" ? "none" : "pointer" }} />

      <div style={{ position: "absolute", left: 20, top: 14, color: "white", textShadow: "0 6px 18px rgba(0,0,0,0.45)", fontWeight: 800, fontSize: 22, transformOrigin: "left center", transition: "transform 220ms cubic-bezier(.2,.9,.2,1)", transform: scoreBounce ? "scale(1.18)" : "scale(1)", background: "linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))", padding: "6px 12px", borderRadius: 12, backdropFilter: "blur(6px)" }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>SCORE</div>
        <div style={{ fontSize: 24 }}>{score}</div>
      </div>

      {gameState === "menu" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
          <div style={{ width: 520, maxWidth: "92%", background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))", borderRadius: 18, padding: 28, textAlign: "center", boxShadow: "0 20px 60px rgba(3,18,30,0.45)", color: "#05202b", backdropFilter: "blur(8px)" }}>
            <h1 style={{ margin: 0, marginBottom: 6, fontSize: 38, color: "#08374a", letterSpacing: 0.6 }}>Floppy Bird: Penguin Edition</h1>
            <p style={{ marginTop: 0, marginBottom: 18, color: "#0b4b60" }}>Get Ready to Flop — guide the chubby penguin through icy icicle pillars!</p>
            <button onClick={startClicked} style={{ fontSize: 18, padding: "12px 26px", borderRadius: 999, border: "none", background: "linear-gradient(90deg, #7fe0ff, #4fb8ff)", color: "#012533", fontWeight: 800, boxShadow: "0 10px 30px rgba(34,170,255,0.12)", cursor: "pointer" }}>Get Ready to Flop</button>
            <div style={{ marginTop: 16, fontSize: 13, color: "#083b4c" }}>Click/tap or press Spacebar to flop.</div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#083b4c" }}>High Score: <strong>{highScore}</strong></div>
          </div>
        </div>
      )}

      {gameState === "gameover" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, rgba(0,12,20,0.1), rgba(0,8,16,0.36))", pointerEvents: "auto" }}>
          <div style={{ width: 420, maxWidth: "92%", background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", borderRadius: 14, padding: 24, color: "white", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", textAlign: "center", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <h2 style={{ margin: 0, marginBottom: 8, fontSize: 28 }}>Oh no — Flop-tastrophe!</h2>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 18 }}>The penguin took a clumsy tumble.</div>
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
              <button onClick={onFlopAgain} style={{ fontSize: 16, padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(90deg, #9be7ff, #4fb8ff)", color: "#012533", fontWeight: 800, cursor: "pointer" }}>Flop Again</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Press R to restart quickly</div>
          </div>
        </div>
      )}

      <div style={{ position: "absolute", right: 12, bottom: 12, color: "rgba(255,255,255,0.72)", fontSize: 12, textShadow: "0 6px 14px rgba(0,0,0,0.28)", background: "rgba(255,255,255,0.02)", padding: "8px 10px", borderRadius: 8 }}>Click / Tap / Space — Flap!</div>
    </div>
  );
}
