"use client";
/** Lazy (next/dynamic) entrypoints for heavy farmer widgets. */
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const LazyImageUploader = dynamic(() => import("@/components/common/image-uploader"), {
  ssr: false,
  loading: () => <Skeleton className="aspect-[4/1] min-h-28 w-full rounded-xl" />,
});

export const LazyTrackingImportDialog = dynamic(() => import("./shipping/tracking-import-dialog"), { ssr: false });
