import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PatientHistory from "@/components/PatientHistory";

interface Props {
  open: boolean;
  onClose: () => void;
  patientId: string;   // UHID
  patientName?: string;
}

export default function PatientHistoryModal({ open, onClose, patientId, patientName }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="min-w-0">
          <DialogTitle>
            Patient History — {patientName || patientId}
            {patientName && <span className="ml-2 text-xs font-mono text-muted-foreground">{patientId}</span>}
          </DialogTitle>
        </DialogHeader>
        {open && patientId && <div className="min-w-0"><PatientHistory patientId={patientId} /></div>}
      </DialogContent>
    </Dialog>
  );
}
