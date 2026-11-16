import type { ReactNode } from "react";

type Props = { eyebrow: string; title: string; description: string; action?: ReactNode; compact?:boolean };
export default function PageHeading({ eyebrow, title, description, action, compact=false }: Props) {
  return (
    <div className="border-b border-[#dedfd2] bg-[#f3f1e7]">
      <div className={`mx-auto w-full max-w-[1440px] px-5 md:px-10 lg:px-16 ${compact?"py-3":"py-9 md:py-12"}`}>
        <div className={action ? "flex flex-wrap items-center justify-between gap-6" : undefined}>
          <div className="min-w-0">
            <div className={compact?"sr-only":"mb-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#526543]"}>
              <span aria-hidden="true" className="h-px w-8 bg-[#81905d]" />{eyebrow}
            </div>
            <h1 className={`font-serif leading-tight ${compact?"text-2xl sm:text-3xl":"text-4xl sm:text-5xl"}`}>{title}</h1>
            <p className={compact?"sr-only":"mt-3 max-w-xl text-sm leading-relaxed text-[#536354] sm:text-base"}>{description}</p>
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}
