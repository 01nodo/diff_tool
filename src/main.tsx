import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App"; // your ladder-viewer.jsx renamed to App.tsx

// ─────────────────────────────────────────────
// Message types sent from extension.ts
// ─────────────────────────────────────────────
type ExtMessage =
  | { type: "load"; xml: string }
  | { type: "diff"; xmlA: string; xmlB: string; refA: string; refB: string };

// ─────────────────────────────────────────────
// Root wrapper — handles VS Code ↔ React bridge
// ─────────────────────────────────────────────
function Root() {
  const [mode,  setMode]  = useState<"view" | "diff">("view");
  const [xml,   setXml]   = useState<string | null>(null);
  const [xmlA,  setXmlA]  = useState<string | null>(null);
  const [xmlB,  setXmlB]  = useState<string | null>(null);
  const [refA,  setRefA]  = useState<string>("");
  const [refB,  setRefB]  = useState<string>("");

  useEffect(() => {
    // Register global handler so the inline <script> in the HTML shell
    // can forward extension messages into React state
    (window as any).__ladderMessage = (msg: ExtMessage) => {
      if (msg.type === "load") {
        setMode("view");
        setXml(msg.xml);
      } else if (msg.type === "diff") {
        setMode("diff");
        setXmlA(msg.xmlA);
        setXmlB(msg.xmlB);
        setRefA(msg.refA);
        setRefB(msg.refB);
      }
    };
  }, []);

  if (mode === "diff") {
    return (
      <App
        initialXml={xmlA ?? ""}
        diffXml={xmlB ?? ""}
        diffRefA={refA}
        diffRefB={refB}
      />
    );
  }

  return <App initialXml={xml ?? ""} />;
}

// Mount
const container = document.getElementById("root")!;
createRoot(container).render(<Root />);
