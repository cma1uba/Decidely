import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import mammoth from "mammoth";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Generous payload limits for base64 file payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Allow Novus analytics CDN domains
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.pendo.io https://app.pendo.io",
      "connect-src 'self' https://cdn.pendo.io https://app.pendo.io https://data.pendo.io https://pendo-static-5942694654894080.storage.googleapis.com",
      "img-src 'self' data: https://app.pendo.io",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
    ].join("; ")
  );
  next();
});

// Initialize GoogleGenAI with appropriate telemetry and key checking
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Check key availability on startup
if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY environment variable is missing.");
}

// REST endpoint for generating structured decision records
app.post("/api/generate", async (req: express.Request, res: express.Response) => {
  try {
    const { notesText, filePayload } = req.body;

    let combinedText = notesText || "";
    let pdfDataPart: any = null;

    if (filePayload) {
      const { base64, name, type } = filePayload;
      if (type === "application/pdf" || name.endsWith(".pdf")) {
        pdfDataPart = {
          inlineData: {
            mimeType: "application/pdf",
            data: base64,
          },
        };
      } else if (name.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const docBuffer = Buffer.from(base64, "base64");
        const parseResult = await mammoth.extractRawText({ buffer: docBuffer });
        combinedText += `\n\n=== EXTRACTED FROM UPLOADED DOCX FILE (${name}) ===\n${parseResult.value}`;
      } else if (type === "text/plain" || name.endsWith(".txt")) {
        const txtContent = Buffer.from(base64, "base64").toString("utf8");
        combinedText += `\n\n=== EXTRACTED FROM UPLOADED TEXT FILE (${name}) ===\n${txtContent}`;
      }
    }

    if (!combinedText.trim() && !pdfDataPart) {
      return res.status(400).json({ error: "Please enter some meeting notes or upload a file (.txt, .pdf, or .docx) to analyze." });
    }

    const systemPrompt = `You are a product management assistant that extracts and structures decision records from messy meeting notes.

Given the input, identify the primary decision that was made.

If no clear decision is present in the input, you MUST respond ONLY with the exact plain text: NO_DECISION_FOUND

If a coherent decision exists, respond with a valid JSON object matching exactly this schema and structure:
{
  "decisionFound": true,
  "decision": "One clear sentence stating what was decided.",
  "optionsConsidered": [
    {
      "optionName": "Name of option",
      "weighedWhy": "Brief explanation of pros/cons or why it was weighed"
    }
  ],
  "rationale": {
    "reasoning": "Why this option was chosen. 2-4 sentences.",
    "constraints": ["Constraint 1", "Constraint 2"],
    "tradeOffs": "Accepted trade-offs or technical debt description"
  },
  "ownerNextSteps": {
    "owner": "Who owns this decision. If not clear from the notes, you MUST use exactly 'Not specified.'",
    "nextSteps": ["Immediate next step 1", "Immediate next step 2"]
  }
}

Under OWNER & NEXT STEPS:
- owner: To identify ownership, analyze in detail the final decision resolution or assignment sentence. The name of the person told to carry out the implementation of the decision is the owner.
  Example: In the sentence "Sarah: Perfect. Dave, please draft the waitlist email sequences. We are locked in!", Sarah mentions Dave to carry out the task, making Dave the owner.
  If the owner is not clear from the notes, you MUST use exactly "Not specified.".
- nextSteps: List the immediate next steps. If not clear from the notes, use the exact default string "Not specified." as the sole element in the array: ["Not specified."].`;

    const contents: any[] = [];
    if (pdfDataPart) {
      contents.push(pdfDataPart);
    }
    if (combinedText.trim()) {
      contents.push({ text: `Input Notes/Context:\n\n${combinedText}` });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    const resultText = response.text?.trim() || "";

    if (resultText === "NO_DECISION_FOUND" || resultText.includes("NO_DECISION_FOUND")) {
      res.setHeader("Content-Type", "text/plain");
      return res.send("NO_DECISION_FOUND");
    }

    try {
      let jsonStr = resultText;
      const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/) || resultText.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      const parsedResult = JSON.parse(jsonStr);

      if (parsedResult.decisionFound === false || parsedResult.friendlyNoDecisionMessage === "NO_DECISION_FOUND") {
        res.setHeader("Content-Type", "text/plain");
        return res.send("NO_DECISION_FOUND");
      }

      res.setHeader("Content-Type", "application/json");
      return res.json(parsedResult);
    } catch (e) {
      console.error("JSON parsing failed, returning NO_DECISION_FOUND fallback:", e);
      res.setHeader("Content-Type", "text/plain");
      return res.send("NO_DECISION_FOUND");
    }
  } catch (error: any) {
    console.error("Error generating decision record:", error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

// Vite server middleware setup for development, index.html fallback for production
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
