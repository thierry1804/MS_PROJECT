import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import type { CalendarDef, Resource, ScheduleResult } from "@atelier/scheduling-engine";
import { ROW_H } from "./components/Gantt";
import { GanttExportFrame } from "./components/GanttExportFrame";
import type { Project } from "./domain";
import { fmtDate } from "./domain";
import type { TimeRange } from "./gantt-utils";

const GANTT_HEADER_H = 48;
const EXPORT_TITLE_H = 44;
const EXPORT_MIN_DAY_WIDTH = 14;
const EXPORT_GRID_WIDTH = 560;
const EXPORT_GRID_WIDTH_VARIANCE = 680;
const MAX_CANVAS_PX = 16384;

const EXPORT_TOKENS = [
  "--paper-0",
  "--paper-1",
  "--paper-2",
  "--ink-0",
  "--ink-1",
  "--ink-2",
  "--ink-3",
  "--accent",
  "--accent-soft",
  "--critical",
  "--milestone",
  "--bar-fill",
  "--bar-summary",
  "--weekend",
] as const;

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resolveCssVar(name: string): string {
  const probe = document.createElement("span");
  probe.style.setProperty("color", `var(${name})`);
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb;
}

function injectResolvedTokens(root: HTMLElement): string {
  const paper0 = resolveCssVar("--paper-0");
  for (const name of EXPORT_TOKENS) {
    root.style.setProperty(name, resolveCssVar(name));
  }
  return paper0;
}

function inlineSvgCssVars(root: HTMLElement) {
  const style = getComputedStyle(root);
  const resolve = (value: string): string => {
    if (!value.includes("var(")) return value;
    const m = value.match(/var\((--[^,)]+)/);
    if (!m?.[1]) return value;
    const varName = m[1];
    const resolved = style.getPropertyValue(varName).trim();
    return resolved || resolveCssVar(varName);
  };

  root.querySelectorAll("svg [fill], svg [stroke]").forEach((node) => {
    const el = node as SVGElement;
    for (const attr of ["fill", "stroke"] as const) {
      const raw = el.getAttribute(attr);
      if (raw?.includes("var(")) el.setAttribute(attr, resolve(raw));
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function captureScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  if (longest <= MAX_CANVAS_PX) return 1;
  return MAX_CANVAS_PX / longest;
}

export interface ExportGanttOptions {
  project: Project;
  schedule: ScheduleResult;
  resources: Resource[];
  calendar: CalendarDef;
  range: TimeRange;
  dayWidth: number;
  showVariance: boolean;
  todayISO: string;
}

/** Render the full Gantt off-screen and download it as a PNG image. */
export async function exportGanttPng(opts: ExportGanttOptions): Promise<void> {
  const exportDayWidth = Math.max(opts.dayWidth, EXPORT_MIN_DAY_WIDTH);
  const gridW = opts.showVariance ? EXPORT_GRID_WIDTH_VARIANCE : EXPORT_GRID_WIDTH;
  const taskIds = opts.schedule.outline;
  const ganttW = Math.ceil(opts.range.days * exportDayWidth);
  const bodyH = taskIds.length * ROW_H;
  const contentH = GANTT_HEADER_H + bodyH;
  const totalW = gridW + ganttW;
  const totalH = EXPORT_TITLE_H + contentH;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(host);

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const root = createRoot(host);
  root.render(
    createElement(GanttExportFrame, {
      project: opts.project,
      schedule: opts.schedule,
      taskIds,
      range: opts.range,
      dayWidth: exportDayWidth,
      gridWidth: gridW,
      calendar: opts.calendar,
      resources: opts.resources,
      todayISO: opts.todayISO,
      showVariance: opts.showVariance,
      onReady: resolveReady,
    }),
  );

  await ready;
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const frame = host.querySelector(".gantt-export-frame") as HTMLElement | null;
  if (!frame) {
    root.unmount();
    host.remove();
    throw new Error("Impossible de préparer l'export Gantt.");
  }

  const paper0 = injectResolvedTokens(frame);
  inlineSvgCssVars(frame);

  const gridEl = frame.querySelector(".grid-pane") as HTMLElement;
  const ganttEl = frame.querySelector(".gantt-pane") as HTMLElement;
  const scale = captureScale(totalW, totalH);

  const captureOpts = {
    pixelRatio: scale,
    backgroundColor: paper0,
    cacheBust: true,
  };

  const [gridDataUrl, ganttDataUrl] = await Promise.all([
    toPng(gridEl, { ...captureOpts, width: gridW, height: contentH }),
    toPng(ganttEl, { ...captureOpts, width: ganttW, height: contentH }),
  ]);

  root.unmount();
  host.remove();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(totalW * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");

  ctx.fillStyle = paper0;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const contentOffsetY = EXPORT_TITLE_H * scale;
  const titleBaseline = 28 * scale;
  ctx.fillStyle = resolveCssVar("--ink-0");
  ctx.font = `600 ${Math.round(16 * scale)}px Inter, system-ui, sans-serif`;
  const titleX = 14 * scale;
  ctx.fillText(opts.project.name, titleX, titleBaseline);
  const nameWidth = ctx.measureText(opts.project.name).width;

  ctx.fillStyle = resolveCssVar("--ink-2");
  ctx.font = `400 ${Math.round(12.5 * scale)}px Inter, system-ui, sans-serif`;
  const meta = `${fmtDate(opts.project.projectStart, true)} → ${fmtDate(opts.schedule.projectFinishDate, true)}`;
  ctx.fillText(meta, titleX + nameWidth + 12 * scale, titleBaseline);

  const [gridImg, ganttImg] = await Promise.all([loadImage(gridDataUrl), loadImage(ganttDataUrl)]);
  ctx.drawImage(gridImg, 0, contentOffsetY, gridW * scale, contentH * scale);
  ctx.drawImage(ganttImg, gridW * scale, contentOffsetY, ganttW * scale, contentH * scale);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG vide"))), "image/png");
  });

  const filename = `${opts.project.code}-${opts.project.name}-gantt.png`.replace(/[\\/:*?"<>|]/g, "_");
  triggerDownload(filename, blob);
}
