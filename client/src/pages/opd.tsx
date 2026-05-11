import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Stethoscope, Mic, MicOff, Brain, Pill, FlaskConical, FileText,
  AlertTriangle, CheckCircle2, Clock, Activity, Thermometer, Heart, User,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { patients as patientsApi, appointments as apptApi } from "@/lib/api";
import { PATIENTS as PATIENTS_FB, APPOINTMENTS as APPTS_FB } from "@/lib/mock-data";
import LabOrderModal from "@/components/modals/LabOrderModal";
import PharmacyModal from "@/components/modals/PharmacyModal";

const VITALS = [
  { label: "BP",     value: "142/90", unit: "mmHg",  icon: Activity,    status: "High" },
  { label: "Pulse",  value: "88",     unit: "bpm",   icon: Heart,       status: "Normal" },
  { label: "Temp",   value: "98.6",   unit: "°F",    icon: Thermometer, status: "Normal" },
  { label: "SpO2",   value: "97",     unit: "%",     icon: Activity,    status: "Normal" },
  { label: "Weight", value: "78",     unit: "kg",    icon: Activity,    status: "" },
  { label: "BMI",    value: "26.8",   unit: "kg/m²", icon: Activity,    status: "Overweight" },
];

const AI_DDX = [
  { rank: 1, diagnosis: "Essential Hypertension",     icd: "I10",   confidence: 88, evidence: "BP 142/90, chronic medications, family Hx" },
  { rank: 2, diagnosis: "Hypertensive Heart Disease",  icd: "I11.9", confidence: 64, evidence: "Elevated BP, palpitations, age 45" },
  { rank: 3, diagnosis: "White Coat Hypertension",     icd: "R03.0", confidence: 32, evidence: "Clinic BP, normal ambulatory possible" },
];

const BLANK_SOAP = { subjective: "", objective: "", assessment: "", plan: "" };

