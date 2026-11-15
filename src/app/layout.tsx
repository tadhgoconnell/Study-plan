import type { Metadata, Viewport } from "next";
import "@fontsource-variable/nunito";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Studyclay: your AI study planner", template: "%s · Studyclay" },
  description: "A study planner that builds a realistic weekly plan around your timetable, tracks what you actually do, and adapts as exams approach.",
};

export const viewport: Viewport = { themeColor: "#f3efff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
