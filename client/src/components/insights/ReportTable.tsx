import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: any) => React.ReactNode;
}

interface Props {
  columns: ReportColumn[];
  rows: any[];
  rowKey?: (row: any, idx: number) => string;
  loading?: boolean;
  emptyLabel: string;
  footer?: React.ReactNode;
}

const ALIGN_CLASS: Record<string, string> = { left: "text-left", right: "text-right", center: "text-center" };

export default function ReportTable({ columns, rows, rowKey, loading, emptyLabel, footer }: Props) {
  if (loading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Package className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {columns.map((c) => (
                  <th key={c.key} className={`py-2.5 px-4 text-xs font-semibold text-muted-foreground ${ALIGN_CLASS[c.align ?? "left"]}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={rowKey ? rowKey(row, idx) : idx} className="border-b last:border-0 hover:bg-muted/20">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-2.5 px-4 ${ALIGN_CLASS[c.align ?? "left"]}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {footer && <div className="px-4 py-2 text-xs text-muted-foreground border-t flex items-center gap-4">{footer}</div>}
      </CardContent>
    </Card>
  );
}