export default function OPDPage() {
  const qc = useQueryClient();
  const { data: pData } = useQuery({ queryKey: ["patients-opd"], queryFn: () => patientsApi.list({ status: "OPD", limit: "50" }), retry: false });
  const { data: aData } = useQuery({ queryKey: ["appointments-today"], queryFn: () => apptApi.list({ date: new Date().toISOString().split("T")[0] }), retry: false });

  const allPatients: any[] = (pData?.patients ?? PATIENTS_FB).map((p: any) => ({ ...p, id: p.uhid || p._id || p.id }));
  const todayAppts: any[]  = (aData?.appointments ?? APPTS_FB).map((a: any) => ({ ...a, id: a.aptId || a._id || a.id }));

  const [isRecording, setIsRecording] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [rxModalOpen, setRxModalOpen] = useState(false);

  const activePatient = allPatients.find((p) => p.id === selectedPatientId) ?? allPatients[0];

  const [soapNote, setSoapNote] = useState({
    subjective: "Patient presents with persistent headache and occasional dizziness for the past 2 weeks. No chest pain. Family history of hypertension (father).",
    objective:  "BP: 142/90 mmHg (right arm), Pulse: 88/min regular, Temp: 98.6°F, SpO2: 97%. CVS: S1 S2 heard, no murmurs.",
    assessment: "1. Essential Hypertension — uncontrolled\n2. Elevated BMI (26.8 kg/m²)",
    plan:       "1. Continue antihypertensives, consider dose titration\n2. Lifestyle modifications — DASH diet, exercise\n3. Lipid profile, RFT ordered\n4. Review in 4 weeks",
  });

  // Reset SOAP when patient switches
  useEffect(() => { setSoapNote(BLANK_SOAP); }, [selectedPatientId]);

  const activeAppt = todayAppts.find(
    (a) => a.patientId === activePatient?.id || a.patientId === activePatient?.uhid
  );

  const handleCompleteSign = async () => {
    setSigning(true);
    try {
      if (activeAppt) {
        await apptApi.update(activeAppt.id, { status: "Completed", notes: `${soapNote.assessment}\n\nPlan: ${soapNote.plan}` });
        qc.invalidateQueries({ queryKey: ["appointments-today"] });
        qc.invalidateQueries({ queryKey: ["appointments"] });
      }
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">OPD Consultation — EMR</h2>
          <p className="text-sm text-muted-foreground">AI Clinical Co-Pilot active · Ambient Scribe ready</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isRecording ? "destructive" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setIsRecording((v) => !v)}
          >
            {isRecording ? <><MicOff className="h-4 w-4" /> Stop Scribe</> : <><Mic className="h-4 w-4" /> AI Scribe</>}
          </Button>
          <Button size="sm" className="gap-2" disabled={signing} onClick={handleCompleteSign}>
            <CheckCircle2 className="h-4 w-4" /> {signing ? "Signing..." : "Complete & Sign"}
          </Button>
        </div>
      </div>

      {isRecording && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <Brain className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            Ambient AI Scribe recording — speak naturally. SOAP notes will auto-generate in real-time.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Patient Queue sidebar */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Today's Queue ({todayAppts.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2">
              {todayAppts.length === 0 && allPatients.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No OPD patients today</p>
              )}
              {todayAppts.map((apt: any) => {
                const pat = allPatients.find((p) => p.id === apt.patientId || p.uhid === apt.patientId);
                const pid = pat?.id ?? apt.patientId;
                const isActive = (selectedPatientId ?? allPatients[0]?.id) === pid;
                return (
                  <button
                    key={apt.id}
                    onClick={() => setSelectedPatientId(pid)}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isActive ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>
                      {apt.patientName?.[0] ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{apt.patientName}</div>
                      <div className={`text-xs truncate ${isActive ? "text-white/70" : "text-muted-foreground"}`}>{apt.time} · {apt.status}</div>
                    </div>
                  </button>
                );
              })}
              {todayAppts.length === 0 && allPatients.slice(0, 8).map((p: any) => {
                const isActive = (selectedPatientId ?? allPatients[0]?.id) === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isActive ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>
                      {p.name?.[0] ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{p.name}</div>
                      <div className={`text-xs truncate ${isActive ? "text-white/70" : "text-muted-foreground"}`}>{p.diagnosis}</div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {activePatient && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Patient</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {activePatient.name?.[0] ?? "?"}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{activePatient.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{activePatient.id}</div>
                  </div>
                </div>
                <div className="text-xs space-y-1.5">
                  {[
                    ["Age", `${activePatient.age}y · ${activePatient.gender === "M" ? "Male" : "Female"}`],
                    ["Blood Group", activePatient.bloodGroup],
                    ["Department", activePatient.department],
                    ["Insurance", activePatient.insurance],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-1">
                  <div className="text-xs font-medium mb-1">Diagnosis</div>
                  <p className="text-xs text-muted-foreground leading-snug">{activePatient.diagnosis}</p>
                </div>
                {activeAppt && (
                  <Badge className={`text-xs w-full justify-center ${
                    activeAppt.status === "Completed" ? "bg-teal-100 text-teal-700" :
                    activeAppt.status === "In Consult" ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>{activeAppt.status}</Badge>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main EMR area */}
        <div className="lg:col-span-3 space-y-4">
          {/* Vitals */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Vital Signs</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  <Activity className="h-3.5 w-3.5" /> Connect IoT Device
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {VITALS.map((v) => (
                  <div key={v.label} className={`rounded-xl p-3 text-center ${
                    v.status === "High" ? "bg-red-50 border border-red-100" :
                    v.status === "Overweight" ? "bg-amber-50 border border-amber-100" :
                    "bg-muted"
                  }`}>
                    <div className="text-lg font-bold">{v.value}</div>
                    <div className="text-xs text-muted-foreground">{v.unit}</div>
                    <div className="text-xs font-medium mt-0.5">{v.label}</div>
                    {v.status && v.status !== "Normal" && (
                      <Badge className={`text-xs mt-1 ${v.status === "High" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {v.status}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SOAP Notes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">SOAP Clinical Notes</CardTitle>
                {isRecording && <Badge className="bg-red-100 text-red-700 text-xs animate-pulse">AI Generating...</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {(["subjective", "objective", "assessment", "plan"] as const).map((key) => (
                  <div key={key}>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      {key === "subjective" ? "S — Subjective" :
                       key === "objective"  ? "O — Objective"  :
                       key === "assessment" ? "A — Assessment" : "P — Plan"}
                    </label>
                    <Textarea
                      value={soapNote[key]}
                      onChange={(e) => setSoapNote((prev) => ({ ...prev, [key]: e.target.value }))}
                      rows={4}
                      className="text-xs resize-none"
                      placeholder={
                        key === "subjective" ? "Chief complaint, history of present illness..." :
                        key === "objective"  ? "Vitals, physical exam findings..." :
                        key === "assessment" ? "Diagnoses (ICD codes)..." :
                        "Treatment plan, orders, follow-up..."
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* AI DDx */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">AI Differential Diagnosis</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {AI_DDX.map((d) => (
                  <div key={d.rank} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary">#{d.rank}</span>
                        <span className="text-sm font-medium">{d.diagnosis}</span>
                      </div>
                      <Badge className="text-xs font-mono bg-muted text-muted-foreground">{d.icd}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${d.confidence}%` }} />
                      </div>
                      <span className="text-xs font-medium">{d.confidence}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{d.evidence}</p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs mt-1 px-2"
                      onClick={() => setSoapNote((s) => ({ ...s, assessment: s.assessment ? `${s.assessment}\n${d.rank}. ${d.diagnosis} (${d.icd})` : `${d.rank}. ${d.diagnosis} (${d.icd})` }))}>
                      + Add to Assessment
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* e-Prescription / Orders */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm font-semibold">Orders</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => setLabModalOpen(true)}>
                  <FlaskConical className="h-3.5 w-3.5 text-teal-600" /> Order Lab Test
                </Button>
                <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => setRxModalOpen(true)}>
                  <Pill className="h-3.5 w-3.5 text-amber-600" /> Dispense / Prescription
                </Button>
                <Button size="sm" className="w-full gap-2 text-xs" disabled={signing} onClick={handleCompleteSign}>
                  <FileText className="h-3.5 w-3.5" /> {signing ? "Signing..." : "Complete & Sign Note"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <LabOrderModal
        open={labModalOpen}
        onClose={() => setLabModalOpen(false)}
        existing={activePatient ? { patientId: activePatient.id, patientName: activePatient.name } : undefined}
      />
      <PharmacyModal
        open={rxModalOpen}
        onClose={() => setRxModalOpen(false)}
        mode="order"
        existing={activePatient ? { patientId: activePatient.id, patientName: activePatient.name } : undefined}
      />
    </div>
  );
}
