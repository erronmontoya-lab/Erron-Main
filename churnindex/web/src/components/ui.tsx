import type { ReactNode } from "react";
import { PRIMARY_CTA, SIGNUP_HREF } from "../config";
import { track } from "../lib/analytics";

export function CheckIcon({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`}>
      <path d="M3 8.5 L6.5 12 L13 4.5" />
    </svg>
  );
}

export function LogoMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#0B1220"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 15 L8 9 L11.5 12 L17 5" />
        <path d="M13 5 L17 5 L17 9" />
      </svg>
    </span>
  );
}

/** The primary call to action. Accent background always uses ink text. */
export function PrimaryCta({ location, label = PRIMARY_CTA, size = "md", className = "" }: {
  location: string;
  label?: string;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    md: "px-[18px] py-3 text-[15px]",
    lg: "px-[26px] py-4 text-[17px]",
    xl: "px-[30px] py-[18px] text-lg rounded-xl",
  };
  return (
    <a href={SIGNUP_HREF} onClick={() => track("signup_started", { location })}
      className={`rounded-[10px] bg-accent font-bold text-ink no-underline hover:brightness-95 ${sizes[size]} ${className}`}>
      {label}
    </a>
  );
}

export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={`m-0 text-sm font-bold ${dark ? "text-muted-dark" : "text-muted"}`}>{children}</p>;
}

export function SectionTitle({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id}
      className={`m-0 font-display text-[clamp(32px,4vw,46px)] font-extrabold leading-[1.05] tracking-[-0.02em] ${className}`}>
      {children}
    </h2>
  );
}

export function Pill({ children, dark = true }: { children: ReactNode; dark?: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
      dark ? "border-dark-outline text-soft-dark" : "border-line text-muted"}`}>
      {children}
    </span>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-site px-4 sm:px-6 ${className}`}>{children}</div>;
}
