import Link from "next/link";
import { ArrowRight, Bot, BrainCircuit, CalendarRange, FileUp, GraduationCap, NotebookPen, Sparkles, Star, Table2 } from "lucide-react";
import { Logo } from "@/components/shell";
import { ProgressDemo } from "@/components/landing-demo";

const cta = "clay-sm clay-press inline-flex h-14 items-center justify-center gap-2 rounded-[20px] px-7 text-lg font-black";

const CATALOG = [
  { name: "Maths", color: "#2a78d6", soft: "bg-sky-soft", plan: "Past papers twice a week", detail: "Mock exam in 12 days", sessions: 5, emoji: "∑" },
  { name: "Biology", color: "#1baf7a", soft: "bg-mint-soft", plan: "Active recall, topic by topic", detail: "Unit test in 5 days", sessions: 6, emoji: "🧬" },
  { name: "Chemistry", color: "#eb6834", soft: "bg-coral-soft", plan: "Flashcards, then practice questions", detail: "Low confidence: extra time", sessions: 4, emoji: "⚗️" },
  { name: "English", color: "#eda100", soft: "bg-sun-soft", plan: "Essay plans and quotes", detail: "Ticking over nicely", sessions: 2, emoji: "✍️" },
  { name: "Physics", color: "#e87ba4", soft: "bg-pink-soft", plan: "Worked examples and practice", detail: "Marked as needing attention", sessions: 4, emoji: "🪐" },
  { name: "History", color: "#6250d6", soft: "bg-grape-100", plan: "Summaries from memory", detail: "Light touch this week", sessions: 2, emoji: "🏛️" },
];

const FEATURES = [
  { icon: Table2, tint: "bg-sky-soft text-[#1f5fa8]", title: "Starts from your timetable", text: "Type in your classes or upload a photo of your timetable. Study only ever lands in time that is truly free." },
  { icon: BrainCircuit, tint: "bg-sun-soft text-[#7a5600]", title: "A plan you can actually do", text: "Daily and weekly limits, breaks between sessions and a rest after school. No wall-to-wall revision." },
  { icon: NotebookPen, tint: "bg-mint-soft text-good", title: "Tracks what really happened", text: "Log a session, half a session or extra study. Missed work is spread over the week, not dumped on tomorrow." },
  { icon: GraduationCap, tint: "bg-coral-soft text-[#a83a1c]", title: "Builds towards every exam", text: "Add dates and topics. Revision ramps up as each exam gets closer, with past papers saved for the final days." },
  { icon: Bot, tint: "bg-grape-100 text-grape-600", title: "An assistant that does things", text: "Say \"I want Sunday off\" or \"Chemistry test next Friday\" and it updates the plan, then tells you what changed." },
  { icon: CalendarRange, tint: "bg-pink-soft text-[#a8346a]", title: "One clear calendar", text: "Classes, study, exams and commitments in day, week and month views. Drag a session to move it." },
];

const STORIES = [
  { who: "The exam-season juggler", tint: "bg-sun-soft", text: "Three exams in ten days. The plan weights each subject by its date and how ready I feel, so the nearest one gets the most time without the others vanishing." },
  { who: "The busy athlete", tint: "bg-mint-soft", text: "Training on Tuesdays and Thursdays is in my timetable, so study is planned around it. When a match moves, I tell the assistant and the week reshuffles." },
  { who: "The fresh-start planner", tint: "bg-pink-soft", text: "I missed two sessions on Monday. Instead of a guilt-inducing pile on Tuesday, the missing time was spread across the days I had left." },
];

