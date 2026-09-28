"use client";

type DashboardScrollPosition = number;

export function captureDashboardScroll(): DashboardScrollPosition {
  return document.querySelector<HTMLElement>("[data-dashboard-scroll]")?.scrollTop ?? window.scrollY;
}

/** Restore after the server-action RSC payload has committed. */
export function restoreDashboardScroll(top: DashboardScrollPosition) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const container = document.querySelector<HTMLElement>("[data-dashboard-scroll]");
    if (container) container.scrollTop = top;
    else window.scrollTo({ top });
  }));
}
