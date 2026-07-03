/** Dependency types, MS Project semantics. */
export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface Dependency {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Lag in working days; negative = lead. */
  lag: number;
}

export type ConstraintType = "ASAP" | "SNET" | "MSO";

export interface TaskConstraint {
  type: ConstraintType;
  /** ISO date (yyyy-mm-dd), required for SNET / MSO. */
  date?: string;
}

export interface Task {
  id: string;
  name: string;
  /** Parent summary task id, null at root. */
  parentId: string | null;
  /** Order among siblings. */
  order: number;
  /** Duration in working days. 0 = milestone. Ignored for summaries. */
  duration: number;
  /** 0..100 */
  percentComplete: number;
  constraint?: TaskConstraint;
  /** Resource assignments. */
  assignments: Assignment[];
  /** Fixed cost in currency units. */
  fixedCost?: number;
  notes?: string;
  /** Baseline snapshot captured when project baseline was set. */
  baseline?: {
    /** ISO date (yyyy-mm-dd). */
    start: string;
    /** ISO date inclusive. */
    finish: string;
    /** Planned cost at baseline time. */
    cost: number;
  };
  /** Actual cost incurred (timesheets / manual entry). If absent, AC defaults to EV (no cost variance). */
  actualCost?: number;
  /** Custom field values keyed by field-definition id (carried through untouched by the engine). */
  custom?: Record<string, string | number>;
}

export interface Assignment {
  resourceId: string;
  /** 1.0 = 100% of the resource's time. */
  units: number;
}

export type ResourceKind = "work" | "material" | "cost";

export interface Resource {
  id: string;
  name: string;
  kind: ResourceKind;
  /** Max simultaneous units (1.0 = one full-time person). */
  capacity: number;
  /** Cost per working day for work resources. */
  costPerDay: number;
  role?: string;
}

export interface CalendarDef {
  /** 0 = Sunday ... 6 = Saturday. Working weekdays. */
  workingWeekdays: number[];
  /** ISO dates that are holidays despite being working weekdays. */
  holidays: string[];
}

/** Computed schedule for one task. All indexes are working-day offsets from project start. */
export interface ScheduledTask {
  id: string;
  /** Early start (inclusive). */
  es: number;
  /** Early finish (exclusive): es + duration. Milestone: ef === es. */
  ef: number;
  ls: number;
  lf: number;
  /** Total slack in working days. */
  slack: number;
  critical: boolean;
  isSummary: boolean;
  isMilestone: boolean;
  /** Effective duration (rolled up for summaries). */
  duration: number;
  /** ISO dates resolved through the calendar. */
  startDate: string;
  /** Inclusive finish date (MS Project style). Equals startDate for milestones. */
  finishDate: string;
  /** WBS code, e.g. "1.2.3". */
  wbs: string;
  /** Depth in the outline, 0 = root. */
  level: number;
}

export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>;
  /** Working-day length of the project (max EF). */
  projectDuration: number;
  projectFinishDate: string;
  /** Ordered task ids, outline order (parents before children). */
  outline: string[];
  errors: ScheduleError[];
}

export interface ScheduleError {
  kind: "cycle" | "missing-task" | "bad-constraint";
  message: string;
  taskIds: string[];
}
