import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ipd as ipdApi, patients as patientsApi, users as usersApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import BedPicker from "@/components/BedPicker";
import SoapTextarea from "@/components/SoapTextarea";
import { toLocalInput } from "@/components/ipd/DischargeForm";
import { DEPTS } from "@/lib/ipd";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdmitted: () => void;
  patientId?: string;     // UHID
  patientName?: string;
  appointmentId?: string;
  fromDoctor?: string;
  fromDoctorId?: string;
  bedId?: string;         // pre-selected bed (Bed Map → free bed → Admit here)
}

export default function AdmitModal({ open, onClose, onAdmitted, patientId: initPatientId, patientName: initPatientName, appointmentId, fromDoctor, fromDoctorId, bedId: initBedId }: Props) {
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<any>(null);
  const [bedId,     setBedId]     = useState(initBedId ?? "");
  const [dept,      setDept]      = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [doctor,    setDoctor]    = useState(fromDoctor ?? "");
  const [doctorId,  setDoctorId]  = useState(fromDoctorId ?? "");
  const [admittedAt, setAdmittedAt] = useState("");   // "" = now; set only for late entry
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [showSearch, setShowSearch] = useState(!initPatientId);

  const { data: searchData } = useQuery({
    queryKey: ["patient-search-admit", search],
    queryFn:  () => patientsApi.list({ search, limit: "8" }),
    enabled:  search.length > 1,
  });
  const searchIds: string[] = (searchData?.patients ?? []).map((p: any) => p.uhid).filter(Boolean);
  const { data: admittedMap } = useQuery({
    queryKey: ["ipd-active-by-patient", searchIds],
    queryFn:  () => ipdApi.activeByPatient(searchIds),
    enabled:  searchIds.length > 0,
  });
  const { data: doctorsData } = useQuery({
    queryKey: ["doctors-admit"],
    queryFn:  () => usersApi.doctors(),
    enabled:  open,
  });

  useEffect(() => {
    if (!open) {
      setSearch(""); setSelected(null); setBedId(""); setDept(""); setDiagnosis(""); setAdmittedAt(""); setError("");
      if (!initPatientId) setShowSearch(true);
    }
    if (open && initBedId) setBedId(initBedId);
    if (initPatientId && initPatientName) {
      setSelected({ uhid: initPatientId, name: initPatientName });
      setShowSearch(false);
    }
    if (fromDoctor)   setDoctor(fromDoctor);
    if (fromDoctorId) setDoctorId(fromDoctorId);
  }, [open, initPatientId, initPatientName, fromDoctor, fromDoctorId, initBedId]);

  const patients: any[] = searchData?.patients ?? [];

  const handleSubmit = async () => {
    if (!selected || !bedId || !diagnosis || !doctor) {
      setError("Patient, bed, doctor and diagnosis are required"); return;
    }
    setSaving(true); setError("");
    try {
      // Server resolves the UHID and copies name/age/gender/phone from the patient record
      await ipdApi.admit({
        patientId:            selected.uhid || selected._id,
        appointmentId:        appointmentId || "",
        admittingDoctor:      doctor,
        admittingDoctorId:    doctorId,
        department:           dept || selected.department || "",
        bedId,
        provisionalDiagnosis: diagnosis,
        ...(admittedAt ? { admissionDate: new Date(admittedAt).toISOString() } : {}),
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
                  {patients.map((p: any) => {
                    const adm = admittedMap?.[p.uhid];
                    return (
                      <button key={p._id} disabled={!!adm}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        onClick={() => { setSelected(p); setShowSearch(false); setDept(p.department || ""); }}>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground ml-2">{[p.uhid, p.phone].filter(Boolean).join(" · ")}</span>
                        {adm && (
                          <Badge className="ml-2 text-[10px] bg-teal-50 text-teal-700 border border-teal-200">
                            Admitted · {adm.ward} {adm.bedNumber}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium">{selected?.name}</p>
                <p className="text-xs text-muted-foreground">{[selected?.uhid, selected?.phone].filter(Boolean).join(" · ")}</p>
              </div>
              {!initPatientId && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowSearch(true)}>Change</Button>
              )}
            </div>
          )}

          {/* Ward + Bed */}
          <div>
            <Label>Bed</Label>
            <BedPicker className="mt-1" value={bedId} onChange={setBedId} />
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
            <SoapTextarea field="assessment" className="mt-1" placeholder="Initial diagnosis / reason for admission (ICD-10 suggestions as you type)"
              value={diagnosis} onChange={setDiagnosis} />
          </div>

          {/* Late entry: patient was admitted earlier than now */}
          {admittedAt === "" ? (
            <button type="button" className="text-xs text-primary hover:underline"
              onClick={() => setAdmittedAt(toLocalInput(new Date()))}>
              Patient was admitted earlier? Set admission time
            </button>
          ) : (
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs">Admission Time</Label>
                <Input className="mt-1 h-9" type="datetime-local" value={admittedAt}
                  min={toLocalInput(new Date(Date.now() - 7 * 86400000))} max={toLocalInput(new Date())}
                  onChange={(e) => setAdmittedAt(e.target.value)} />
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setAdmittedAt("")}>Use now</Button>
            </div>
          )}

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
