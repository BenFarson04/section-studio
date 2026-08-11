/* ╔══════════════════════════════════════════════════════════╗
 *  staticallyDeterminate.js
 *
 *  Checks whether the current support configuration forms a
 *  statically determinate 2D beam by counting reaction
 *  degrees of freedom against the three equilibrium equations.
 *
 *  Dependencies:  state/store.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { supports } from "../state/store.js";

/* ─── Stability Check ────────────────────────────────────── */

export function checkBeamStability() {
    let R = 0;

    supports.forEach(support => {
        switch (support.type) {
            case "Roller":
                R += 1;
                break;
            case "Pinned":
                R += 2;
                break;
            case "Fixed":
                R += 3;
                break;
            default:
                throw new Error(`Unknown support type: ${support.type}`);
        }
    });

    // Degrees of static indeterminacy for a 2D beam
    const dsi = R - 3;

    if (dsi < 0) {
        return {
            status: "unstable",
            ok: false,
            warning: "Structure is unstable"
        };
    }

    if (dsi > 0) {
        return {
            status: "statically indeterminate",
            ok: false,
            dsi,
            warning: `Structure is statically indeterminate to degree ${dsi}`
        };
    }

    return {
        status: "statically determinate",
        ok: true,
        dsi: 0,
        message: "Structure is statically determinate."
    };
}