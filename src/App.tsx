import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Upload, 
  Copy, 
  Check, 
  RotateCcw, 
  Download, 
  FileText, 
  AlertTriangle, 
  Trash2, 
  FileUp, 
  CheckCircle2, 
  User, 
  HelpCircle,
  Clock,
  ArrowRight,
  Sun,
  Moon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types corresponding to backend response
interface DecisionRecord {
  decisionFound: boolean;
  friendlyNoDecisionMessage?: string;
  decision?: string;
  optionsConsidered?: Array<{ optionName: string; weighedWhy: string }>;
  rationale?: {
    reasoning: string;
    constraints: string[];
    tradeOffs: string;
  };
  ownerNextSteps?: {
    owner: string;
    nextSteps: string[];
  };
}

export default function App() {
  const [notesText, setNotesText] = useState("");
  const [filePayload, setFilePayload] = useState<{ base64: string; name: string; type: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // For dynamic loading messages
  const [screen, setScreen] = useState<"input" | "result" | "empty">("input");
  const [record, setRecord] = useState<DecisionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("decidely-theme");
      if (stored === "light" || stored === "dark") {
        return stored;
      }
    }
    return "dark";
  });

  useEffect(() => {
    localStorage.setItem("decidely-theme", theme);
    if (theme === "light") {
      document.body.style.backgroundColor = "#fafafa";
      document.body.style.backgroundImage = "radial-gradient(circle at 50% -20%, rgba(59, 130, 246, 0.08) 0%, transparent 50%), radial-gradient(circle at 50% 100%, #f3f4f6 0%, #fafafa 100%)";
      document.body.style.color = "#27272a";
    } else {
      document.body.style.backgroundColor = "#030712";
      document.body.style.backgroundImage = "radial-gradient(circle at 50% -20%, rgba(29, 78, 216, 0.15) 0%, transparent 50%), radial-gradient(circle at 50% 100%, rgba(17, 24, 39, 0.8) 0%, #030712 100%)";
      document.body.style.color = "#f3f4f6";
    }
  }, [theme]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic loading messages to show progress
  const loadingSteps = [
    "Reading input details...",
    "Extracting discussion threads...",
    "Running semantic decision analysis...",
    "Formulating architectural rationale...",
    "Drafting ownership constraints and next steps...",
    "Polishing structured markdown record..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setCurrentStep(0);
      interval = setInterval(() => {
        setCurrentStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Handle client-side file uploads
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File, uploadMethod: string = "file_picker") => {
    const validTypes = [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const isValidExtension = ["txt", "pdf", "docx"].includes(fileExtension || "");

    if (!validTypes.includes(file.type) && !isValidExtension) {
      pendo.track("file_upload_rejected", {
        file_name: file.name.substring(0, 50),
        file_type: file.type || "",
        file_extension: fileExtension || "",
        file_size_bytes: file.size,
        rejection_reason: "unsupported_format"
      });
      setError("Unsupported file format. Please upload a .txt, .pdf, or .docx file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      pendo.track("file_upload_rejected", {
        file_name: file.name.substring(0, 50),
        file_type: file.type || "",
        file_extension: fileExtension || "",
        file_size_bytes: file.size,
        rejection_reason: "file_too_large"
      });
      setError("File is too large. Max file size limit is 10MB.");
      return;
    }

    setError(null);
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      const base64Content = result.split(",")[1] || result;
      setFilePayload({
        base64: base64Content,
        name: file.name,
        type: file.type || `application/${fileExtension}`
      });
      
      pendo.track("file_uploaded", {
        file_name: file.name.substring(0, 50),
        file_type: file.type || `application/${fileExtension}`,
        file_extension: fileExtension || "",
        file_size_bytes: file.size,
        upload_method: uploadMethod
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file, "drag_and_drop");
    }
  };

  const removeFile = () => {
    setFilePayload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Submit flow to Express API Route
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!notesText.trim() && !filePayload) {
      setError("Please paste some text or upload a meeting minutes file to proceed.");
      return;
    }

    loading || setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notesText,
          filePayload,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to generate decision record.");
      }

      const responseText = await response.text();
      if (responseText.trim() === "NO_DECISION_FOUND") {
        const emptyRecord: DecisionRecord = {
          decisionFound: false,
          friendlyNoDecisionMessage: "NO_DECISION_FOUND"
        };
        setRecord(emptyRecord);
        setScreen("empty");
        
        pendo.track("no_decision_found", {
          input_method: filePayload ? (notesText.trim() ? "both" : "file") : "text",
          has_text_input: !!notesText.trim(),
          has_file_upload: !!filePayload,
          file_type: filePayload?.type || "",
          file_name: (filePayload?.name || "").substring(0, 50),
          text_input_length: notesText.length
        });
      } else {
        const data: DecisionRecord = JSON.parse(responseText);
        setRecord(data);
        if (data.decisionFound) {
          setScreen("result");
          pendo.track("decision_report_generated", {
            input_method: filePayload ? (notesText.trim() ? "both" : "file") : "text",
            has_text_input: !!notesText.trim(),
            has_file_upload: !!filePayload,
            file_type: filePayload?.type || "",
            file_name: (filePayload?.name || "").substring(0, 50),
            text_input_length: notesText.length,
            options_considered_count: data.optionsConsidered?.length || 0,
            has_owner: !!data.ownerNextSteps?.owner,
            owner_value: (data.ownerNextSteps?.owner || "").substring(0, 50),
            next_steps_count: data.ownerNextSteps?.nextSteps?.length || 0,
            constraints_count: data.rationale?.constraints?.length || 0,
            decision_text_length: data.decision?.length || 0
          });
        } else {
          setScreen("empty");
          pendo.track("no_decision_found", {
            input_method: filePayload ? (notesText.trim() ? "both" : "file") : "text",
            has_text_input: !!notesText.trim(),
            has_file_upload: !!filePayload,
            file_type: filePayload?.type || "",
            file_name: (filePayload?.name || "").substring(0, 50),
            text_input_length: notesText.length
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      pendo.track("decision_report_generation_failed", {
        error_message: (err?.message || "Unknown error").substring(0, 100),
        input_method: filePayload ? (notesText.trim() ? "both" : "file") : "text",
        has_text_input: !!notesText.trim(),
        has_file_upload: !!filePayload,
        file_type: filePayload?.type || "",
        text_input_length: notesText.length
      });
      setError(err?.message || "Something went wrong on the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Format record into professional markdown representation
  const generateMarkdown = (): string => {
    if (!record) return "";
    
    if (!record.decisionFound) {
      return "NO_DECISION_FOUND";
    }

    let md = `DECISION: ${record.decision}\n\n`;
    
    md += `OPTIONS CONSIDERED:\n`;
    if (record.optionsConsidered && record.optionsConsidered.length > 0) {
      record.optionsConsidered.forEach((opt) => {
        md += `- ${opt.optionName}: ${opt.weighedWhy}\n`;
      });
    } else {
      md += `- None listed\n`;
    }
    md += `\n`;

    md += `RATIONALE: `;
    if (record.rationale) {
      md += `${record.rationale.reasoning}`;
      const constraintsStr = record.rationale.constraints && record.rationale.constraints.length > 0
        ? ` Constraints: ${record.rationale.constraints.join(', ')}.`
        : '';
      const tradeOffsStr = record.rationale.tradeOffs
        ? ` Trade-offs: ${record.rationale.tradeOffs}`
        : '';
      md += `${constraintsStr}${tradeOffsStr}`;
    }
    md += `\n\n`;

    md += `OWNER & NEXT STEPS: `;
    if (record.ownerNextSteps) {
      const ownerVal = record.ownerNextSteps.owner || "Not specified.";
      const stepsVal = record.ownerNextSteps.nextSteps && record.ownerNextSteps.nextSteps.length > 0
        ? record.ownerNextSteps.nextSteps.join(', ')
        : "Not specified.";
      
      md += `Owner: ${ownerVal}. Next steps: ${stepsVal}.`;
    } else {
      md += `Not specified.`;
    }
    
    return md;
  };

  // Copy structured Markdown to user clipboard
  const handleCopy = () => {
    const md = generateMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      pendo.track("decision_report_copied", {
        markdown_length: md.length,
        decision_text: (record?.decision || "").substring(0, 100),
        options_considered_count: record?.optionsConsidered?.length || 0,
        has_owner: !!record?.ownerNextSteps?.owner,
        next_steps_count: record?.ownerNextSteps?.nextSteps?.length || 0
      });
    });
  };

  // Download ADR file locally as Markdown file
  const handleDownload = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Create clean file name based on decision or generic name
    let fileName = "decision-record.md";
    if (record?.decision) {
      const slug = record.decision
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 50)
        .replace(/(^-|-$)/g, "");
      fileName = `adr-${slug}.md`;
    }

    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    pendo.track("decision_report_downloaded", {
      file_name: fileName,
      markdown_length: md.length,
      decision_text: (record?.decision || "").substring(0, 100),
      options_considered_count: record?.optionsConsidered?.length || 0,
      has_owner: !!record?.ownerNextSteps?.owner,
      next_steps_count: record?.ownerNextSteps?.nextSteps?.length || 0
    });
  };

  const handleReset = () => {
    setNotesText("");
    setFilePayload(null);
    setRecord(null);
    setError(null);
    setScreen("input");
  };

  return (
    <div className={`min-h-screen flex flex-col relative overflow-x-hidden transition-colors duration-500 selection:text-white ${
      theme === "dark" 
        ? "bg-zinc-950 text-zinc-100 selection:bg-blue-600/30" 
        : "bg-[#fafafa] text-zinc-850 selection:bg-blue-600/10"
    }`}>
      {/* Background radial glow */}
      <div className="ambient-glowing" style={{
        background: theme === "dark"
          ? "radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, transparent 70%)"
          : "radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)"
      }}></div>

      {/* Modern Minimal Navigation Bar */}
      <header className={`border-b transition-colors duration-500 sticky top-0 z-50 backdrop-blur-md ${
        theme === 'dark' 
          ? 'border-zinc-900/60 bg-zinc-950/40' 
          : 'border-zinc-200 bg-white/40 shadow-sm'
      }`}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-500 text-white flex items-center justify-center font-mono font-bold text-sm tracking-tighter">
              D
            </div>
            <div>
              <h1 className={`text-sm font-semibold tracking-wide uppercase font-mono ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>
                DECIDEDLY
              </h1>
              <p className={`text-[10px] font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Decision Report Generator
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {screen !== "input" && (
              <button 
                onClick={handleReset} 
                className={`text-xs font-mono flex items-center gap-1 px-3 py-1.5 rounded-xl border transition duration-150 ${
                  theme === "dark"
                    ? "text-zinc-400 hover:text-white bg-zinc-900/80 border-zinc-800 hover:bg-zinc-800"
                    : "text-zinc-600 hover:text-zinc-950 bg-white border-zinc-200 hover:bg-zinc-100"
                }`}
                id="reset-nav-btn"
              >
                <RotateCcw className="w-3 h-3" />
                New
              </button>
            )}

            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-center ${
                theme === "dark"
                  ? "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-zinc-700 hover:bg-zinc-800"
                  : "bg-white border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 flex flex-col justify-center relative z-10">
        
        {/* Loading Overlay State */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="relative w-16 h-16 mb-8">
              <div className={`absolute inset-0 rounded-full border-4 ${theme === 'dark' ? 'border-zinc-900' : 'border-zinc-200'}`}></div>
              <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
            </div>
            
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="text-center"
              >
                <p className={`text-sm font-mono tracking-wider uppercase mb-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Processing
                </p>
                <h3 className={`text-xl font-medium font-sans max-w-md px-4 ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                  {loadingSteps[currentStep]}
                </h3>
              </motion.div>
            </AnimatePresence>
            
            <p className={`text-xs font-mono mt-12 animate-pulse ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
              Usually finishes in 3-5 seconds.
            </p>
          </div>
        )}

        {/* Core Screens Router */}
        {!loading && (
          <AnimatePresence mode="wait">
            
            {/* Screen 1: Input */}
            {screen === "input" && (
              <motion.div
                key="input-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-12 text-center max-w-3xl mx-auto"
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative w-16 h-16 mb-2 flex items-center justify-center select-none">
                    <div className={`absolute w-20 h-20 blur-xl rounded-full ${
                      theme === 'dark' 
                        ? 'bg-gradient-to-tr from-cyan-500/25 via-blue-500/20 to-amber-500/20' 
                        : 'bg-gradient-to-tr from-cyan-500/15 via-blue-500/10 to-indigo-500/10'
                    }`}></div>
                    <svg className="w-12 h-12 relative z-10" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <radialGradient id="starGrad" cx="50%" cy="50%" r="50%" fx="45%" fy="45%">
                          <stop offset="0%" stopColor="#ffffff" />
                          <stop offset="25%" stopColor="#38bdf8" />
                          <stop offset="50%" stopColor="#a855f7" />
                          <stop offset="75%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#fbbf24" />
                        </radialGradient>
                      </defs>
                      <path 
                        d="M50 0C50 35 35 50 0 50C35 50 50 65 50 100C50 65 65 50 100 50C65 50 50 35 50 0Z" 
                        fill="url(#starGrad)" 
                      />
                    </svg>
                  </div>

                  <motion.h2 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className={`text-4xl sm:text-5xl font-bold tracking-tight font-sans ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}
                  >
                    Turn meeting chaos into clear decisions
                  </motion.h2>
                  <p className={`text-sm max-w-xl mx-auto leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-650'}`}>
                    Paste your raw notes, Slack threads, or upload a document to extract a clean, structured decision record.
                  </p>
                </div>

                {/* Main Input Form */}
                <form onSubmit={handleSubmit} className="space-y-6 text-left">
                  {error && (
                    <div className={`p-4 border rounded-xl text-xs flex gap-3 items-start ${
                      theme === 'dark'
                        ? 'bg-red-950/20 border-red-900/60 text-red-200'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`} />
                      <div>
                        <span className="font-semibold block font-mono uppercase tracking-wider mb-1">Engine Error</span>
                        {error}
                      </div>
                    </div>
                  )}

                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border rounded-2xl transition duration-350 shadow-xl backdrop-blur-md overflow-hidden ${
                      dragOver 
                        ? (theme === 'dark' 
                            ? "border-blue-500/60 ring-2 ring-blue-500/10 bg-zinc-900/70"
                            : "border-blue-500 bg-blue-50/20 ring-2 ring-blue-500/5")
                        : (theme === 'dark' 
                            ? "border-zinc-800 hover:border-zinc-700 focus-within:border-zinc-600 focus-within:ring-2 focus-within:ring-zinc-800/40 bg-zinc-900/40"
                            : "border-zinc-200 hover:border-zinc-300 focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-indigo-200 bg-white")
                    }`}
                  >
                    {dragOver && (
                      <div className={`absolute inset-0 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none border rounded-2xl ${
                        theme === 'dark' ? 'bg-blue-950/20 border-blue-500/40 text-blue-400' : 'bg-blue-50/40 border-blue-300 text-blue-600'
                      }`}>
                        <div className="text-center font-mono text-xs font-medium">
                          Drop file here to upload instantly...
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <textarea
                        value={notesText}
                        onChange={(e) => {
                          setNotesText(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Paste your meeting notes, Slack logs, email chain, or transcript here..."
                        className={`w-full min-h-[100px] sm:min-h-[180px] max-h-[400px] p-4 sm:p-6 text-sm focus:outline-none transition font-sans placeholder-zinc-500 leading-relaxed bg-transparent resize-y ${
                          theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'
                        }`}
                        id="paste-textarea"
                      />
                    </div>

                    {filePayload && (
                      <div className="px-6 pb-2">
                        <div className={`inline-flex items-center gap-2 p-2 pl-3 pr-2 rounded-lg border text-[11px] font-mono ${
                          theme === 'dark'
                            ? 'bg-zinc-950/80 border-zinc-800 text-zinc-300'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        }`}>
                          <FileText className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                          <span className="truncate max-w-[200px]">{filePayload.name}</span>
                          <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-650' : 'text-zinc-500'}`}>({(filePayload.base64.length * 0.75 / 1024).toFixed(0)} KB)</span>
                          <button
                            type="button"
                            onClick={removeFile}
                            className={`p-1 rounded transition ml-1 cursor-pointer ${
                              theme === 'dark' 
                                ? 'hover:bg-zinc-800 text-zinc-500 hover:text-red-400' 
                                : 'hover:bg-zinc-200 text-zinc-400 hover:text-red-650'
                            }`}
                            title="Remove attachment"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className={`flex items-center justify-between px-6 py-4 border-t ${
                      theme === 'dark' 
                        ? 'border-zinc-950/80 bg-zinc-950/60' 
                        : 'border-zinc-100 bg-zinc-50/60'
                    }`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept=".txt,.pdf,.docx"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`w-8 h-8 rounded-full border flex items-center justify-center transition cursor-pointer ${
                            theme === 'dark'
                              ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                              : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-350 hover:text-zinc-900 shadow-xs'
                          }`}
                          title="Attach document (.txt, .pdf, .docx)"
                        >
                          <span className="text-lg font-light">+</span>
                        </button>
                        <span className={`text-xs font-mono hidden sm:inline ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-450'}`}>
                          Add document (.txt, .pdf, .docx)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full pt-2">
                    <button
                      type="submit"
                      className={`w-full py-3.5 rounded-xl font-medium text-sm transition duration-150 inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${
                        theme === 'dark'
                          ? 'bg-white hover:bg-zinc-100 text-zinc-950 shadow-black/30'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-zinc-200/50'
                      }`}
                      id="generate-ctabtn"
                    >
                      <span>Generate decision Report</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Screen 2: Results Display */}
            {screen === "result" && record && (
              <motion.div
                key="result-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 ${
                  theme === 'dark' ? 'border-zinc-900' : 'border-zinc-200'
                }`}>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <Check className="w-8 h-8 text-emerald-500 shrink-0 stroke-[3px]" />
                      <h2 className={`text-3xl font-light font-sans tracking-tight ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                        Generated Decision Report
                      </h2>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      title={copied ? "Copied!" : "Copy Markdown"}
                      className={`w-10 h-10 rounded-xl border transition flex items-center justify-center cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-800'
                          : 'bg-white hover:bg-zinc-50 text-zinc-650 hover:text-zinc-900 border-zinc-200 shadow-xs'
                      }`}
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={handleDownload}
                      title="Download Decision Report (.md)"
                      className={`w-10 h-10 rounded-xl border transition flex items-center justify-center cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-800'
                          : 'bg-white hover:bg-zinc-50 text-zinc-650 hover:text-zinc-900 border-zinc-200 shadow-xs'
                      }`}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Main output dynamic view blocks matching ADR formats */}
                <div className="space-y-6">
                  <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-zinc-900/20 border-zinc-900' : 'bg-white border-zinc-100 shadow-sm'}`}>
                    <h4 className={`text-xs font-mono uppercase tracking-wider mb-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Core Decision</h4>
                    <p className="text-lg font-medium font-sans leading-relaxed">{record.decision}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-zinc-900/20 border-zinc-900' : 'bg-white border-zinc-100 shadow-sm'}`}>
                      <h4 className={`text-xs font-mono uppercase tracking-wider mb-4 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Options Considered</h4>
                      <ul className="space-y-4">
                        {record.optionsConsidered?.map((opt, i) => (
                          <li key={i} className="text-sm leading-relaxed">
                            <strong className={theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}>{opt.optionName}</strong>
                            <p className={`mt-0.5 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{opt.weighedWhy}</p>
                          </li>
                        )) || <span className="text-xs text-zinc-500 italic">None logged</span>}
                      </ul>
                    </div>

                    <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-zinc-900/20 border-zinc-900' : 'bg-white border-zinc-100 shadow-sm'}`}>
                      <h4 className={`text-xs font-mono uppercase tracking-wider mb-4 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Rationale & Architecture</h4>
                      <div className="space-y-3 text-sm leading-relaxed">
                        <p>{record.rationale?.reasoning}</p>
                        {record.rationale?.tradeOffs && (
                          <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            <strong>Trade-offs:</strong> {record.rationale.tradeOffs}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {record.ownerNextSteps && (
                    <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-zinc-900/20 border-zinc-900' : 'bg-white border-zinc-100 shadow-sm'}`}>
                      <h4 className={`text-xs font-mono uppercase tracking-wider mb-3 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Ownership & Next Steps</h4>
                      <div className="flex items-center gap-2 mb-4">
                        <User className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium">Owner: {record.ownerNextSteps.owner || "Unassigned"}</span>
                      </div>
                      <ul className="space-y-2">
                        {record.ownerNextSteps.nextSteps.map((step, idx) => (
                          <li key={idx} className="text-sm flex gap-2.5 items-start">
                            <CheckCircle2 className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                            <span className={theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Screen 3: Fallback Empty State */}
            {screen === "empty" && (
              <motion.div
                key="empty-screen"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-16 max-w-md mx-auto space-y-6"
              >
                <div className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center ${theme === 'dark' ? 'bg-zinc-900 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">No definite decision found</h3>
                  <p className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    We scanned the meeting minutes but couldn't pinpoint a concrete consensus statement or architectural pattern switch. Try adding extra discussion details or logging options weighed explicitly.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-medium transition duration-150 ${
                    theme === 'dark' 
                      ? 'bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800' 
                      : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                  }`}
                >
                  Return to Input
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </main>
    </div>
  );
}