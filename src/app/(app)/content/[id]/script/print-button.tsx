"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/form";

/**
 * The browser's print dialog is the PDF pipeline: every OS offers "Save as
 * PDF" there, so one button covers paper and file without a render service.
 */
export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Printer size={14} />
      Print / save PDF
    </Button>
  );
}
