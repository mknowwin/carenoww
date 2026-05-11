import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, User, Phone, Droplets, AlertTriangle,
  CheckCircle2, Clock, Bed, Brain, QrCode, Upload, Pencil, LogOut, Stethoscope,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { patients as patientsApi } from "@/lib/api";
import { PATIENTS as PATIENTS_FALLBACK } from "@/lib/mock-data";
import { getInitials } from "@/lib/utils";
import PatientModal from "@/components/modals/PatientModal";

const STATUS_COLORS: Record<string, string> = {
  OPD:        "bg-blue-100 text-blue-700",
  IPD:        "bg-teal-100 text-teal-700",
  ICU:        "bg-red-100 text-red-700",
  Discharged: "bg-gray-100 text-gray-600",
};
const RISK_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High:     "bg-amber-100 text-amber-700",
  Medium:   "bg-yellow-100 text-yellow-700",
  Low:      "bg-green-100 text-green-700",
};
const BLOOD_COLORS: Record<string, string> = {
  "O+": "bg-red-50 text-red-600", "O-": "bg-red-100 text-red-700",
  "A+": "bg-orange-50 text-orange-600", "A-": "bg-orange-100 text-orange-700",
  "B+": "bg-amber-50 text-amber-600", "B-": "bg-amber-100 text-amber-700",
  "AB+": "bg-purple-50 text-purple-600", "AB-": "bg-purple-100 text-purple-700",
};

export default function PatientsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPatient, setEditPatient] = useState<any>(null);
  const [discharging, setDischarging] = useState<string | null>(null);

  const discharge = async (p: any) => {
    if (!confirm(`Discharge ${p.name}?`)) return;
    setDischarging(p.id);
    try {
      await patientsApi.update(p._id || p.id, { status: "Discharged" });
      qc.invalidateQueries({ queryKey: ["patients"] });
      if (selected === p.id) setSelected(null);
    } finally {
      setDischarging(null);
    }
  };

  const { data: apiData } = useQuery({
    queryKey: ["patients", search, statusFilter, riskFilter],
    queryFn: () => patientsApi.list({
      ...(search ? { search } : {}),
      ...(statusFilter !== "All" ? { status: statusFilter } : {}),
      ...(riskFilter !== "All" ? { riskLevel: riskFilter } : {}),
    }),
    retry: false,
  });

  const rawPatients = apiData?.patients ?? PATIENTS_FALLBACK;
  // Normalize: API returns { _id, uhid } but UI uses { id }
  const PATIENTS = rawPatients.map((p: any) => ({ ...p, id: p.uhid || p._id || p.id }));

  const filtered = PATIENTS.filter((p: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.id || "").includes(q) || p.diagnosis.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || p.status === statusFilter;
    const matchRisk = riskFilter === "All" || p.riskLevel === riskFilter;
    return matchSearch && matchStatus && matchRisk;
  });

  const selectedPatient = PATIENTS.find((p: any) => p.id === selected);

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Patient Registry</h2>
          <p className="text-sm text-muted-foreground">{apiData?.total ?? PATIENTS.length} patients · AI deduplication active</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <QrCode className="h-4 w-4" /> Scan UHID
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditPatient(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> Register Patient
          </Button>
        </div>
      </div>

      {/* AI OCR banner */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
        <Brain className="h-4 w-4 text-teal-600 shrink-0" />
        <p className="text-sm text-teal-700">
          <span className="font-semibold">AI OCR Active</span> — Upload Aadhaar, insurance card or previous records for instant auto-fill. Smart deduplication prevents double UHID creation.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, UHID, diagnosis..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {["All","OPD","IPD","ICU","Discharged"].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setStatusFilter(s)}
            >{s}</Button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {["All","Critical","High","Medium","Low"].map((r) => (
            <Button
              key={r}
              variant={riskFilter === r ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setRiskFilter(r)}
            >{r}</Button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Patient list */}
        <div className="lg:col-span-2 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No patients match your search</div>
          )}
          {filtered.map((p: any) => (
            <Card
              key={p.id}
              className={`cursor-pointer transition-all hover:shadow-md ${selected === p.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelected(p.id === selected ? null : p.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary">
                    {getInitials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{p.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{p.id}</span>
                      <Badge className={`text-xs ${RISK_COLORS[p.riskLevel]}`}>
                        {p.riskLevel === "Critical" && <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                        {p.riskLevel}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{p.age}y · {p.gender === "M" ? "Male" : "Female"}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${BLOOD_COLORS[p.bloodGroup] ?? "bg-gray-100 text-gray-600"}`}>
                        <Droplets className="h-2.5 w-2.5 inline mr-0.5" />{p.bloodGroup}
                      </span>
                      <span>{p.department}</span>
                      <span className="truncate">Dr: {p.doctor.replace("Dr. ","")}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{p.diagnosis}</div>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? "bg-gray-100"}`}>
                      {p.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground">{p.insurance}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); setEditPatient(p); setModalOpen(true); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Patient detail panel */}
        <div>
          {selectedPatient ? (
            <Card className="sticky top-0">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center font-bold text-primary text-lg">
                    {getInitials(selectedPatient.name)}
                  </div>
                  <div>
                    <CardTitle className="text-base">{selectedPatient.name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">{selectedPatient.id}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted rounded-lg p-2.5">
                    <div className="text-xs text-muted-foreground">Age / Gender</div>
                    <div className="font-medium">{selectedPatient.age}y · {selectedPatient.gender === "M" ? "Male" : "Female"}</div>
                  </div>
                  <div className="bg-muted rounded-lg p-2.5">
                    <div className="text-xs text-muted-foreground">Blood Group</div>
                    <div className={`font-medium ${BLOOD_COLORS[selectedPatient.bloodGroup]?.replace("bg-","text-").split(" ")[0] ?? ""}`}>
                      {selectedPatient.bloodGroup}
                    </div>
                  </div>
                </div>
                {[
                  { label: "Phone",      value: selectedPatient.phone,      icon: Phone },
                  { label: "Address",    value: selectedPatient.address,    icon: User },
                  { label: "Department", value: selectedPatient.department, icon: Bed },
                  { label: "Doctor",     value: selectedPatient.doctor,     icon: User },
                  { label: "Diagnosis",  value: selectedPatient.diagnosis,  icon: CheckCircle2 },
                  { label: "Insurance",  value: selectedPatient.insurance,  icon: CheckCircle2 },
                  { label: "Admitted",   value: selectedPatient.admittedOn, icon: Clock },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-start gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="text-sm font-medium">{value}</div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <Badge className={RISK_COLORS[selectedPatient.riskLevel]}>{selectedPatient.riskLevel} Risk</Badge>
                  <Badge className={STATUS_COLORS[selectedPatient.status] ?? ""}>{selectedPatient.status}</Badge>
                </div>
                <div className="flex gap-2 pt-2 flex-wrap">
                  <Button size="sm" className="flex-1 gap-1" onClick={() => setLocation("/opd")}>
                    <Stethoscope className="h-3 w-3" /> View EMR
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => { setEditPatient(selectedPatient); setModalOpen(true); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                </div>
                {selectedPatient.status !== "Discharged" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                    disabled={discharging === selectedPatient.id}
                    onClick={() => discharge(selectedPatient)}
                  >
                    <LogOut className="h-3 w-3" />
                    {discharging === selectedPatient.id ? "Discharging..." : "Discharge Patient"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a patient to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <PatientModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditPatient(null); }}
        existing={editPatient}
      />
    </div>
  );
}
