import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ipd as ipdApi, patients as patientsApi, users as usersApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const WARDS    = ["General Ward", "ICU", "Private Ward", "Semi-Private", "Obs/Gyn", "Pediatric"];
const DEPTS    = ["General Medicine", "Cardiology", "Orthopedics", "Neurology", "Obstetrics", "Pediatrics", "Emergency"];

interface Props {
  open: boolean;
  onClose: () => void;
  onAdmitted: () => void;
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  fromDoctor?: string;
  fromDoctorId?: string;
}

export default function AdmitModal({ open, onClose, onAdmitted, patientId: initPatientId, patientName: initPatientName, appointmentId, fromDoctor, fromDoctorId }: Props) {
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<any>(null);
  const [ward,      setWard]      = useState("");
  const [bed,       setBed]       = useState("");
  const [dept,      setDept]      = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [doctor,    setDoctor]    = useState(fromDoctor ?? "");
  const [doctorId,  setDoctorId]  = useState(fromDoctorId ?? "");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [showSearch, setShowSearch] = useState(!initPatientId);

  const { data: searchData } = useQuery({
    queryKey: ["patient-search-admit", search],
    queryFn:  () => patientsApi.list({ search, limit: "8" }),
    enabled:  search.length > 1,
  });
  const { data: doctorsData } = useQuery({
    queryKey: ["doctors-admit"],
    queryFn:  () => usersApi.doctors(),
    enabled:  open,
  });

  useEffect(() => {
    if (!open) {
      setSearch(""); setSelected(null); setWard(""); setBed(""); setDept(""); setDiagnosis(""); setError("");
      if (!initPatientId) setShowSearch(true);
    }
    if (initPatientId && initPatientName) {
      setSelected({ _id: initPatientId, name: initPatientName });
      setShowSearch(false);
    }
    if (fromDoctor)   setDoctor(fromDoctor);
    if (fromDoctorId) setDoctorId(fromDoctorId);
  }, [open, initPatientId, initPatientName, fromDoctor, fromDoctorId]);

  const patients: any[] = searchData?.patients ?? [];

  const handleSubmit = async () => {
    if (!selected || !ward || !bed || !diagnosis || !doctor) {
      setError("All fields required"); return;
    }
    setSaving(true); setError("");
    try {
      await ipdApi.admit({
        patientId:            selected._id,
        patientName:          selected.name,
        patientAge:           selected.age,
        patientGender:        selected.gender,
        patientPhone:         selected.phone,
        appointmentId:        appointmentId || "",
        admittingDoctor:      doctor,
        admittingDoctorId:    doctorId,
        department:           dept || selected.department || "",
        ward, bedNumber: bed,
        provisionalDiagnosis: diagnosis,
      });
      onAdmitted();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to admit patient");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Admit Patient to Ward</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient selection */}
          {showSearch ? (
            <div>
              <Label>Search Patient</Label>
              <Input className="mt-1" placeholder="Name, UHID, phone..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
              {patients.length > 0 && (
                <div className="border rounded-md mt-1 divide-y max-h-40 overflow-y-auto">
                  {patients.map((p: any) => (
                    <button key={p._id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => { setSelected(p); setShowSearch(false); setDept(p.department || ""); }}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground ml-2">{p.uhid} · {p.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium">{selected?.name}</p>
                <p className="text-xs text-muted-foreground">{selected?.uhid} · {selected?.phone}</p>
              </div>
              {!initPatientId && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowSearch(true)}>Change</Button>
              )}
            </div>
          )}

          {/* Ward + Bed */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ward</Label>
              <Select value={ward} onValueChange={setWard}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select ward" /></SelectTrigger>
                <SelectContent>
                  {WARDS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bed Number</Label>
              <Input className="mt-1" placeholder="e.g. GW-05, ICU-02" value={bed} onChange={(e) => setBed(e.target.value)} />
            </div>
          </div>

          {/* Department */}
          <div>
            <Label>Department</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {DEPTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Admitting doctor */}
          <div>
            <Label>Admitting Doctor</Label>
            <Select value={doctorId} onValueChange={(id) => {
              const doc = (doctorsData ?? []).find((d: any) => d._id === id);
              setDoctorId(id);
              setDoctor(doc?.name ?? "");
            }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={doctor || "Select doctor"} /></SelectTrigger>
              <SelectContent>
                {(doctorsData ?? []).map((d: any) => (
                  <SelectItem key={d._id} value={d._id}>{d.name} — {d.specialty || d.department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Diagnosis */}
          <div>
            <Label>Provisional Diagnosis</Label>
            <Textarea className="mt-1 h-20" placeholder="Initial diagnosis / reason for admission"
              value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving} onClick={handleSubmit}>
              {saving ? "Admitting..." : "Admit Patient"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
