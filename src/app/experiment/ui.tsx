'use client';
import React from 'react';

/** Google-Forms-style building blocks. */

export const STEPS = 5;

export function Shell({ step, children }: { step?: number; children?: React.ReactNode }) {
  return (
    <main className="min-h-screen px-3 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-[640px] space-y-3">
        {step ? (
          <div aria-label={`Page ${step} of ${STEPS}`}>
            <div className="flex items-center justify-between text-xs text-gf-muted mb-1">
              <span>
                Page {step} of {STEPS}
              </span>
            </div>
            <div className="h-1 w-full rounded bg-[#e0e0e0] overflow-hidden">
              <div className="h-full bg-gf-accent transition-all" style={{ width: `${(step / STEPS) * 100}%` }} />
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </main>
  );
}

export function Card({ children, accent = false, error = false }: { children: React.ReactNode; accent?: boolean; error?: boolean }) {
  return (
    <section
      className={`relative overflow-hidden rounded-lg border bg-white ${error ? 'border-gf-error' : 'border-gf-border'}`}
    >
      {accent ? <div className="h-2.5 bg-gf-accent" /> : null}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export function TitleCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card accent>
      <h1 className="text-[28px] leading-9 font-normal text-gf-text">{title}</h1>
      {children ? <div className="mt-3 text-[14px] leading-6 text-gf-text">{children}</div> : null}
    </Card>
  );
}

export function Question({
  label,
  required = true,
  error,
  children,
  id,
}: {
  label?: React.ReactNode;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card error={!!error}>
      {label ? (
        <div id={id} className="mb-3 text-[16px] leading-6 text-gf-text">
          {label}
          {required ? <span className="ml-1 text-gf-error">*</span> : null}
        </div>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="mt-3 flex items-center gap-2 text-[12px] text-gf-error">
          <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gf-error text-[10px] font-bold">!</span>
          {error}
        </p>
      ) : null}
    </Card>
  );
}

export function Radio({
  name,
  value,
  checked,
  onChange,
  children,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-2 text-[14px] text-gf-text">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="h-5 w-5 shrink-0"
      />
      <span>{children}</span>
    </label>
  );
}

export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center pt-1">{children}</div>;
}

export function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded border border-gf-error bg-white px-4 py-3 text-[13px] text-gf-error">
      {children}
    </p>
  );
}
