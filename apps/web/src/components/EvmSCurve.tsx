import { useMemo, useState } from "react";
import type { EvmSeriesPoint } from "@atelier/scheduling-engine";
import { EUR, fmtDate } from "../domain";

const W = 640;
const H = 160;
const PAD = { top: 12, right: 16, bottom: 28, left: 52 };
const STORAGE_KEY = "atelier-evm-scurve-open";

interface Props {
  series: EvmSeriesPoint[];
  statusDate: string;
  /** When false, hide the collapse control (e.g. print report). Default true. */
  collapsible?: boolean;
}

function polyline(
  points: EvmSeriesPoint[],
  key: "pv" | "ev" | "ac",
  xOf: (i: number) => number,
  yOf: (v: number) => number,
): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(" ");
}

function readOpenPreference(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function EvmSCurve({ series, statusDate, collapsible = true }: Props) {
  const [open, setOpen] = useState(readOpenPreference);

  const chart = useMemo(() => {
    if (series.length < 2) return null;
    const maxY = Math.max(...series.flatMap((p) => [p.pv, p.ev, p.ac]), 1);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xOf = (i: number) => PAD.left + (i / (series.length - 1)) * innerW;
    const yOf = (v: number) => PAD.top + innerH - (v / maxY) * innerH;
    const statusIdx = series.findIndex((p) => p.date >= statusDate);
    const statusX = statusIdx >= 0 ? xOf(statusIdx) : null;
    const ticks = [0, 0.5, 1].map((t) => ({
      y: yOf(maxY * t),
      label: EUR.format(maxY * t),
    }));
    const dateTicks = [0, Math.floor((series.length - 1) / 2), series.length - 1].map((i) => ({
      x: xOf(i),
      label: fmtDate(series[i]!.date),
    }));
    return { maxY, xOf, yOf, statusX, ticks, dateTicks };
  }, [series, statusDate]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const showChart = !collapsible || open;

  if (!chart || series.length < 2) {
    return (
      <div className={`evm-scurve${!showChart ? " collapsed" : " empty"}`}>
        <div className="evm-scurve-head">
          {collapsible ? (
            <button
              type="button"
              className="evm-scurve-toggle"
              onClick={toggle}
              aria-expanded={showChart}
              aria-label={showChart ? "Masquer les courbes S" : "Afficher les courbes S"}
            >
              <span className="evm-scurve-chevron" aria-hidden>
                {showChart ? "▾" : "▸"}
              </span>
              Courbes S
            </button>
          ) : (
            <span className="evm-scurve-title">Courbes S</span>
          )}
        </div>
        {showChart && <p className="evm-scurve-empty-msg">Courbe S indisponible (planning trop court).</p>}
      </div>
    );
  }

  const { xOf, yOf, statusX, ticks, dateTicks } = chart;

  return (
    <div className={`evm-scurve${!showChart ? " collapsed" : ""}`}>
      <div className="evm-scurve-head">
        {collapsible ? (
          <button
            type="button"
            className="evm-scurve-toggle"
            onClick={toggle}
            aria-expanded={showChart}
            aria-label={showChart ? "Masquer les courbes S" : "Afficher les courbes S"}
          >
            <span className="evm-scurve-chevron" aria-hidden>
              {showChart ? "▾" : "▸"}
            </span>
            Courbes S
          </button>
        ) : (
          <span className="evm-scurve-title">Courbes S</span>
        )}
        {showChart && (
          <div className="evm-scurve-legend" aria-hidden>
            <span className="leg pv">VP (PV)</span>
            <span className="leg ev">VA (EV)</span>
            <span className="leg ac">CR (AC)</span>
          </div>
        )}
      </div>
      {showChart && (
        <svg viewBox={`0 0 ${W} ${H}`} className="evm-scurve-svg" role="img" aria-label="Courbes S PV EV AC">
          {ticks.map((t) => (
            <g key={t.label}>
              <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} className="scurve-grid" />
              <text x={PAD.left - 6} y={t.y + 3} textAnchor="end" className="scurve-tick">
                {t.label}
              </text>
            </g>
          ))}
          {dateTicks.map((t) => (
            <text key={t.label + t.x} x={t.x} y={H - 8} textAnchor="middle" className="scurve-tick">
              {t.label}
            </text>
          ))}
          {statusX != null && (
            <line x1={statusX} y1={PAD.top} x2={statusX} y2={H - PAD.bottom} className="scurve-status" />
          )}
          <path d={polyline(series, "pv", xOf, yOf)} className="scurve-line pv" fill="none" />
          <path d={polyline(series, "ev", xOf, yOf)} className="scurve-line ev" fill="none" />
          <path d={polyline(series, "ac", xOf, yOf)} className="scurve-line ac" fill="none" />
        </svg>
      )}
    </div>
  );
}
