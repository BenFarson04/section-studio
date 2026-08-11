/* ╔══════════════════════════════════════════════════════════╗
 *  reactions.js
 *
 *  Solves support reactions for statically determinate beams
 *  using equilibrium equations. Supports two configurations:
 *
 *    • Cantilever  (single fixed support)
 *    • Simply supported  (two supports: pinned + roller)
 *
 *  Dependencies:  state/store.js,
 *                 analysis/staticallyDeterminate.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { supports, udls, pointLoads } from "../state/store.js";
import { checkBeamStability } from "./staticallyDeterminate.js";


/* ═══════════════════════════════════════════════════════════
 *  UDL RESULTANT HELPER
 * ═══════════════════════════════════════════════════════════ */

function udlsAverage(udl) {
  const a = udl.start;
  const b = udl.end;
  const w1 = udl.startLoad;
  const w2 = udl.endLoad;

  const L = b - a;

  // Total load (kN)
  const W = 0.5 * (w1 + w2) * L;

  // Centroid location
  let x;
  if (Math.abs(w1 + w2) < 1e-12) {
    x = a + L / 2;
  } else {
    const xFromStart = L * (w1 + 2 * w2) / (3 * (w1 + w2));
    x = a + xFromStart;
  }

  return {
    magnitude: W,
    location: x
  };
}


/* ═══════════════════════════════════════════════════════════
 *  REACTION SOLVER
 * ═══════════════════════════════════════════════════════════ */

export function solveReactions() {

  /* ─── Stability Check ──────────────────────────────────── */

  const stability = checkBeamStability();

  if (!stability.ok) {
    return {
      ok: false,
      message: stability.warning || stability.message,
      stability
    };
  }

  if (stability.status === "statically indeterminate") {
    return {
      ok: false,
      message: `Statically indeterminate (degree ${stability.dsi}). Solver is statics-only.`,
      stability
    };
  }

  const s = [...supports].sort((a, b) => a.location - b.location);

  /* ─── Cantilever (single fixed support) ────────────────── */

  if (s.length === 1 && s[0].type === "Fixed") {
    const xF = s[0].location;

    let totalLoad = 0;
    let momentAboutFixed = 0;

    pointLoads.forEach(pl => {
      totalLoad += pl.load;
      momentAboutFixed += pl.load * (pl.location - xF);
    });

    udls.forEach(udl => {
      const { magnitude, location } = udlsAverage(udl);
      totalLoad += magnitude;
      momentAboutFixed += magnitude * (location - xF);
    });

    return {
      ok: true,
      type: "cantilever",
      reactions: [
        {
          supportIndex: 0,
          x: xF,
          Rv: totalLoad,
          M: momentAboutFixed
        }
      ],
      stability
    };
  }

  /* ─── Simply Supported (two supports) ──────────────────── */

  if (s.length === 2) {
    const xA = s[0].location;
    const xB = s[1].location;
    const span = xB - xA;

    if (span <= 0) {
      return {
        ok: false,
        message: "Supports must be at different locations."
      };
    }

    let totalLoad = 0;
    let momentAboutA = 0;

    pointLoads.forEach(pl => {
      totalLoad += pl.load;
      momentAboutA += pl.load * (pl.location - xA);
    });

    udls.forEach(udl => {
      const { magnitude, location } = udlsAverage(udl);
      totalLoad += magnitude;
      momentAboutA += magnitude * (location - xA);
    });

    const RB = momentAboutA / span;
    const RA = totalLoad - RB;

    return {
      ok: true,
      type: "simply-supported",
      reactions: [
        { supportIndex: 0, x: xA, Rv: RA },
        { supportIndex: 1, x: xB, Rv: RB }
      ],
      stability
    };
  }

  /* ─── Unsupported Configuration ────────────────────────── */

  return {
    ok: false,
    message: "Unsupported support configuration for statics-only solver."
  };
}