export default function Landing() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#how" className="hidden rounded-full px-4 py-2 font-extrabold text-ink-soft hover:bg-white/70 sm:block">How it works</a>
          <a href="#demo" className="hidden rounded-full px-4 py-2 font-extrabold text-ink-soft hover:bg-white/70 sm:block">Try it</a>
          <Link href="/dashboard" className="clay-sm clay-press inline-flex h-11 items-center rounded-2xl bg-grape-500 px-5 font-black text-white">Open my planner</Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-2 lg:pt-14 lg:pb-24">
          <div className="animate-rise">
            <span className="clay-sm inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-black text-grape-600"><Sparkles size={15} strokeWidth={3} /> Powered by Claude</span>
            <h1 className="mt-5 text-5xl leading-[1.05] font-black tracking-tight sm:text-6xl">
              Your study week, <span className="relative whitespace-nowrap text-grape-500">sorted<svg aria-hidden viewBox="0 0 200 14" className="absolute -bottom-2 left-0 w-full"><path d="M3 9c40-7 150-9 194-3" fill="none" stroke="#ffd35c" strokeWidth="6" strokeLinecap="round" /></svg></span>.
            </h1>
            <p className="mt-5 max-w-lg text-xl text-ink-soft">A planner that fits study around your school timetable, keeps track of what you really did, and reshapes the plan as exams get closer.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className={`${cta} bg-grape-500 text-white`}>Start planning <ArrowRight size={22} strokeWidth={3} /></Link>
              <a href="#demo" className={`${cta} bg-white text-ink`}>See it in action</a>
            </div>
            <p className="mt-4 text-sm font-bold text-ink-mute">Opens with an example week so you can explore before adding your own.</p>
          </div>

          <div className="relative mx-auto h-[25rem] w-full max-w-md lg:h-[28rem]" aria-hidden>
            <div className="clay animate-float absolute top-2 left-0 w-64 bg-white p-4 [--tilt:-4deg]">
              <p className="text-xs font-black text-ink-mute uppercase">Today · 16:15</p>
              <p className="mt-1 flex items-center gap-2 font-black"><span className="size-3 rounded-full bg-[#1baf7a]" /> Biology</p>
              <p className="text-sm text-ink-soft">Exam-style questions on enzymes</p>
              <div className="mt-2 flex gap-1.5"><span className="rounded-full bg-sky-soft px-2 py-0.5 text-xs font-black text-[#1f5fa8]">Practice questions</span><span className="rounded-full bg-coral-soft px-2 py-0.5 text-xs font-black text-[#a83a1c]">High</span></div>
            </div>
            <div className="clay animate-float absolute top-28 right-0 w-52 bg-sun p-4 [animation-delay:-2s] [--tilt:5deg]">
              <p className="text-sm font-black">Maths mock exam</p>
              <p className="mt-1 text-5xl leading-none font-black">12</p>
              <p className="text-sm font-black opacity-70">days to go</p>
            </div>
            <div className="clay animate-float absolute bottom-6 left-6 w-60 bg-grape-500 p-4 text-white [animation-delay:-4s] [--tilt:3deg]">
              <p className="flex items-center gap-2 text-sm font-black"><Bot size={18} strokeWidth={2.6} /> Assistant</p>
              <p className="mt-1.5 text-sm font-bold opacity-95">Sunday is now a day off. I moved Chemistry to Saturday at 11:00 and Maths to Friday at 17:00.</p>
            </div>
            <div className="clay animate-float absolute right-4 bottom-0 grid size-28 place-items-center bg-mint text-white [animation-delay:-3s] [--tilt:-8deg]">
              <div className="text-center leading-none"><p className="text-3xl font-black">82%</p><p className="mt-1 text-xs font-black">of week done</p></div>
            </div>
            <div className="clay-sm absolute top-0 right-10 grid size-14 place-items-center rounded-full bg-pink text-2xl text-white">★</div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-14 sm:px-6">
          <h2 className="text-center text-4xl font-black">Everything works together</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-lg text-ink-soft">Your timetable, your plan, your log and your exams all feed the same planner.</p>
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="clay clay-press p-6">
                <span className={`clay-sm grid size-14 place-items-center rounded-2xl ${f.tint}`}><f.icon size={28} strokeWidth={2.4} /></span>
                <h3 className="mt-4 text-xl">{f.title}</h3>
                <p className="mt-1.5 text-ink-soft">{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Catalog preview */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-4xl font-black">A study track for every subject</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-lg text-ink-soft">Add your own subjects and each one gets the time and the study methods it needs this week. Here is the example week.</p>
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.map((c) => (
              <article key={c.name} className={`clay clay-press p-5 ${c.soft}`}>
                <div className="flex items-center justify-between">
                  <span className="clay-sm grid size-14 place-items-center rounded-2xl bg-white text-2xl font-black" style={{ color: c.color }}>{c.emoji}</span>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-black">{c.sessions} sessions</span>
                </div>
                <h3 className="mt-4 text-2xl">{c.name}</h3>
                <p className="font-bold text-ink-soft">{c.plan}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-sm font-extrabold"><span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.detail}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Progress demo */}
        <section id="demo" className="mx-auto max-w-4xl scroll-mt-6 px-4 py-14 sm:px-6">
          <h2 className="text-center text-4xl font-black">Watch your progress fill up</h2>
          <p className="mx-auto mt-2 mb-9 max-w-xl text-center text-lg text-ink-soft">Tick off a session and your day and week update straight away. Have a go.</p>
          <ProgressDemo />
        </section>

        {/* Stories */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-center text-4xl font-black">Built for real school weeks</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-lg text-ink-soft">Three situations the planner is designed around.</p>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {STORIES.map((s) => (
              <figure key={s.who} className={`clay p-6 ${s.tint}`}>
                <div className="flex gap-0.5 text-[#e0a400]" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={18} fill="currentColor" strokeWidth={0} />)}</div>
                <blockquote className="mt-3 text-lg leading-snug font-bold">&ldquo;{s.text}&rdquo;</blockquote>
                <figcaption className="mt-4 flex items-center justify-between gap-2">
                  <span className="font-black">{s.who}</span>
                  <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-extrabold text-ink-soft">Example scenario</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6">
          <div className="clay relative overflow-hidden bg-grape-500 px-6 py-14 text-center text-white sm:px-12">
            <div aria-hidden className="absolute -top-10 -left-8 size-36 rounded-full bg-sun/90" />
            <div aria-hidden className="absolute -right-10 -bottom-12 size-44 rounded-full bg-pink/90" />
            <div aria-hidden className="absolute top-8 right-24 size-10 rounded-full bg-mint" />
            <div className="relative">
              <h2 className="text-4xl font-black sm:text-5xl">Ready to plan your week?</h2>
              <p className="mx-auto mt-3 max-w-lg text-lg font-bold opacity-90">Add your timetable, tell it about your exams, and get a plan you can keep up with.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/dashboard" className={`${cta} bg-sun text-ink`}>Open my planner <ArrowRight size={22} strokeWidth={3} /></Link>
                <Link href="/timetable" className={`${cta} bg-white text-ink`}><FileUp size={20} strokeWidth={2.8} /> Add my timetable</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-10 text-sm font-bold text-ink-mute sm:px-6">
        <Logo className="text-base" />
        <p>Your data stays in your own database.</p>
      </footer>
    </div>
  );
}
