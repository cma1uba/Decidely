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

function getOrCreateVisitorId(): string {
  let id = localStorage.getItem("decidely-visitor-id");
  if (!id) {
    id = "anon-" + crypto.randomUUID();
    localStorage.setItem("decidely-visitor-id", id);
  }
  return id;
}

function getVisitorRole(): string {
  return localStorage.getItem("decidely-role") ?? "user";
}

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

  // Initialize Novus analytics once on mount
  useEffect(() => {
    window.pendo?.initialize({
      visitor: {
        id: getOrCreateVisitorId(),
        role: getVisitorRole(),
        theme: localStorage.getItem("decidely-theme") ?? "dark",
      },
      account: { id: "decidely" },
    });
  }, []);

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

  const processFile = (file: File) => {
    const validTypes = [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const isValidExtension = ["txt", "pdf", "docx"].includes(fileExtension || "");

    if (!validTypes.includes(file.type) && !isValidExtension) {
      setError("Unsupported file format. Please upload a .txt, .pdf, or .docx file.");
      window.pendo?.track("file_upload_rejected", { reason: "unsupported_format", fileType: fileExtension });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File is too large. Max file size limit is 10MB.");
      window.pendo?.track("file_upload_rejected", { reason: "file_too_large", fileSize: file.size });
      return;
    }

    setError(null);
    window.pendo?.track("file_uploaded", { fileType: fileExtension, fileSize: file.size });
    const reader = new FileReader();
    
    // For binary types (PDF/DOCX), we feed Base64 representation.
    // For .txt files, we can also transmit base64 and decode as UTF-8 on the server.
    reader.onload = () => {
      const result = reader.result as string;
      const base64Content = result.split(",")[1] || result;
      setFilePayload({
        base64: base64Content,
        name: file.name,
        type: file.type || `application/${fileExtension}`
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
      processFile(file);
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

    setLoading(true);
    setError(null);

    window.pendo?.track("notes_submitted", {
      inputLength: notesText.length,
      hasFile: !!filePayload,
      fileType: filePayload?.type ?? null,
      fileName: filePayload?.name ?? null,
    });

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
        window.pendo?.track("no_decision_found", {
          hasFile: !!filePayload,
          inputLength: notesText.length,
        });
      } else {
        const data: DecisionRecord = JSON.parse(responseText);
        setRecord(data);
        if (data.decisionFound) {
          setScreen("result");
          window.pendo?.track("decision_report_generated", {
            hasFile: !!filePayload,
            inputLength: notesText.length,
            fileType: filePayload?.type ?? null,
            optionsCount: data.optionsConsidered?.length ?? 0,
          });
        } else {
          setScreen("empty");
          window.pendo?.track("no_decision_found", {
            hasFile: !!filePayload,
            inputLength: notesText.length,
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Something went wrong on the server. Please try again.");
      window.pendo?.track("decision_report_generation_failed", {
        errorMessage: err?.message ?? "unknown",
      });
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
      window.pendo?.track("decision_report_copied", {
        contentLength: md.length,
        optionsCount: record?.optionsConsidered?.length ?? 0,
        hasOwner: !!record?.ownerNextSteps?.owner,
        hasRationale: !!record?.rationale,
        decision: record?.decision?.substring(0, 100) ?? null,
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
    window.pendo?.track("decision_report_downloaded", {
      fileName,
      contentLength: md.length,
      optionsCount: record?.optionsConsidered?.length ?? 0,
      hasOwner: !!record?.ownerNextSteps?.owner,
    });
  };

  const handleReset = () => {
    setNotesText("");
    setFilePayload(null);
    setRecord(null);
    setError(null);
    setScreen("input");
  };

  const fillSample = (sampleText: string) => {
    setNotesText(sampleText);
    setFilePayload(null);
    setError(null);
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
              onClick={() => {
                const newTheme = theme === "dark" ? "light" : "dark";
                setTheme(newTheme);
                window.pendo?.track("theme_changed", { fromTheme: theme, toTheme: newTheme });
              }}
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
                {/* Centered High End Header - "Ask away, Maluba!" visual style */}
                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Premium colorful 4-pointed star container */}
                  <div className="relative w-16 h-16 mb-2 flex items-center justify-center animate-float-slow select-none">
                    {/* Glowing backlighting circular vector blur */}
                    <div className={`absolute w-20 h-20 blur-xl rounded-full ${
                      theme === 'dark' 
                        ? 'bg-gradient-to-tr from-cyan-500/25 via-blue-500/20 to-amber-500/20' 
                        : 'bg-gradient-to-tr from-cyan-500/15 via-blue-500/10 to-indigo-500/10'
                    }`}></div>
                    <svg className="w-12 h-12 relative z-10" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <radialGradient id="starGrad" cx="50%" cy="50%" r="50%" fx="45%" fy="45%">
                          <stop offset="0%" stopColor="#ffffff" />
                          <stop offset="25%" stopColor="#38bdf8" /> {/* Cyan */}
                          <stop offset="50%" stopColor="#a855f7" /> {/* Purple */}
                          <stop offset="75%" stopColor="#f43f5e" /> {/* Rose */}
                          <stop offset="100%" stopColor="#fbbf24" /> {/* Amber */}
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



                {/* Main Input Form with Premium Capsule layout */}
                <form onSubmit={handleSubmit} className="space-y-6 text-left">
                  {error && (
                    <div className={`p-4 border rounded-xl text-xs flex gap-3 items-start animate-shake ${
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

                  {/* Elegant Large Capsule Pod Container */}
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
                    {/* Top capsule decoration or drag warning */}
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

                    {/* Integrated file list/status display inside the capsule bottom block */}
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

                    {/* Bottom Toolbar exactly resembling the screenshot pill elements styled beautifully */}
                    <div className={`flex items-center justify-between px-6 py-4 border-t ${
                      theme === 'dark' 
                        ? 'border-zinc-950/80 bg-zinc-950/60' 
                        : 'border-zinc-100 bg-zinc-50/60'
                    }`}>
                      {/* Left Side: + Attachment button */}
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

                  {/* Generate Trigger Button outside of the capsule container */}
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

            {/* Screen 2: Beautiful Structured Record */}
            {screen === "result" && record && (
              <motion.div
                key="result-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                {/* Result header */}
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
                      id="copy-report-btn"
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
                      id="download-report-btn"
                      onClick={handleDownload}
                      title="Download Decision Report (.md)"
                      className={`w-10 h-10 rounded-xl transition flex items-center justify-center cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-white hover:bg-zinc-100 text-zinc-950'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                      }`}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* High Contrast Structuring */}
                <div className="space-y-6">
                  
                  {/* Section 1: DECISION */}
                  <div className={`p-6 rounded-xl border space-y-3 shadow-sm relative overflow-hidden ${
                    theme === 'dark'
                      ? 'border-zinc-800 bg-zinc-900/10'
                      : 'border-zinc-200 bg-white shadow-xs'
                  }`}>
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                    <span className={`text-xs font-mono tracking-widest uppercase block ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      DECISION
                    </span>
                    <p className={`text-lg font-medium font-sans leading-relaxed ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                      {record.decision}
                    </p>
                  </div>

                  {/* Section 2: OPTIONS CONSIDERED */}
                  <div className={`p-6 rounded-xl border space-y-4 ${
                    theme === 'dark' ? 'border-zinc-900 bg-zinc-950/40' : 'border-zinc-200 bg-white shadow-sm'
                  }`}>
                    <span className={`text-xs font-mono tracking-widest uppercase block border-b pb-2 ${
                      theme === 'dark' ? 'text-zinc-500 border-zinc-900' : 'text-zinc-400 border-zinc-100'
                    }`}>
                      OPTIONS CONSIDERED
                    </span>
                    <div className="space-y-4">
                      {record.optionsConsidered && record.optionsConsidered.length > 0 ? (
                        record.optionsConsidered.map((opt, idx) => (
                          <div key={idx} className="space-y-1">
                            <h4 className={`text-sm font-semibold font-sans flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-850'}`}>
                              <span className={`text-xs font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>[{idx + 1}]</span>
                              {opt.optionName}
                            </h4>
                            <p className={`text-xs font-sans leading-relaxed pl-6 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-650'}`}>
                              {opt.weighedWhy}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className={`text-xs font-mono italic ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>No multiple alternatives identified in source feed.</p>
                      )}
                    </div>
                  </div>

                  {/* Section 3: RATIONALE */}
                  <div className={`p-6 rounded-xl border space-y-4 ${
                    theme === 'dark' ? 'border-zinc-900 bg-zinc-950/40' : 'border-zinc-200 bg-white shadow-sm'
                  }`}>
                    <span className={`text-xs font-mono tracking-widest uppercase block border-b pb-2 ${
                      theme === 'dark' ? 'text-zinc-500 border-zinc-900' : 'text-zinc-400 border-zinc-100'
                    }`}>
                      RATIONALE
                    </span>
                    {record.rationale && (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-12 space-y-1">
                          <p className={`text-xs font-mono uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Winning Reasoning</p>
                          <p className={`text-sm font-sans leading-relaxed ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-755'}`}>
                            {record.rationale.reasoning}
                          </p>
                        </div>
                        <div className="md:col-span-6 space-y-2">
                          <p className={`text-xs font-mono uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-405'}`}>Architectural Constraints</p>
                          <ul className={`space-y-1 list-disc list-inside text-xs font-sans ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            {record.rationale.constraints.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="md:col-span-6 space-y-1">
                          <p className={`text-xs font-mono uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-405'}`}>Accepted Trade-offs & Debt</p>
                          <p className={`text-xs font-sans leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-650'}`}>
                            {record.rationale.tradeOffs}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section 4: OWNER & NEXT STEPS */}
                  {record.ownerNextSteps && (
                    <div className={`p-6 rounded-xl border space-y-4 ${
                      theme === 'dark' ? 'border-zinc-900 bg-zinc-950/40' : 'border-zinc-200 bg-white shadow-sm'
                    }`}>
                      <span className={`text-xs font-mono tracking-widest uppercase block border-b pb-2 ${
                        theme === 'dark' ? 'text-zinc-500 border-zinc-900' : 'text-zinc-400 border-zinc-100'
                      }`}>
                        OWNER & NEXT STEPS
                      </span>
                      <div className="flex flex-col sm:flex-row gap-6">
                        <div className={`p-4 rounded-lg border flex flex-col justify-center sm:w-1/3 ${
                          theme === 'dark' ? 'bg-zinc-900/20 border-zinc-900' : 'bg-zinc-50 border-zinc-200'
                        }`}>
                          <span className={`text-[10px] font-mono uppercase tracking-widest block mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Ownership / Driver</span>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                              <User className={`w-3 h-3 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`} />
                            </div>
                            <p className={`text-xs font-semibold font-mono ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>
                              {record.ownerNextSteps.owner}
                            </p>
                          </div>
                        </div>
                        <div className="sm:w-2/3 space-y-2">
                          <span className={`text-[10px] font-mono uppercase tracking-widest block ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Action Implementation Plan</span>
                          <ul className="space-y-2">
                            {record.ownerNextSteps.nextSteps.map((step, idx) => (
                              <li key={idx} className={`flex gap-2 text-xs leading-relaxed font-sans ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                <span className={`w-4 h-4 rounded border flex items-center justify-center font-mono text-[9px] shrink-0 mt-0.5 ${
                                  theme === 'dark'
                                    ? 'bg-zinc-900 border-zinc-850 text-zinc-500'
                                    : 'bg-white border-zinc-200 text-zinc-400 shadow-xs'
                                }`}>
                                  {idx + 1}
                                </span>
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                  
                </div>

                {/* Back Link bottom */}
                <div className="text-center pt-4">
                  <button
                    onClick={handleReset}
                    className={`text-xs font-mono transition inline-flex items-center gap-1.5 cursor-pointer ${
                      theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-550 hover:text-zinc-900'
                    }`}
                  >
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                    Try Another Decision
                  </button>
                </div>
              </motion.div>
            )}

            {/* Screen 3: Empty State / Error */}
            {screen === "empty" && record && (
              <motion.div
                key="empty-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="max-w-xl mx-auto space-y-8 py-8"
              >
                <div className="text-center space-y-4">
                  <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto ${
                    theme === 'dark'
                      ? 'bg-zinc-900 border-zinc-800/80 text-amber-500 bg-amber-500/10'
                      : 'bg-amber-50 border-amber-200 text-amber-600 shadow-xs'
                  }`}>
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-3xl font-mono font-semibold text-rose-500 tracking-wider">
                      NO_DECISION_FOUND
                    </h2>
                    <p className={`font-sans text-sm leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-650'}`}>
                      No primary decision could be extracted from your input notes. Try pasting notes containing a specific alignment, agreement, or action plan.
                    </p>
                  </div>
                </div>

                {/* Inlined Paste Text Area to try again instantly */}
                <div className={`border rounded-xl p-6 space-y-4 ${
                  theme === 'dark' ? 'border-zinc-900 bg-zinc-950' : 'border-zinc-200 bg-white shadow-md'
                }`}>
                  <p className={`text-xs font-mono uppercase tracking-widest pl-1 ${
                    theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'
                  }`}>
                    Try another text feed
                  </p>
                  
                  <textarea
                    value={notesText}
                    onChange={(e) => {
                      setNotesText(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Paste fresh meeting notes, Slack debate strings, or choice log archives..."
                    className={`w-full min-h-[140px] p-4 rounded-lg text-xs border focus:outline-none transition font-sans ${
                      theme === 'dark'
                        ? 'bg-zinc-900/30 text-zinc-300 border-zinc-800 focus:border-zinc-500 placeholder-zinc-600'
                        : 'bg-zinc-50 text-zinc-800 border-zinc-250 focus:border-indigo-400 placeholder-zinc-450'
                    }`}
                    id="retry-textarea"
                  />
                  
                  <button
                    onClick={() => handleSubmit()}
                    className={`w-full py-3 rounded-lg font-semibold text-xs transition font-sans justify-center flex items-center gap-1.5 cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${
                      theme === 'dark'
                        ? 'bg-zinc-100 hover:bg-white text-zinc-950'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                    }`}
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-zinc-950' : 'text-white'}`} />
                    Retry Generation
                  </button>

                  <div className="text-center">
                    <button
                      onClick={handleReset}
                      className={`text-[10px] font-mono transition ${
                        theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-450 hover:text-zinc-600'
                      }`}
                    >
                      Or go back to default screen
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        )}

      </main>

    </div>
  );
}
