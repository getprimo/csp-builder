import { primoUrl } from "@/lib/primo";

export function PrimoRibbon() {
  return (
    <div
      aria-hidden="false"
      className="pointer-events-none fixed right-0 top-0 z-50 h-40 w-40 overflow-hidden"
    >
      <a
        href={primoUrl("corner_ribbon")}
        target="_blank"
        rel="noopener"
        className="pointer-events-auto absolute top-[38px] -right-[58px] w-[240px] rotate-45 bg-primary py-2 text-center text-xs font-semibold tracking-wide text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform hover:scale-[1.03] focus-visible:scale-[1.03] focus-visible:outline-none"
      >
        Built by Primo · MDM →
      </a>
    </div>
  );
}
