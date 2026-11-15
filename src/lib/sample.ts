/** Realistic example data so the app is alive on first launch. Pure, no database. */
import type { Exam, Override, PlanInput, Session, StudyLog, Subject, TimetableEntry } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { addDays, fromMin, toMin, weekStart } from "./time";

export const SUBJECT_COLORS = ["#7c5cff", "#ff6b9d", "#22c1a4", "#ffa23a", "#3d9bff", "#f25c54", "#a3c93a", "#c66bff"];

let counter = 0;
const id = (p: string) => `${p}_${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function sampleData(today: string, nowTime: string): PlanInput {
  const subj = (name: string, i: number, priority = 2, confidence = 3): Subject => ({ id: id("sub"), name, color: SUBJECT_COLORS[i], priority, confidence, archived: false });
  const maths = subj("Maths", 0, 2, 3);
  const biology = subj("Biology", 2, 2, 3);
  const chemistry = subj("Chemistry", 1, 2, 2);
  const physics = subj("Physics", 4, 3, 2);
  const english = subj("English", 3, 2, 4);
  const history = subj("History", 5, 1, 4);
  const subjects = [maths, biology, chemistry, physics, english, history];

  const timetable: TimetableEntry[] = [];
  const add = (day: number, type: TimetableEntry["type"], title: string, start: string, end: string, subject: Subject | null = null, location = "") =>
    timetable.push({ id: id("tt"), day, type, title, subjectId: subject?.id ?? null, start, end, location });
  const grid: (Subject | "free")[][] = [
    [maths, english, biology, chemistry, physics, history],
    [chemistry, maths, "free", english, biology, physics],
    [physics, biology, maths, history, english, chemistry],
    [english, chemistry, physics, maths, "free", biology],
    [biology, history, english, physics, maths, chemistry],
  ];
  const slots = [["09:00", "09:55"], ["09:55", "10:50"], ["11:10", "12:05"], ["12:05", "13:00"], ["13:45", "14:40"], ["14:40", "15:35"]];
  const rooms: Record<string, string> = { Maths: "Room 12", Biology: "Lab 2", Chemistry: "Lab 1", Physics: "Lab 3", English: "Room 7", History: "Room 4" };
  grid.forEach((row, day) => {
    row.forEach((cell, i) => {
      if (cell === "free") add(day, "free", "Free period", slots[i][0], slots[i][1], null, "Library");
      else add(day, "class", cell.name, slots[i][0], slots[i][1], cell, rooms[cell.name]);
    });
    add(day, "break", "Morning break", "10:50", "11:10");
    add(day, "break", "Lunch", "13:00", "13:45");
  });
  add(1, "commitment", "Football training", "17:00", "18:30", null, "Sports ground");
  add(3, "commitment", "Football training", "17:00", "18:30", null, "Sports ground");
  add(5, "commitment", "Match", "10:30", "12:30", null, "Away");
  for (let d = 0; d < 7; d++) add(d, "commitment", "Dinner", "18:30", "19:15");

  const topics = (names: string[], done = 0) => names.map((name, i) => ({ id: id("top"), name, done: i < done }));
  const exams: Exam[] = [
    {
      id: id("ex"), name: "Biology unit test", subjectId: biology.id, format: "Short answers and one long question", confidence: 3, preparedness: 2, notes: "Covers the whole cell biology unit.",
      dates: [{ id: id("ed"), date: addDays(today, 5), time: "11:10", label: "" }],
      topics: topics(["Cell structure", "Enzymes", "Respiration", "Photosynthesis", "Cell division"], 1),
    },
    {
      id: id("ex"), name: "Maths mock exam", subjectId: maths.id, format: "Two written papers", confidence: 3, preparedness: 3, notes: "",
      dates: [{ id: id("ed"), date: addDays(today, 12), time: "09:00", label: "Paper 1" }, { id: id("ed"), date: addDays(today, 14), time: "09:00", label: "Paper 2" }],
      topics: topics(["Algebra", "Functions", "Differentiation", "Trigonometry", "Probability", "Sequences and series"], 2),
    },
    {
      id: id("ex"), name: "Chemistry end-of-term exam", subjectId: chemistry.id, format: "Written paper with calculations", confidence: 2, preparedness: 2, notes: "Bring the data booklet.",
      dates: [{ id: id("ed"), date: addDays(today, 21), time: null, label: "" }],
      topics: topics(["Atomic structure", "Bonding", "Moles and stoichiometry", "Acids and bases", "Organic basics", "Rates of reaction"]),
    },
  ];

  // The past ten days: mostly done, with a few misses and a short session, like a real fortnight.
  const sessions: Session[] = [];
  const logs: StudyLog[] = [];
  const past: [number, Subject, string, string, number, "completed" | "missed" | "partial", string, string][] = [
    [-10, maths, "16:15", "Homework and class follow-up", 45, "completed", "Homework", "homework"],
    [-10, biology, "19:30", "Revise Cell structure", 45, "completed", "Summarising", "revision"],
    [-9, chemistry, "19:30", "Revise Atomic structure", 45, "completed", "Flashcards", "revision"],
    [-8, physics, "16:15", "Independent practice questions", 50, "missed", "Practice questions", "practice"],
    [-8, english, "19:30", "Essay plan for the set text", 45, "completed", "Summarising", "study"],
    [-7, maths, "16:15", "Exam-style questions on Algebra", 50, "completed", "Practice questions", "practice"],
    [-6, biology, "13:30", "Revise Enzymes", 60, "partial", "Active recall", "revision"],
    [-6, history, "15:00", "Review this week's notes from memory", 40, "completed", "Active recall", "revision"],
    [-5, chemistry, "11:00", "Revise Bonding", 50, "completed", "Flashcards", "revision"],
    [-5, physics, "14:00", "Homework and class follow-up", 45, "completed", "Homework", "homework"],
    [-4, maths, "16:15", "Revise Functions", 45, "completed", "Active recall", "revision"],
    [-4, english, "19:30", "Review this week's notes from memory", 40, "missed", "Active recall", "revision"],
    [-3, biology, "19:30", "Exam-style questions on Enzymes", 45, "completed", "Practice questions", "practice"],
    [-2, physics, "16:15", "Summarise the current topic in your own words", 45, "completed", "Summarising", "study"],
    [-2, chemistry, "19:30", "Revise Moles and stoichiometry", 50, "partial", "Active recall", "revision"],
    [-1, maths, "19:30", "Exam-style questions on Functions", 45, "completed", "Practice questions", "practice"],
    [-1, biology, "16:15", "Revise Respiration", 45, "missed", "Active recall", "revision"],
  ];
  for (const [offset, subject, start, task, minutes, status, method, kind] of past) {
    const date = addDays(today, offset);
    const exam = exams.find((e) => e.subjectId === subject.id && task.includes("Revise") || e.subjectId === subject.id && task.includes("Exam-style")) ?? null;
    const topic = exam?.topics.find((t) => task.endsWith(t.name)) ?? null;
    const s: Session = {
      id: id("ses"), subjectId: subject.id, date, start, end: fromMin(toMin(start) + minutes), task, method, priority: exam ? "high" : "medium",
      kind: kind as Session["kind"], status, examId: exam?.id ?? null, topicId: topic?.id ?? null, origin: "planner", pinned: false, notes: "",
    };
    sessions.push(s);
    if (status === "missed") continue;
    const done = status === "partial" ? Math.round(minutes * 0.5) : minutes;
    logs.push({
      id: id("log"), subjectId: subject.id, date, start, end: fromMin(toMin(start) + done), minutes: done, description: task, sessionId: s.id,
      completedTask: status === "completed", productivity: status === "partial" ? 2 : 4, notes: status === "partial" ? "Ran out of steam halfway through." : "",
    });
  }
  // One unplanned extra session, to show that extra work counts too.
  logs.push({ id: id("log"), subjectId: english.id, date: addDays(today, -3), start: null, end: null, minutes: 30, description: "Read ahead in the novel", sessionId: null, completedTask: null, productivity: 4, notes: "" });

  const overrides: Override[] = [];
  void weekStart;
  return { today, nowTime, settings: { ...DEFAULT_SETTINGS }, subjects, timetable, overrides, exams, sessions, logs };
}
