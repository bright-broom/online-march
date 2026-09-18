"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SubmitButton } from "@/components/common/submit-button";
import { ToneBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { deleteAnnouncement, saveAnnouncement } from "@/server/actions/admin-content";
import { ConfirmAction } from "../confirm-action";
import { audienceMeta } from "../labels";
import { AnnouncementPublishedSwitch } from "../toggles";
import { fieldErrors, useFormAction } from "../use-admin-action";

type Audience = keyof typeof audienceMeta;

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  isPublished: boolean;
  publishedAt: Date;
  /** datetime-local value in JST */
  publishedAtLocal: string;
  scheduled: boolean;
};

export function AnnouncementsManager({ rows, nowLocal }: { rows: AnnouncementRow[]; nowLocal: string }) {
  const [editing, setEditing] = useState<AnnouncementRow | "new" | null>(null);
  const columns: ColumnDef<AnnouncementRow>[] = [
    {
      id: "title",
      accessorFn: (a) => `${a.title} ${a.body}`,
      header: "タイトル",
      cell: ({ row: { original: a } }) => (
        <div className="max-w-lg min-w-56">
          <p className="truncate font-medium">{a.title}</p>
          <p className="text-muted-foreground line-clamp-1 text-xs">{a.body}</p>
        </div>
      ),
    },
    {
      accessorKey: "audience",
      header: "対象",
      cell: ({ row: { original: a } }) => <ToneBadge tone={audienceMeta[a.audience].tone}>{audienceMeta[a.audience].label}</ToneBadge>,
    },
    {
      id: "publishedAt",
      accessorFn: (a) => a.publishedAt.valueOf(),
      header: "公開日時",
      cell: ({ row: { original: a } }) => (
        <div className="text-xs whitespace-nowrap">
          <p>{formatDateTime(a.publishedAt)}</p>
          {a.isPublished && a.scheduled && <p className="text-primary">予約公開</p>}
        </div>
      ),
    },
    { id: "published", header: "公開", enableSorting: false, cell: ({ row: { original: a } }) => <AnnouncementPublishedSwitch id={a.id} published={a.isPublished} /> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row: { original: a } }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" aria-label="編集" onClick={() => setEditing(a)}><Pencil /></Button>
          <ConfirmAction
            trigger={<Button variant="ghost" size="icon" aria-label="削除"><Trash2 /></Button>}
            title="お知らせを削除しますか？"
            description={`「${a.title}」を削除します。この操作は取り消せません。`}
            confirmLabel="削除する"
            destructive
            action={() => deleteAnnouncement({ id: a.id })}
          />
        </div>
      ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="タイトル・本文で検索"
        emptyText="お知らせはまだありません"
        toolbar={<Button size="sm" onClick={() => setEditing("new")}><Plus />新規お知らせ</Button>}
      />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          {editing !== null && (
            <AnnouncementForm
              key={editing === "new" ? "new" : editing.id}
              item={editing === "new" ? null : editing}
              nowLocal={nowLocal}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnnouncementForm({ item, nowLocal, onDone }: { item: AnnouncementRow | null; nowLocal: string; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveAnnouncement, { onSuccess: onDone });
  const [audience, setAudience] = useState<Audience>(item?.audience ?? "all");
  const err = (n: string) => fieldErrors(state, n);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{item ? "お知らせを編集" : "新規お知らせ"}</DialogTitle>
        <DialogDescription>公開日時を未来にすると、その時刻から表示されます（日本時間）。</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={item?.id ?? ""} />
        <input type="hidden" name="audience" value={audience} />
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(err("title"))}>
            <FieldLabel htmlFor="ann-title">タイトル</FieldLabel>
            <Input id="ann-title" name="title" defaultValue={item?.title} maxLength={80} required />
            <FieldError errors={err("title")} />
          </Field>
          <Field data-invalid={Boolean(err("body"))}>
            <FieldLabel htmlFor="ann-body">本文</FieldLabel>
            <Textarea id="ann-body" name="body" defaultValue={item?.body} rows={6} maxLength={4000} />
            <FieldError errors={err("body")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>対象</FieldLabel>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(audienceMeta) as Audience[]).map((a) => (
                    <SelectItem key={a} value={a}>{audienceMeta[a].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={Boolean(err("publishedAt"))}>
              <FieldLabel htmlFor="ann-at">公開日時</FieldLabel>
              <Input id="ann-at" name="publishedAt" type="datetime-local" defaultValue={item?.publishedAtLocal ?? nowLocal} required />
              <FieldError errors={err("publishedAt")} />
            </Field>
          </div>
          <Field orientation="horizontal" className="bg-muted/40 items-center justify-between rounded-xl p-3">
            <div>
              <FieldLabel htmlFor="ann-published">公開する</FieldLabel>
              <FieldDescription className="text-xs">オフにすると下書きとして保存されます。</FieldDescription>
            </div>
            <Switch id="ann-published" name="isPublished" defaultChecked={item?.isPublished ?? true} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <SubmitButton pending={pending}>{item ? "保存する" : "作成する"}</SubmitButton>
        </DialogFooter>
      </form>
    </>
  );
}
