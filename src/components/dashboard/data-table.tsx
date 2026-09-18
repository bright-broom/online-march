"use client";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Generic client table (sorting, global search, pagination, optional row selection).
 * Define `columns` in a "use client" file next to the page; pass serializable `data` from the server.
 */
export function DataTable<T>({
  columns, data, searchPlaceholder = "検索", pageSize = 20, toolbar, emptyText = "データがありません",
  enableSelection = false, onSelectionChange, getRowId, rowClassName,
}: {
  columns: ColumnDef<T, unknown>[]; data: T[]; searchPlaceholder?: string | false; pageSize?: number;
  toolbar?: React.ReactNode | ((selected: T[]) => React.ReactNode); emptyText?: string;
  enableSelection?: boolean; onSelectionChange?: (rows: T[]) => void; getRowId?: (row: T) => string; rowClassName?: (row: T) => string | undefined;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const table = useReactTable({
    data, columns, getRowId,
    state: { sorting, globalFilter, rowSelection },
    enableRowSelection: enableSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: (u) => {
      setRowSelection((prev) => {
        const next = typeof u === "function" ? u(prev) : u;
        if (onSelectionChange) queueMicrotask(() => onSelectionChange(table.getSelectedRowModel().rows.map((r) => r.original)));
        return next;
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const { pageIndex } = table.getState().pagination;

  return (
    <div className="space-y-3">
      {(searchPlaceholder !== false || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchPlaceholder !== false && (
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput placeholder={searchPlaceholder} value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
            </InputGroup>
          )}
          <div className="flex flex-wrap items-center gap-2">{typeof toolbar === "function" ? toolbar(selected) : toolbar}</div>
        </div>
      )}
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="text-xs whitespace-nowrap">
                    {h.isPlaceholder ? null : h.column.getCanSort() && typeof h.column.columnDef.header === "string" ? (
                      <button className="hover:text-foreground inline-flex items-center gap-1" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="size-3 opacity-50" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className={rowClassName?.(row.original)}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="text-muted-foreground h-32 text-center">{emptyText}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>{table.getFilteredRowModel().rows.length}件中 {pageIndex * table.getState().pagination.pageSize + 1}–{Math.min((pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}件</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="前へ"><ChevronLeft /></Button>
            <span className={cn("px-2 tabular-nums")}>{pageIndex + 1} / {table.getPageCount()}</span>
            <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="次へ"><ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
