import { PageHeaderSkeleton } from "@/components/farmer/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** スタッフ一覧はリクエストごとに読む（connection）。他の生産者画面と同じく、読み込み中の枠を先に出す */
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton actions={false} />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
