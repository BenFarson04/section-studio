/* ╔══════════════════════════════════════════════════════════╗
 *  reactions.js
 *
 *  Solves support reactions for statically determinate beams
 *  using first-principles equilibrium. The sign convention is:
 *
 *    • downward loads are negative,
 *    • upward reactions are positive,
 *    • clockwise moments are negative.
 *
 *  Supported configurations:
 *    • single fixed support (cantilever),
 *    • two simple supports (pin/roller),
 *
 *  Dependencies:  state/store.js,
 *                 analysis/staticallyDeterminate.js
 * ╚══════════════════════════════════════════════════════════╝ */

import { supports, udls, pointLoads } from "../state/store.js";
import { checkBeamStability } from "./staticallyDeterminate.js";

export function udlsAverage(udl) {
  const a = Number(udl.start);
  const b = Number(udl.end);
  const q1 = Number(udl.startLoad ?? 0);
  const q2 = Number(udl.endLoad ?? 0);
  const L = b - a;

  if (!(L > 0)) {
    return { magnitude: 0, location: a };
  }

  const W = 0.5 * (q1 + q2) * L;

  let x;
  if (Math.abs(q1 + q2) < 1e-12) {
    x = a + L / 2;
  } else {
    const xFromStart = L * (q1 + 2 * q2) / (3 * (q1 + q2));
    x = a + xFromStart;
  }

  return { magnitude: W, location: x };
}

export function solveReactions() {
  const stability = checkBeamStability();

  if (!stability.ok) {
    return {
      ok: false,
      message: stability.warning || stability.message,
      stability,
    };
  }

  if (stability.status === "statically indeterminate") {
    return {
      ok: false,
      message: `Statically indeterminate (degree ${stability.dsi}). Solver is statics-only.`,
      stability,
    };
  }

  const s = [...supports].sort((a, b) => a.location - b.location);

  if (s.length === 1 && s[0].type === "Fixed") {
    const xF = s[0].location;

    let totalVertical = 0;
    let momentAboutFixed = 0;

    pointLoads.forEach((pl) => {
      totalVertical += pl.load;
      momentAboutFixed += pl.load * (pl.location - xF);
    });

    udls.forEach((udl) => {
      const { magnitude, location } = udlsAverage(udl);
      totalVertical += magnitude;
      momentAboutFixed += magnitude * (location - xF);
    });

    return {
      ok: true,
      type: "cantilever",
      reactions: [
        {
          supportIndex: 0,
          x: xF,
          Rv: totalVertical,
          M: -momentAboutFixed,
        },
      ],
      stability,
    };
  }

  if (s.length === 2) {
    const xA = s[0].location;
    const xB = s[1].location;
    const span = xB - xA;

    if (span <= 0) {
      return {
        ok: false,
        message: "Supports must be at different locations.",
      };
    }

    let totalVertical = 0;
    let momentAboutA = 0;

    pointLoads.forEach((pl) => {
      totalVertical += pl.load;
      momentAboutA += pl.load * (pl.location - xA);
    });

    udls.forEach((udl) => {
      const { magnitude, location } = udlsAverage(udl);
      totalVertical += magnitude;
      momentAboutA += magnitude * (location - xA);
    });

    const RB = momentAboutA / span;
    const RA = totalVertical - RB;

    return {
      ok: true,
      type: "simply-supported",
      reactions: [
        { supportIndex: 0, x: xA, Rv: RA },
        { supportIndex: 1, x: xB, Rv: RB },
      ],
      stability,
    };
  }

  return {
    ok: false,
    message: "Unsupported support configuration for statics-only solver.",
  };
}
