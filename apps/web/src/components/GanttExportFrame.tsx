import { useEffect, useMemo } from "react";
import type { CalendarDef, Resource, ScheduleResult } from "@atelier/scheduling-engine";
import { ROW_H, Gantt, GanttHeader } from "./Gantt";
import { TaskGrid } from "./TaskGrid";
import { type Project } from "../domain";
import type { TimeRange } from "../gantt-utils";

const GANTT_HEADER_H = 48;

interface Props {
  project: Project;
  schedule: ScheduleResult;
  taskIds: string[];
  range: TimeRange;
  dayWidth: number;
  gridWidth: number;
  calendar: CalendarDef;
  resources: Resource[];
  todayISO: string;
  showVariance: boolean;
  onReady: () => void;
}

/** Off-screen snapshot of the full Gantt (grid + timeline) for PNG export. */
export function GanttExportFrame({
  project,
  schedule,
  taskIds,
  range,
  dayWidth,
  gridWidth,
  calendar,
  resources,
  todayISO,
  showVariance,
  onReady,
}: Props) {
  const ganttWidth = useMemo(() => Math.ceil(range.days * dayWidth), [range.days, dayWidth]);
  const bodyHeight = taskIds.length * ROW_H;
  const contentHeight = GANTT_HEADER_H + bodyHeight;

  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <div
      className="gantt-export-frame"
      style={{ width: gridWidth + ganttWidth }}
    >
      <div className="gantt-export-split" style={{ width: gridWidth + ganttWidth }}>
        <div
          className="grid-pane gantt-export-grid"
          style={{ width: gridWidth, minWidth: gridWidth, flex: "none", height: contentHeight }}
        >
          <div className="grid-head tnum">
            <span style={{ width: 44 }} className="h num">
              N°
            </span>
            <span className="h grow">Tâche</span>
            <span style={{ width: 52 }} className="h num">
              Durée
            </span>
            <span style={{ width: 62 }} className="h num">
              Début
            </span>
            <span style={{ width: 62 }} className="h num">
              Fin
            </span>
            <span style={{ width: 44 }} className="h num">
              %
            </span>
            {showVariance && (
              <>
                <span style={{ width: 52 }} className="h num">
                  Δdébut
                </span>
                <span style={{ width: 52 }} className="h num">
                  Δfin
                </span>
                <span style={{ width: 58 }} className="h num">
                  CV%
                </span>
              </>
            )}
          </div>
          <div className="grid-body">
            <TaskGrid
              project={project}
              schedule={schedule}
              visibleIds={taskIds}
              collapsed={{}}
              selectedTaskId={null}
              onToggle={() => {}}
              onSelect={() => {}}
              onUpdate={() => {}}
              showVariance={showVariance}
              resources={resources}
            />
          </div>
        </div>
        <div
          className="gantt-pane gantt-export-timeline"
          style={{ width: ganttWidth, minWidth: ganttWidth, flex: "none", height: contentHeight }}
        >
          <div className="gantt-head">
            <GanttHeader range={range} dayWidth={dayWidth} />
          </div>
          <div className="gantt-body">
            <Gantt
              project={project}
              schedule={schedule}
              visibleIds={taskIds}
              range={range}
              dayWidth={dayWidth}
              calendar={calendar}
              resources={resources}
              selectedTaskId={null}
              onSelect={() => {}}
              todayISO={todayISO}
              showBaseline={showVariance}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
