"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PROJECTS_PER_PAGE = 5;

export type ActiveProjectRow = {
  id: string;
  name: string;
  clientName: string;
  teamSize: number;
};

export function ActiveProjectsCard({ projects }: { projects: ActiveProjectRow[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PROJECTS_PER_PAGE;
  const pageProjects = projects.slice(start, start + PROJECTS_PER_PAGE);

  return (
    <Card className="flex h-[455px] flex-col overflow-hidden border border-gray-200/80 bg-white shadow-sm lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-gray-50/40 px-5 py-4">
        <CardTitle className="text-sm font-bold text-gray-800">Active projects</CardTitle>
        <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 select-none">
          {projects.length} Active
        </span>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/30 font-bold text-gray-500 select-none">
                <th className="px-5 py-3">PROJECT</th>
                <th className="px-5 py-3">CLIENT</th>
                <th className="px-5 py-3 text-right">TEAM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageProjects.map((project) => (
                <tr key={project.id} className="h-[49px] transition-colors hover:bg-gray-50/30">
                  <td className="max-w-44 truncate px-5 py-3 font-bold text-gray-800" title={project.name}>{project.name}</td>
                  <td className="max-w-44 truncate px-5 py-3 font-medium text-gray-500" title={project.clientName}>{project.clientName}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-700">{project.teamSize}</td>
                </tr>
              ))}
              {pageProjects.length === 0 && (
                <tr>
                  <td colSpan={3} className="h-[245px] px-5 py-8 text-center font-medium text-muted-foreground">
                    No active projects found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {projects.length > 0 && (
          <div className="flex h-[57px] items-center justify-between border-t border-gray-100 px-4">
            <span className="text-[11px] font-medium text-gray-500">
              {start + 1}-{Math.min(start + PROJECTS_PER_PAGE, projects.length)} of {projects.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                aria-label="Previous projects page"
              >
                <ChevronLeft />
              </Button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                <Button
                  key={pageNumber}
                  type="button"
                  variant={pageNumber === safePage ? "default" : "outline"}
                  size="icon"
                  className="size-8 text-xs"
                  onClick={() => setPage(pageNumber)}
                  aria-label={`Projects page ${pageNumber}`}
                  aria-current={pageNumber === safePage ? "page" : undefined}
                >
                  {pageNumber}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={safePage === pageCount}
                aria-label="Next projects page"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
