import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ipd as ipdApi, users as usersApi } from "@/lib/api";
import { DEPTS } from "@/lib/ipd";
import BedPicker from "@/components/BedPicker";
import SoapTextarea from "@/components/SoapTextarea";

// Dialogs shared by the IPD list and the inpatient chart

// ── Transfer to another bed ───────────────────────────────────────────────────
export function TransferModal({ admission, onClose, onTransferred }: { admission: any; onClose: () => void; onTransferred: () => void }) {
  const [bedId,   setBedId]   = useState("");
  const [reason,  setReason]  = useState("");
  const [error,   setError]   = useState("");

  const mut = useMutation({
    mutationFn: () => ipdApi.transfer(admission._id, { bedId, reason }),
    onSuccess:  onTransferred,
    onError:    (e: any) => setError(e.message || "Transfer failed"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer Patient</DialogTitle>
          <p className="text-sm text-muted-foreground">{admission.patientName} · {admission.admissionId}</p>
          <p className="text-xs text-muted-foreground">Current: {admission.ward} — Bed {admission.bedNumber}</p>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">New Bed</Label>
            <BedPicker className="mt-1 h-9" value={bedId} onChange={setBedId} currentBedId={admission.bedId} />
          </div>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Input className="mt-1 h-9" placeholder="e.g. Condition improved, moved from ICU" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 gap-2"
            disabled={!bedId || mut.isPending}
            onClick={() => { setError(""); mut.mutate(); }}
          >
            <ArrowLeftRight className="h-4 w-4" />
            {mut.isPending ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit admission (diagnosis / department / doctor) ─────────────────────────
export function EditAdmissionModal({ admission, onClose, onSaved }: { admission: any; onClose: () => void; onSaved: () => void }) {
  const [diagnosis, setDiagnosis] = useState(admission.provisionalDiagnosis ?? "");
  const [dept,      setDept]      = useState(admission.department ?? "");
  const [doctor,    setDoctor]    = useState(admission.admittingDoctor ?? "");
  const [doctorId,  setDoctorId]  = useState(admission.admittingDoctorId ?? "");
  const [error,     setError]     = useState("");

  const { data: doctorsData } = useQuery({ queryKey: ["doctors-admit"], queryFn: () => usersApi.doctors() });
  const doctors: any[] = doctorsData ?? [];

  const mut = useMutation({
    mutationFn: () => ipdApi.update(admission._id, {
      provisionalDiagnosis: diagnosis, department: dept, admittingDoctor: doctor, admittingDoctorId: doctorId,
    }),
    onSuccess: onSaved,
    onError:   (e: any) => setError(e.message || "Update failed"),
  });

  // Keep departments the admission already uses even if not in the fixed list
  const deptOptions = dept && !DEPTS.includes(dept) ? [dept, ...DEPTS] : DEPTS;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Admission</DialogTitle>
          <p className="text-sm text-muted-foreground">{admission.patientName} · {admission.admissionId}</p>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Provisional Diagnosis</Label>
            <SoapTextarea field="assessment" className="mt-1" value={diagnosis} onChange={setDiagnosis}
              placeholder="Type a diagnosis or ICD-10 code" />
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {deptOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Admitting Doctor</Label>
            <Select value={doctorId} onValueChange={(id) => {
              setDoctorId(id);
              setDoctor(doctors.find((d: any) => d._id === id)?.name ?? doctor);
            }}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={doctor || "Select doctor"} /></SelectTrigger>
              <SelectContent>
                {doctors.map((d: any) => (
                  <SelectItem key={d._id} value={d._id}>{d.name} — {d.specialty || d.department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">To change ward or bed, use Transfer.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!diagnosis.trim() || !doctor || mut.isPending} onClick={() => { setError(""); mut.mutate(); }}>
            {mut.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
