"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Submit button that shows a spinner while its parent <form action> is pending. */
export function SubmitButton({ children, pending: pendingProp, ...props }: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  const { pending } = useFormStatus();
  const busy = pendingProp ?? pending;
  return (
    <Button type="submit" disabled={busy || props.disabled} {...props}>
      {busy && <Spinner />}
      {children}
    </Button>
  );
}
