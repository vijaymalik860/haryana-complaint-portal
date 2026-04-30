"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Alert className="max-w-xl">
        <AlertCircle className="size-4" />
        <AlertTitle>Dashboard could not load</AlertTitle>
        <AlertDescription className="mt-2 space-y-4">
          <p>{error.message}</p>
          <Button type="button" onClick={reset}>
            <RotateCcw />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}
