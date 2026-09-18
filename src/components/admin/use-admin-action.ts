"use client";
import { startTransition, useActionState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/_utils";

type FormActionFn<T> = (prev: unknown, formData: FormData) => Promise<ActionResult<T>>;

/**
 * useActionState + sonner toast. Returns `[state, onSubmit, pending]`.
 * Submits via onSubmit (not `<form action>`) so React does not reset the fields when validation fails.
 */
export function useFormAction<T>(action: FormActionFn<T>, opts: { onSuccess?: (data: T) => void; successMessage?: (data: T) => string } = {}) {
  const [state, dispatch, pending] = useActionState<ActionResult<T> | null, FormData>(async (prev, formData) => {
    const res = await action(prev, formData);
    if (res.ok) {
      toast.success(opts.successMessage?.(res.data) ?? res.message ?? "保存しました");
      opts.onSuccess?.(res.data);
    } else toast.error(res.error);
    return res;
  }, null);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}

/** Fire-and-toast for button-style actions (toggles, transitions). */
export function useRunAction() {
  const [pending, start] = useTransition();
  const run = <T>(fn: () => Promise<ActionResult<T>>, opts: { onSuccess?: (data: T) => void; successMessage?: (data: T) => string } = {}) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(opts.successMessage?.(res.data) ?? res.message ?? "更新しました");
        opts.onSuccess?.(res.data);
      } else toast.error(res.error);
    });
  return [pending, run] as const;
}

/** Field errors → shadcn <FieldError errors> shape. */
export const fieldErrors = (state: ActionResult<unknown> | null, name: string) =>
  state && !state.ok ? state.fieldErrors?.[name]?.map((message) => ({ message })) : undefined;
