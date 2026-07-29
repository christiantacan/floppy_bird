RAG: Retrieval Reference for Floppy Bird (Penguin Edition)

Purpose
-------
This file is a compact, fast-reference summary of the codebase meant to be used as a RAG (retrieval) source for future assistant sessions. It helps the assistant reduce tokens by loading only relevant context and provides explicit pointers to where important logic lives.

Location
--------
Project root: D:\coding\floppy_bird
This file: D:\coding\floppy_bird\RAG.md
Main runnable entry: app/page.tsx (the entire game lives here)

High-level summary
------------------
- Single page Next.js app (App Router) with a client-side "use client" page at app/page.tsx.
- The game runs on an HTML5 Canvas and implements heavy-flop physics for a penguin character navigating icy pillars.
- UI overlays (Start screen, Game Over) are in JSX inside page.tsx; styles in app/globals.css and styles/globals.css.
- LocalStorage key for high score: "floppy-penguin-highscore-v1".
- Run: npm install && npm run dev → http://localhost:3000

Key files & responsibilities (quick index)
-----------------------------------------
- app/page.tsx: Full game code (physics, rendering, loop, input, collision, score, UI overlays). PRIMARY RAG TARGET.
  - Top: physics & gameplay constants (gravity, flapImpulse, pipeSpeed, pipeGap, pipeSpacing, groundHeight, pipeWidth)
  - Functions of interest: resetGame(), spawnPipe(), flap(), startPlay(), endGame(), loop(), checkCollisionRect().
  - State refs: pengRef, pipesRef, snowRef, scoreRef. UI state: gameState, score, highScore.
- app/layout.tsx: Root layout imports app/globals.css.
- app/globals.css and styles/globals.css: global styling and canvas defaults.
- package.json: dependency and script configuration (next, react, react-dom). Check versions if Next errors occur.
- next.config.js, tsconfig.json: basic Next/TypeScript config.

Important constants (copy these when you need physics context)
------------------------------------------------------------
- gravity = 2200 px/s^2
- flapImpulse = -560 px/s
- flapSpin = 6 (radians/sec impulse)
- pipeSpeed = 360 px/s
- pipeGap = 160 px
- pipeSpacing = 220 px
- pipeWidth = 74 px
- groundHeight = 80 px
- localStorage key: "floppy-penguin-highscore-v1"

Token-efficiency guidance (how the assistant should use this RAG)
----------------------------------------------------------------
1. For UI/visual tweaks or bug fixes, read only app/page.tsx but request specific line ranges or function names (e.g., search for "spawnPipe" or "loop") instead of the whole file.
2. For style changes, read app/globals.css and styles/globals.css only.
3. For run/build issues, read package.json and next.config.js.
4. If the user reports an error, ask for the exact console output and the list of recently modified files (diff) so only changed sections are retrieved.

How to update RAG.md
--------------------
- Edit this file any time you move major logic out of page.tsx or rename keys/constants.
- When significant gameplay constants change, update the "Important constants" list.

Session-start templates (copy/paste when starting a new assistant session for this project)
----------------------------------------------------------------------------------------
Option A — Minimal (preferred for token efficiency):
"Project path: D:\coding\floppy_bird. Please load RAG from RAG.md. Task: <brief task>. Changed files since RAG: <comma-separated list>. Error logs (if any): <paste>."

Option B — If asking to modify code immediately (give file targets):
"Project path: D:\coding\floppy_bird. Load RAG. Task: <e.g., 'tune gravity and flap feel'>. Edit targets: app/page.tsx (list functions/lines if known)."

What to include when reporting bugs
----------------------------------
- Exact dev server log lines and browser console error stack.
- The git diff or names of changed files since last commit (if no git, list file names modified).
- Steps to reproduce (clicks, keys, device type, screen size).

Best practices to keep token usage low
-------------------------------------
- Give the RAG load command (see templates) so the assistant reads RAG.md first.
- Provide targeted file names or function names rather than asking "read the whole project".
- When possible, supply small diffs or the small snippet you changed.

Contact points (fast lookup)
----------------------------
- To tweak physics: edit constants near top of app/page.tsx.
- To fix canvas sizing or DPR problems: inspect fitCanvas() in page.tsx.
- To change High Score behavior: search for highScoreKey variable in page.tsx.

End of RAG
----------
Keep this file synchronized with real code. When RAG.md is up-to-date, tell the assistant to "Load RAG" at session start so it can apply these retrieval heuristics and fetch only necessary files/line ranges.