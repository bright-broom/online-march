"use client";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runJobNow } from "@/server/actions/admin-ops";
import { ConfirmAction } from "./confirm-action";
import { formatJobSummary } from "./labels";
import { useRunAction } from "./use-admin-action";

/** 今すぐ実行 — optional confirm (for jobs with money / email side effects). */
export function RunJobButton({
  job,
  label = "今すぐ実行",
  confirm,
  variant = "outline",
  size = "sm",
}: {
  job: string;
  label?: string;
  confirm?: { title: string; description: string };
  variant?: "outline" | "default" | "secondary";
  size?: "sm" | "default";
}) {
  const [pending, run] = useRunAction();
  const successMessage = (d: { summary: Record<string, number | string> }) => `完了：${formatJobSummary(d.summary)}`;
  if (confirm) {
    return (
      <ConfirmAction
        trigger={<Button variant={variant} size={size}><Play />{label}</Button>}
        title={confirm.title}
        description={confirm.description}
        confirmLabel="実行する"
        action={() => runJobNow({ job })}
        successMessage={successMessage}
      />
    );
  }
  return (
    <Button variant={variant} size={size} disabled={pending} onClick={() => run(() => runJobNow({ job }), { successMessage })}>
      {pending ? <Spinner /> : <Play />}
      {label}
    </Button>
  );
}
