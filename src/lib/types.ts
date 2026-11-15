/** Shared data shapes used by the server, the planner and the UI. */

export type EntryType = "class" | "break" | "free" | "commitment";
export type OverrideType = "off" | "busy" | "free";
export type SessionStatus = "planned" | "completed" | "partial" | "missed";
export type Priority = "high" | "medium" | "low";
export type SessionKind = "revision" | "homework" | "practice" | "study";
export type Origin = "planner" | "claude" | "assistant" | "manual";

export const METHODS = [
  "Active recall",
  "Past papers",
  "Flashcards",
  "Practice questions",
  "Summarising",
  "Homework",
  "Reading & notes",
] as const;

export interface Subject {
  id: string;
  name: string;
  color: string;
  /** 1 = light touch, 2 = normal, 3 = needs extra attention. */
  priority: number;
  /** 1 (struggling) to 5 (very confident). */
  confidence: number;
  archived: boolean;
}

export interface TimetableEntry {
  id: string;
  /** 0 = Monday ... 6 = Sunday. */
  day: number;
  type: EntryType;
  title: string;
  subjectId: string | null;
  start: string;
  end: string;
  location: string;
}

export interface Override {
  id: string;
  date: string;
  type: OverrideType;
  start: string | null;
  end: string | null;
  note: string;
}

export interface ExamDate {
  id: string;
  date: string;
  time: string | null;
  label: string;
}

export interface ExamTopic {
  id: string;
  name: string;
  done: boolean;
}

export interface Exam {
  id: string;
  name: string;
  subjectId: string;
  format: string;
  confidence: number;
  preparedness: number;
  notes: string;
  dates: ExamDate[];
  topics: ExamTopic[];
}

export interface Session {
  id: string;
  subjectId: string;
  date: string;
  start: string;
  end: string;
  task: string;
  method: string;
  priority: Priority;
  kind: SessionKind;
  status: SessionStatus;
  examId: string | null;
  topicId: string | null;
  origin: Origin;
  /** True once the user (or the assistant on their behalf) placed it by hand. */
  pinned: boolean;
  notes: string;
}

export interface StudyLog {
  id: string;
  subjectId: string;
  date: string;
  start: string | null;
  end: string | null;
  minutes: number;
  description: string;
  sessionId: string | null;
  completedTask: boolean | null;
  productivity: number | null;
  notes: string;
}

export interface Settings {
  weekdayStart: string;
  weekdayEnd: string;
  weekendStart: string;
  weekendEnd: string;
  maxWeekdayMinutes: number;
  maxWeekendMinutes: number;
  weeklyTargetHours: number;
  sessionMinutes: number;
  maxSessionMinutes: number;
  breakMinutes: number;
  afterSchoolBuffer: number;
  useFreePeriods: boolean;
  /** Weekdays (0 = Monday) that are always kept free of study. */
  restDays: number[];
}

export const DEFAULT_SETTINGS: Settings = {
  weekdayStart: "16:00",
  weekdayEnd: "21:30",
  weekendStart: "10:00",
  weekendEnd: "19:00",
  maxWeekdayMinutes: 150,
  maxWeekendMinutes: 210,
  weeklyTargetHours: 13,
  sessionMinutes: 45,
  maxSessionMinutes: 60,
  breakMinutes: 10,
  afterSchoolBuffer: 30,
  useFreePeriods: true,
  restDays: [],
};

export interface PlanChange {
  id: string;
  createdAt: string;
  trigger: string;
  source: Origin;
  summary: string;
  items: string[];
  undoable: boolean;
  undone: boolean;
}

export interface ChatMessage {
  id: string;
  createdAt: string;
  role: "user" | "assistant";
  content: string;
  actions: string[];
}

export interface AppState {
  today: string;
  nowTime: string;
  subjects: Subject[];
  timetable: TimetableEntry[];
  overrides: Override[];
  exams: Exam[];
  sessions: Session[];
  logs: StudyLog[];
  settings: Settings;
  changes: PlanChange[];
  insights: { text: string[]; generatedAt: string } | null;
  ai: { configured: boolean; model: string };
  storage: "postgres" | "local" | "memory";
  sample: boolean;
}

/** Everything the planner needs. A plain snapshot, so planning stays pure. */
export interface PlanInput {
  today: string;
  nowTime: string;
  settings: Settings;
  subjects: Subject[];
  timetable: TimetableEntry[];
  overrides: Override[];
  exams: Exam[];
  sessions: Session[];
  logs: StudyLog[];
}
