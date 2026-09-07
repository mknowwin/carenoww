import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlaskConical } from "lucide-react";
import { lab as labApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { LabResultEditor, type LabParam } from "@/components/lab-result-editor";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  order: {
    _id: string;
    test: string;
    patientName?: string;
    parameters?: LabParam[];
    result?: string;
    sampleDate?: string;
    reportedBy?: string;
  };
}

export default function LabResultModal({ open, onClose, onSaved, order }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const handleSave = async (payload: Record<string, any>) => {
    setSaving(true);
    try {
      await labApi.update(order._id, payload);
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Update failed", description: e.message || "Failed to save lab result." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-600" />
            Edit Lab Result{order.patientName ? ` — ${order.patientName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <LabResultEditor
          order={order}
          saving={saving}
          defaultReportedBy={order.reportedBy || user?.name}
          onSave={handleSave}
        />
      </DialogContent>
    </Dialog>
  );
}
