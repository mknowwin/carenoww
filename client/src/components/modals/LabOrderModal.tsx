import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { lab as labApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { todayInTz } from "@/lib/utils";
import { LAB_TEST_MASTER, buildParameterTemplate } from "@/lib/labTestMaster";

const COMMON_TESTS = Object.keys(LAB_TEST_MASTER);
const EXTRA_TESTS  = ["MRI Brain", "CT Scan", "2D Echo", "Bone Density", "PFT", "Sputum Culture"];

interface LabParam {
  testName: string;
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  defaultValue: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  doctor?: string;
}

export default function LabOrderModal({ open, onClose, onSaved, patientId, patientName, appointmentId, doctor }: Props) {
  const { user } = useAuth();
  const todayStr = todayInTz(user?.timezone ?? "Asia/Kolkata");

  const [selected,   setSelected]   = useState<string[]>([]);
  const [params,     setParams]     = useState<LabParam[]>([]);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [custom,     setCustom]     = useState("");
  const [priority,   setPriority]   = useState("Routine");
  const [notes,      setNotes]      = useState("");
  const [sampleDate, setSampleDate] = useState(todayStr);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  const toggle = (test: string) => {
    setSelected((prev) => {
      if (prev.includes(test)) {
        // deselect — remove its parameters
        setParams((p) => p.filter((x) => x.testName !== test));
        setExpandedTests((s) => { const n = new Set(s); n.delete(test); return n; });
        return prev.filter((t) => t !== test);
      } else {
        // select — add parameter template
        const template = buildParameterTemplate([test]).map((p) => ({
          ...p,
          value: p.defaultValue,
        })) as LabParam[];
        setParams((p) => [...p, ...template]);
        setExpandedTests((s) => new Set([...s, test]));
        return [...prev, test];
      }
    });
  };

  const addCustom = () => {
    const t = custom.trim();
    if (!t) return;
    if (!selected.includes(t)) {
      setSelected((p) => [...p, t]);
      // custom tests have no parameters
    }
    setCustom("");
  };

  const updateParam = (testName: string, paramName: string, value: string) => {
    setParams((prev) =>
      prev.map((p) => p.testName === testName && p.name === paramName ? { ...p, value } : p)
    );
  };

  const toggleExpand = (test: string) => {
    setExpandedTests((s) => {
      const n = new Set(s);
      if (n.has(test)) n.delete(test); else n.add(test);
      return n;
    });
  };

  const handleSave = async () => {
    if (!selected.length) { setError("Select at least one test"); return; }
    setSaving(true); setError("");
    try {
      await labApi.create({
        patientId,
        patientName,
        appointmentId: appointmentId || "",
        test:       selected.join(", "),
        priority,
        doctor:     doctor || "",
        notes,
        sampleDate: sampleDate || null,
        parameters: params.map(({ testName, name, value, unit, referenceRange }) => ({
          testName, name, value, unit, referenceRange,
        })),
      });
      // reset
      setSelected([]); setParams([]); setExpandedTests(new Set());
      setCustom(""); setNotes(""); setPriority("Routine"); setSampleDate(todayStr);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to place order");
      setSaving(false);
    }
  };

  const testGroups = selected.filter((t) => (params.filter((p) => p.testName === t).length > 0));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-600" />
            Lab Order — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Test selection */}
          <div>
            <Label className="text-xs mb-2 block">Common Tests</Label>
            <div className="flex flex-wrap gap-1.5">
              {[...COMMON_TESTS, ...EXTRA_TESTS].map((t) => (
                <button key={t} onClick={() => toggle(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selected.includes(t)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Custom test */}
          <div>
            <Label className="text-xs">Add Custom Test</Label>
            <div className="flex gap-2 mt-1">
              <Input className="h-8 text-sm flex-1" placeholder="Type test name..."
                value={custom} onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={addCustom}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          {/* Selected tests with parameter panels */}
          {selected.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Selected Tests ({selected.length}) — Parameters</Label>
              {selected.map((test) => {
                const testParams = params.filter((p) => p.testName === test);
                const isExpanded = expandedTests.has(test);
                const hasParams  = testParams.length > 0;

                return (
                  <div key={test} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className={`flex items-center justify-between px-3 py-2 ${hasParams ? "cursor-pointer hover:bg-gray-50" : "bg-blue-50"}`}
                      onClick={() => hasParams && toggleExpand(test)}>
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-sm font-medium">{test}</span>
                        {hasParams && (
                          <span className="text-xs text-gray-400">({testParams.length} param{testParams.length !== 1 ? "s" : ""})</span>
                        )}
                        {!hasParams && (
                          <span className="text-xs text-blue-500 italic">custom test</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {hasParams && (isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                          : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        <button onClick={(e) => { e.stopPropagation(); toggle(test); }}
                          className="text-gray-400 hover:text-red-500 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Parameters grid */}
                    {hasParams && isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/50">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left px-3 py-1.5 font-medium text-gray-600 bg-gray-100 w-[40%]">Parameter</th>
                                <th className="text-left px-3 py-1.5 font-medium text-gray-600 bg-gray-100 w-[20%]">Value</th>
                                <th className="text-left px-3 py-1.5 font-medium text-gray-600 bg-gray-100 w-[15%]">Unit</th>
                                <th className="text-left px-3 py-1.5 font-medium text-gray-600 bg-gray-100">Reference Range</th>
                              </tr>
                            </thead>
                            <tbody>
                              {testParams.map((p) => (
                                <tr key={p.name} className="border-b border-gray-100 last:border-0">
                                  <td className="px-3 py-1.5 text-gray-700">{p.name}</td>
                                  <td className="px-2 py-1">
                                    <Input
                                      className="h-6 text-xs border-gray-300 focus:border-blue-400 w-full"
                                      value={p.value}
                                      placeholder={p.defaultValue}
                                      onChange={(e) => updateParam(test, p.name, e.target.value)}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5 text-gray-500">{p.unit}</td>
                                  <td className="px-3 py-1.5 text-gray-400 italic">{p.referenceRange}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Sample / Collection Date */}
            <div>
              <Label className="text-xs">Sample / Collection Date</Label>
              <Input
                type="date"
                className="mt-1 h-8 text-sm"
                value={sampleDate}
                onChange={(e) => setSampleDate(e.target.value)}
                max={todayStr}
              />
            </div>

            {/* Priority */}
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Routine">Routine</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                  <SelectItem value="STAT">STAT (Immediate)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Clinical Notes</Label>
            <Textarea className="mt-1 h-14 text-sm" placeholder="Clinical history, suspected diagnosis..."
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving || !selected.length} onClick={handleSave}>
              {saving ? "Ordering..." : `Order ${selected.length || ""} Test${selected.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
