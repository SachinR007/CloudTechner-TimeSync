"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ToggleActiveButton({
  id,
  isActive,
  action,
  activeLabel = "Deactivate",
  inactiveLabel = "Activate",
}: {
  id: string;
  isActive: boolean;
  action: (id: string, isActive: boolean) => Promise<void>;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(() => action(id, !isActive))}
    >
      {isActive ? activeLabel : inactiveLabel}
    </Button>
  );
}
