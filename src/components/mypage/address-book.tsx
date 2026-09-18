"use client";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { AddressBlock } from "@/components/checkout/address-block";
import { EmptyState } from "@/components/common/empty-state";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteAddress, setDefaultAddress } from "@/server/actions/account";
import type { SavedAddress } from "@/server/queries/account";
import { AddressDialog } from "./address-dialog";

export function AddressBook({ addresses }: { addresses: SavedAddress[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else if (res.message) toast.success(res.message);
      router.refresh();
    });

  const addButton = (
    <Button className="rounded-full"><Plus />お届け先を追加</Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddressDialog trigger={addButton} />
      </div>
      {addresses.length === 0 ? (
        <EmptyState icon={MapPin} title="登録されたお届け先はありません" description="よく使う住所を登録しておくと、ご購入手続きがスムーズです。" className="bg-card rounded-xl border" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="bg-card flex flex-col gap-4 rounded-xl border p-5">
              <div className="flex items-center gap-2">
                <p className="font-medium">{a.label}</p>
                {a.isDefault && <Badge className="rounded-full"><Star className="size-3" />いつもの</Badge>}
              </div>
              <AddressBlock address={a} />
              <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                <AddressDialog address={a} trigger={<Button size="sm" variant="ghost"><Pencil />編集</Button>} />
                {!a.isDefault && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setDefaultAddress(a.id))}>
                    <Star />いつものお届け先にする
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive ml-auto" disabled={pending}>
                      <Trash2 />削除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>「{a.label}」を削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>このお届け先はアドレス帳から削除されます。過去のご注文のお届け先には影響しません。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>戻る</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => run(() => deleteAddress(a.id))}>削除する</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
