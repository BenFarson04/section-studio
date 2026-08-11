/* ╔══════════════════════════════════════════════════════════╗
 *  supports.js
 *
 *  Draws support symbols (Pinned, Roller, Fixed) on the beam
 *  canvas at each location defined in the shared supports
 *  array. Each type has gradient fills, shadow layers, and
 *  detail elements (hatching, rollers, bolts).
 *
 *  Dependencies:  canvas/setup.js, canvas/math.js,
 *                 state/store.js
 * ╚══════════════════════════════════════════════════════════╝ */

/* ─── Imports ────────────────────────────────────────────── */

import { ctx } from "../canvas/setup.js";
import { supports } from "../state/store.js";
import { beamXFromMetres, beamY } from "../canvas/math.js";


/* ═══════════════════════════════════════════════════════════
 *  SUPPORT RENDERERS
 * ═══════════════════════════════════════════════════════════ */

/* ─── Pinned Support ─────────────────────────────────────── */

function drawPinnedSupport(xMetres) {
  const x = beamXFromMetres(xMetres);
  const y = beamY();
  const size = 15;

  ctx.save();

  // Shadow layer
  ctx.fillStyle = "rgba(15, 23, 42, 0.15)";
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 1);
  ctx.lineTo(x - size + 1, y + size + 1);
  ctx.lineTo(x + size + 1, y + size + 1);
  ctx.closePath();
  ctx.fill();

  // Main triangle with gradient fill
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, "#f1f5f9");
  gradient.addColorStop(0.6, "#cbd5e1");
  gradient.addColorStop(1, "#94a3b8");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size, y + size);
  ctx.lineTo(x + size, y + size);
  ctx.closePath();
  ctx.fill();

  // Beveled edges
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "miter";
  ctx.stroke();

  // Highlight edge (left side)
  ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();

  // Ground line
  const groundY = y + size;
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - size - 6, groundY);
  ctx.lineTo(x + size + 6, groundY);
  ctx.stroke();

  // Ground hatch marks
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.5;
  for (let i = -size - 4; i <= size + 4; i += 6) {
    ctx.beginPath();
    ctx.moveTo(x + i, groundY);
    ctx.lineTo(x + i - 4, groundY + 5);
    ctx.stroke();
  }

  ctx.restore();
}

/* ─── Roller Support ─────────────────────────────────────── */

function drawRollerSupport(xMetres) {
  const x = beamXFromMetres(xMetres);
  const y = beamY();
  const size = 15;
  const radius = 4.5;

  ctx.save();

  // Shadow layer for triangle
  ctx.fillStyle = "rgba(15, 23, 42, 0.15)";
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 1);
  ctx.lineTo(x - size + 1, y + size + 1);
  ctx.lineTo(x + size + 1, y + size + 1);
  ctx.closePath();
  ctx.fill();

  // Main triangle
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, "#f1f5f9");
  gradient.addColorStop(0.6, "#cbd5e1");
  gradient.addColorStop(1, "#94a3b8");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size, y + size);
  ctx.lineTo(x + size, y + size);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "miter";
  ctx.stroke();

  // Highlight edge
  ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();

  // Rollers with metallic gradient
  const rollerY = y + size + radius + 1;

  [-7, 7].forEach(offset => {
    // Shadow
    ctx.fillStyle = "rgba(15, 23, 42, 0.2)";
    ctx.beginPath();
    ctx.arc(x + offset + 0.5, rollerY + 0.5, radius, 0, Math.PI * 2);
    ctx.fill();

    // Roller gradient
    const rollerGrad = ctx.createRadialGradient(
      x + offset - 1.5, rollerY - 1.5, 0,
      x + offset, rollerY, radius
    );
    rollerGrad.addColorStop(0, "#f8fafc");
    rollerGrad.addColorStop(0.5, "#cbd5e1");
    rollerGrad.addColorStop(1, "#64748b");

    ctx.fillStyle = rollerGrad;
    ctx.beginPath();
    ctx.arc(x + offset, rollerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Roller outline
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(x + offset - 1.5, rollerY - 1.5, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Ground line
  const groundY = rollerY + radius;
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - size - 6, groundY);
  ctx.lineTo(x + size + 6, groundY);
  ctx.stroke();

  // Ground hatch
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.5;
  for (let i = -size - 4; i <= size + 4; i += 6) {
    ctx.beginPath();
    ctx.moveTo(x + i, groundY);
    ctx.lineTo(x + i - 4, groundY + 5);
    ctx.stroke();
  }

  ctx.restore();
}

/* ─── Fixed Support ──────────────────────────────────────── */

function drawFixedSupport(xMetres) {
  const x = beamXFromMetres(xMetres);
  const y = beamY();
  const height = 36;
  const width = 10;

  ctx.save();

  // Shadow
  ctx.fillStyle = "rgba(15, 23, 42, 0.2)";
  ctx.fillRect(x + 1, y - height / 2 + 1, width, height);

  // Main wall with gradient
  const wallGradient = ctx.createLinearGradient(x, y, x + width, y);
  wallGradient.addColorStop(0, "#94a3b8");
  wallGradient.addColorStop(0.3, "#cbd5e1");
  wallGradient.addColorStop(1, "#e2e8f0");

  ctx.fillStyle = wallGradient;
  ctx.fillRect(x, y - height / 2, width, height);

  // Wall outline
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y - height / 2, width, height);

  // Vertical beam connection with bevel
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 4;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x, y + height / 2);
  ctx.stroke();

  // Highlight on beam edge
  ctx.strokeStyle = "rgba(248, 250, 252, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2 + 2);
  ctx.lineTo(x, y + height / 2 - 2);
  ctx.stroke();

  // Bolt pattern
  ctx.fillStyle = "#475569";
  const boltRadius = 2;
  for (let i = -height / 2 + 6; i < height / 2; i += 8) {
    // Bolt shadow
    ctx.fillStyle = "rgba(15, 23, 42, 0.3)";
    ctx.beginPath();
    ctx.arc(x + width / 2 + 0.5, y + i + 0.5, boltRadius, 0, Math.PI * 2);
    ctx.fill();

    // Bolt head
    const boltGrad = ctx.createRadialGradient(
      x + width / 2 - 0.5, y + i - 0.5, 0,
      x + width / 2, y + i, boltRadius
    );
    boltGrad.addColorStop(0, "#94a3b8");
    boltGrad.addColorStop(0.7, "#64748b");
    boltGrad.addColorStop(1, "#475569");

    ctx.fillStyle = boltGrad;
    ctx.beginPath();
    ctx.arc(x + width / 2, y + i, boltRadius, 0, Math.PI * 2);
    ctx.fill();

    // Bolt cross
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + width / 2 - 1.5, y + i);
    ctx.lineTo(x + width / 2 + 1.5, y + i);
    ctx.moveTo(x + width / 2, y + i - 1.5);
    ctx.lineTo(x + width / 2, y + i + 1.5);
    ctx.stroke();
  }

  ctx.restore();
}


/* ═══════════════════════════════════════════════════════════
 *  DRAW ALL SUPPORTS
 * ═══════════════════════════════════════════════════════════ */

export function drawSupports() {
  supports.forEach(s => {
    if (s.type === "Fixed") drawFixedSupport(s.location);
    if (s.type === "Pinned") drawPinnedSupport(s.location);
    if (s.type === "Roller") drawRollerSupport(s.location);
  });
}