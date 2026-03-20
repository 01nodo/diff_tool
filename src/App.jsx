import { useState, useCallback, useRef, useEffect } from "react";

// Observe a container div and return its pixel width
function useContainerWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(ref.current);
    setWidth(ref.current.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// ═══════════════════════════════════════════════════
// STUDIO 5000 COLOR PALETTE
// ═══════════════════════════════════════════════════
const S = {
  // backgrounds
  bg:         "#f0f0f0",   // main canvas
  rungBg:     "#ffffff",   // each rung
  rungStripe: "#f9f9f9",   // alternating
  gutterBg:   "#e8e8e8",   // rung number gutter
  commentBg:  "#fffde7",   // comment strip
  appBg:      "#2b2b2b",   // app chrome
  sidebarBg:  "#3c3c3c",
  sidebarItem:"#4a4a4a",
  sidebarAct: "#0078d4",

  // ladder elements
  rail:       "#1a1a1a",   // power rail
  wire:       "#1a1a1a",   // wires
  wireDim:    "#aaaaaa",   // gap between contact bars
  ct:         "#1a1a1a",   // contact bars
  coil:       "#1a1a1a",   // coil arcs
  junctionDot:"#1a1a1a",

  // function blocks
  fbBorder:   "#444444",
  fbHdrBg:    "#dde8f0",   // light blue header (std)
  fbHdrText:  "#003366",
  fbBody:     "#ffffff",
  fbParam:    "#222222",
  fbParamBg:  "#f5f8fa",

  // AOI blocks — blue like Studio 5000 AOI highlight
  aoiBorder:  "#0057a8",
  aoiHdrBg:   "#0078d4",
  aoiHdrText: "#ffffff",
  aoiBody:    "#e8f2fb",
  aoiParam:   "#003366",

  // text
  tagAbove:   "#000000",   // tag name above symbol
  tagBelow:   "#555555",   // address/desc below
  opText:     "#666666",   // small instruction label
  commentTxt: "#5a5a00",
  rungNum:    "#444444",
  gutterLine: "#cccccc",
};

// ═══════════════════════════════════════════════════
// LAYOUT CONSTANTS  (pixels)
// ═══════════════════════════════════════════════════
const W_CT     = 56;    // contact width
const W_COIL   = 72;    // coil width
const W_NOP    = 44;
const FB_MIN_W = 148;
const FB_HDR_H = 19;
const FB_ROW_H = 14;
const FB_PAD_B = 6;

const H_RUNG   = 70;
const BR_RAIL  = 12;
const BR_GAP   = 8;
const L_RAIL_W = 5;
const PAD_L    = 14;
const PAD_R    = 20;    // extra right padding so last coil tag clears the rail
const VT       = 38;    // more headroom for tag labels above wire
const VB       = 26;

// ═══════════════════════════════════════════════════
// INSTRUCTION CLASSIFICATION
// ═══════════════════════════════════════════════════
const CONTACTS = new Set(["XIC","XIO","ONS","OSR","OSF","OSRI","OSFI"]);
const COILS    = new Set(["OTE","OTL","OTU","OTD","OTI"]);
const STD_SET  = new Set([
  "TON","TOF","RTO","CTU","CTD","CTUD","RES",
  "MOV","MOVE","MVM","COP","CPS","CLR","FLL",
  "ADD","SUB","MUL","DIV","MOD","NEG","ABS","SQRT",
  "AND","OR","XOR","NOT",
  "EQU","NEQ","LES","LEQ","GRT","GEQ","LIM","MEQ",
  "EQ","NE","GT","LT","GE","LE","CPT","SCP","SCL","RCP",
  "JSR","RET","JMP","LBL","TND","AFI","NOP",
  "MSG","GSV","SSV","IOT","IOD",
  "SQI","SQO","SQL","BSL","BSR","FFL","FFU","LFL","LFU",
  "PID","PIDE","ALM","ALMA","ALMD","FAL","FSC","FBC","DDT","DTR",
  "SIN","COS","TAN","ASN","ACS","ATN","LN","LOG","XPY",
  "BTD","DTB","DCD","ENC","PRI","ONS","OSR","OSF",
  "RAD","DEG","MOVE",
]);

const isCt   = op => CONTACTS.has(op.toUpperCase());
const isCoil = op => COILS.has(op.toUpperCase());
const isNOP  = op => op.toUpperCase() === "NOP";
const isAOI  = op => !isCt(op) && !isCoil(op) && !isNOP(op) && !STD_SET.has(op.toUpperCase());

// ═══════════════════════════════════════════════════
// LAYOUT ENGINE
// ═══════════════════════════════════════════════════
function fbW(params) {
  const mx = params.reduce((m,p) => Math.max(m, p.length), 4);
  return Math.max(FB_MIN_W, mx * 6.4 + 26);
}
function fbH(params) {
  return FB_HDR_H + Math.max(1, params.length) * FB_ROW_H + FB_PAD_B;
}

function elW(el) {
  if (!el) return W_CT;
  if (el.type === "branch") {
    const mw = el.paths.length ? Math.max(...el.paths.map(pathW)) : W_CT;
    return mw + BR_RAIL * 2 + 6;
  }
  const op = el.op || "";
  if (isCt(op) || isCoil(op)) return W_CT;
  if (isNOP(op)) return W_NOP;
  return fbW(el.params || []);
}
function pathW(path) {
  return (!path || !path.length) ? W_CT : path.reduce((s,e) => s + elW(e), 0);
}
function elH(el) {
  if (!el) return H_RUNG;
  if (el.type === "branch")
    return el.paths.reduce((s,p) => s + pathH(p), 0) + BR_GAP * (el.paths.length - 1);
  const op = el.op || "";
  if (isCt(op) || isCoil(op) || isNOP(op)) return H_RUNG;
  return Math.max(H_RUNG, fbH(el.params || []));
}
function pathH(path) {
  return (!path || !path.length) ? H_RUNG : Math.max(...path.map(elH));
}
function layoutX(els, sx) {
  const xs = []; let cx = sx;
  els.forEach(e => { xs.push(cx); cx += elW(e); });
  return xs;
}

// ═══════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════
function tokenize(raw) {
  const out = [];
  const re = /\b(BST|NXB|BND)\b|\[|\]|,|([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if      (m[1])         out.push({ t: m[1] });
    else if (m[0]==="[")   out.push({ t:"LB" });
    else if (m[0]==="]")   out.push({ t:"RB" });
    else if (m[0]===",")   out.push({ t:"CM" });
    else {
      const params = m[3] ? m[3].split(",").map(s=>s.trim()).filter(Boolean) : [];
      out.push({ t:"I", op:m[2], params });
    }
  }
  return out;
}

function parseRung(text) {
  if (!text) return [];
  const toks = tokenize(text.replace(/\s+/g," ").replace(/;$/,"").trim());
  let pos = 0;

  function els() {
    const out = [];
    while (pos < toks.length) {
      const tk = toks[pos]; if (!tk) break;
      if      (tk.t==="BST") { pos++; out.push(bst()); }
      else if (tk.t==="LB")  { pos++; out.push(bracket()); }
      else if (tk.t==="I")   { out.push({ type:"instruction", op:tk.op, params:tk.params }); pos++; }
      else break;
    }
    return out;
  }
  function bst() {
    const paths = [[]];
    while (pos < toks.length) {
      const tk = toks[pos];
      if (!tk || tk.t==="BND") { pos++; break; }
      else if (tk.t==="NXB") { pos++; paths.push([]); }
      else if (tk.t==="BST") { pos++; paths[paths.length-1].push(bst()); }
      else if (tk.t==="LB")  { pos++; paths[paths.length-1].push(bracket()); }
      else if (tk.t==="I")   { paths[paths.length-1].push({ type:"instruction", op:tk.op, params:tk.params }); pos++; }
      else break;
    }
    return { type:"branch", paths };
  }
  function bracket() {
    const paths = [[]];
    while (pos < toks.length) {
      const tk = toks[pos];
      if (!tk || tk.t==="RB") { pos++; break; }
      else if (tk.t==="CM")  { pos++; paths.push([]); }
      else if (tk.t==="BST") { pos++; paths[paths.length-1].push(bst()); }
      else if (tk.t==="LB")  { pos++; paths[paths.length-1].push(bracket()); }
      else if (tk.t==="I")   { paths[paths.length-1].push({ type:"instruction", op:tk.op, params:tk.params }); pos++; }
      else break;
    }
    return { type:"branch", paths };
  }
  return els();
}

// ═══════════════════════════════════════════════════
// L5X PARSER
// ═══════════════════════════════════════════════════
function parseL5X(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    const groups = [];

    function extract(parentEl, groupName, kind) {
      const routines = [];
      parentEl.querySelectorAll(":scope > Routines > Routine").forEach(re => {
        if (re.getAttribute("Type") !== "RLL") return;
        const rname = re.getAttribute("Name") || "Routine";
        const rungs = [];
        re.querySelectorAll("Rung").forEach(rungEl => {
          const num    = parseInt(rungEl.getAttribute("Number")??"0", 10);
          const text   = rungEl.querySelector("Text")?.textContent?.trim() || "";
          const comment= rungEl.querySelector("Comment")?.textContent?.trim() || "";
          if (text) rungs.push({ num, comment, text, ast: parseRung(text) });
        });
        if (rungs.length) routines.push({ name: rname, rungs });
      });
      if (routines.length) groups.push({ name: groupName, kind, routines });
    }

    doc.querySelectorAll("AddOnInstructionDefinition").forEach(el =>
      extract(el, el.getAttribute("Name")||"AOI", "aoi"));

    let progs = [...doc.querySelectorAll("Programs > Program")];
    if (!progs.length) progs = [...doc.querySelectorAll("Program")];
    progs.forEach(el => extract(el, el.getAttribute("Name")||"Program", "program"));

    return groups.length ? groups : null;
  } catch(e) { console.error(e); return null; }
}

// ═══════════════════════════════════════════════════
// TAG TRUNCATION
// ═══════════════════════════════════════════════════
function trunc(tag, max=20) {
  if (!tag || tag.length<=max) return tag||"";
  const dot = tag.lastIndexOf(".");
  if (dot>0 && tag.length-dot<13)
    return tag.slice(0, max-(tag.length-dot)-1)+"…"+tag.slice(dot);
  return tag.slice(0,max-1)+"…";
}

// ═══════════════════════════════════════════════════
// ── SVG COMPONENTS  (Studio 5000 style) ──
// ═══════════════════════════════════════════════════

// Horizontal wire segment
function Wire({ x1, y1, x2, y2 }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={S.wire} strokeWidth={1.5}/>;
}

// Contact  | |  or  |/|
function Contact({ op, params, x, wy }) {
  const UP  = op.toUpperCase();
  const cx  = x + W_CT / 2;
  const BAR = 11;    // half-height of contact bars
  const GAP = 10;    // wire stub length before bar
  const nc  = UP === "XIO";
  const clipId = `ct-${Math.round(x)}-${Math.round(wy)}`;

  // ~10 chars fit inside 56px at font 9.5px
  const tagStr = trunc(params[0]||"", 11);

  return (
    <g>
      <clipPath id={clipId}>
        <rect x={x} y={wy-BAR-18} width={W_CT} height={BAR+18+BAR+16}/>
      </clipPath>
      {/* left stub */}
      <Wire x1={x}         y1={wy} x2={x+GAP}       y2={wy}/>
      {/* right stub */}
      <Wire x1={x+W_CT-GAP} y1={wy} x2={x+W_CT}    y2={wy}/>
      {/* dim gap between bars */}
      <line x1={x+GAP} y1={wy} x2={x+W_CT-GAP} y2={wy}
            stroke={S.wireDim} strokeWidth={1} strokeDasharray="2,2"/>
      {/* left bar */}
      <line x1={x+GAP}       y1={wy-BAR} x2={x+GAP}       y2={wy+BAR}
            stroke={S.ct} strokeWidth={2.5}/>
      {/* right bar */}
      <line x1={x+W_CT-GAP}  y1={wy-BAR} x2={x+W_CT-GAP}  y2={wy+BAR}
            stroke={S.ct} strokeWidth={2.5}/>
      {/* NC slash */}
      {nc && (
        <line x1={x+GAP+4} y1={wy+9} x2={x+W_CT-GAP-4} y2={wy-9}
              stroke={S.ct} strokeWidth={1.5}/>
      )}
      {/* Tag name ABOVE — clipped to element width */}
      <text x={cx} y={wy-BAR-6}
            textAnchor="middle" fontSize={9.5} fontFamily="Arial,sans-serif"
            fill={S.tagAbove} fontWeight="600" clipPath={`url(#${clipId})`}>
        {tagStr}
      </text>
      {/* Instruction mnemonic BELOW */}
      <text x={cx} y={wy+BAR+13}
            textAnchor="middle" fontSize={8} fontFamily="Arial,sans-serif"
            fill={S.opText}>
        {UP}
      </text>
    </g>
  );
}

// Coil — single ellipse, letter inside, exactly like Studio 5000
function Coil({ op, params, x, wy }) {
  const UP  = op.toUpperCase();
  const cx  = x + W_COIL / 2;
  const RX  = 13;
  const RY  = 13;
  const mk  = UP==="OTL" ? "L" : UP==="OTU" ? "U" : null;
  const clipId = `cl-${Math.round(x)}-${Math.round(wy)}`;
  const tagStr = trunc(params[0]||"", 13);

  return (
    <g>
      <clipPath id={clipId}>
        <rect x={x} y={wy-RY-20} width={W_COIL} height={RY+20+RY+18}/>
      </clipPath>
      <Wire x1={x}      y1={wy} x2={cx-RX}    y2={wy}/>
      <Wire x1={cx+RX}  y1={wy} x2={x+W_COIL} y2={wy}/>
      <ellipse cx={cx} cy={wy} rx={RX} ry={RY}
               fill="none" stroke={S.coil} strokeWidth={2}/>
      {mk && (
        <text x={cx} y={wy+5}
              textAnchor="middle" fontSize={12} fontFamily="Arial,sans-serif"
              fill={S.coil} fontWeight="bold">{mk}</text>
      )}
      <text x={cx} y={wy-RY-6}
            textAnchor="middle" fontSize={9.5} fontFamily="Arial,sans-serif"
            fill={S.tagAbove} fontWeight="600" clipPath={`url(#${clipId})`}>
        {tagStr}
      </text>
      <text x={cx} y={wy+RY+13}
            textAnchor="middle" fontSize={8} fontFamily="Arial,sans-serif"
            fill={S.opText}>
        {UP}
      </text>
    </g>
  );
}

// NOP
function NopEl({ x, wy }) {
  return (
    <g>
      <Wire x1={x} y1={wy} x2={x+W_NOP} y2={wy}/>
      <text x={x+W_NOP/2} y={wy+4}
            textAnchor="middle" fontSize={9} fontFamily="Arial,sans-serif"
            fill="#999">NOP</text>
    </g>
  );
}

// Function block  [ INSTR  / param1 / param2 / ... ]
function FBEl({ op, params, x, wy, aoi }) {
  const w   = fbW(params);
  const h   = fbH(params);
  const top = wy - h/2;
  const bdr = aoi ? S.aoiBorder  : S.fbBorder;
  const hBg = aoi ? S.aoiHdrBg   : S.fbHdrBg;
  const hTx = aoi ? S.aoiHdrText : S.fbHdrText;
  const bBg = aoi ? S.aoiBody    : S.fbBody;
  const pTx = aoi ? S.aoiParam   : S.fbParam;
  const charW = Math.floor((w - 18) / 6);

  return (
    <g>
      {/* entry/exit wires */}
      <Wire x1={x}     y1={wy} x2={x+6}   y2={wy}/>
      <Wire x1={x+w-6} y1={wy} x2={x+w}   y2={wy}/>

      {/* body */}
      <rect x={x+6} y={top} width={w-12} height={h}
            fill={bBg} stroke={bdr} strokeWidth={1.5} rx={1}/>

      {/* header */}
      <rect x={x+6} y={top} width={w-12} height={FB_HDR_H}
            fill={hBg} rx={1}/>
      {/* cover bottom-radius of header */}
      <rect x={x+6} y={top+FB_HDR_H-3} width={w-12} height={3} fill={hBg}/>
      <line x1={x+6} y1={top+FB_HDR_H} x2={x+w-6} y2={top+FB_HDR_H}
            stroke={bdr} strokeWidth={1}/>

      {/* instruction name */}
      <text x={x+w/2} y={top+FB_HDR_H-5}
            textAnchor="middle" fontSize={11} fontFamily="Arial,sans-serif"
            fontWeight="bold" fill={hTx}>
        {op}
      </text>

      {/* params */}
      {params.map((p,i) => (
        <text key={i}
              x={x+12} y={top+FB_HDR_H+4+i*FB_ROW_H+FB_ROW_H*0.72}
              fontSize={9} fontFamily="Arial,sans-serif" fill={pTx}>
          {trunc(p, charW)}
        </text>
      ))}
    </g>
  );
}

// Branch group with vertical rails and parallel paths
function BranchEl({ branch, x, wy }) {
  const totalW = elW(branch);
  const railL  = x + BR_RAIL + 3;
  const railR  = x + totalW - BR_RAIL - 3;
  const inner  = railR - railL;

  const phs    = branch.paths.map(p => pathH(p));
  const totalH = phs.reduce((s,h)=>s+h,0) + BR_GAP*(branch.paths.length-1);

  let py = wy - totalH/2;
  const pwys = phs.map(ph => { const mid=py+ph/2; py+=ph+BR_GAP; return mid; });

  const topY = pwys[0];
  const botY = pwys[pwys.length-1];

  return (
    <g>
      {/* entry / exit stubs */}
      <Wire x1={x}     y1={wy} x2={railL}    y2={wy}/>
      <Wire x1={railR} y1={wy} x2={x+totalW} y2={wy}/>

      {/* left vertical rail */}
      <line x1={railL} y1={topY} x2={railL} y2={botY}
            stroke={S.wire} strokeWidth={1.5}/>
      {/* right vertical rail */}
      <line x1={railR} y1={topY} x2={railR} y2={botY}
            stroke={S.wire} strokeWidth={1.5}/>

      {/* junction dots */}
      {pwys.map((pwy,pi) => (
        <g key={pi}>
          <circle cx={railL} cy={pwy} r={2.5} fill={S.junctionDot}/>
          <circle cx={railR} cy={pwy} r={2.5} fill={S.junctionDot}/>
        </g>
      ))}

      {/* each path */}
      {branch.paths.map((path, pi) => {
        const pwy = pwys[pi];
        const pw  = pathW(path);
        return (
          <g key={pi}>
            <Elements elements={path} startX={railL} wy={pwy}/>
            {pw < inner && (
              <Wire x1={railL+pw} y1={pwy} x2={railR} y2={pwy}/>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Elements({ elements, startX, wy }) {
  const xs = layoutX(elements, startX);
  return (
    <>
      {elements.map((el,i) => {
        const x = xs[i];
        if (el.type==="instruction") {
          const op = el.op||"";
          if (isCt(op))   return <Contact key={i} op={op} params={el.params} x={x} wy={wy}/>;
          if (isCoil(op)) return <Coil    key={i} op={op} params={el.params} x={x} wy={wy}/>;
          if (isNOP(op))  return <NopEl   key={i} x={x} wy={wy}/>;
          return <FBEl key={i} op={op} params={el.params} x={x} wy={wy} aoi={isAOI(op)}/>;
        }
        if (el.type==="branch") return <BranchEl key={i} branch={el} x={x} wy={wy}/>;
        return null;
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════
// SPLIT CONDITIONS vs OUTPUTS
// In Studio 5000, trailing coils sit at the RIGHT rail.
// We peel off any trailing top-level coil instructions.
// ═══════════════════════════════════════════════════
function splitOutputs(ast) {
  let splitAt = ast.length;
  for (let i = ast.length - 1; i >= 0; i--) {
    const el = ast[i];
    if (el.type === "instruction" && isCoil(el.op)) {
      splitAt = i;
    } else {
      break;
    }
  }
  return {
    conditions: ast.slice(0, splitAt),
    outputs:    ast.slice(splitAt),
  };
}

// ═══════════════════════════════════════════════════
// RUNG  (full SVG row)
// ═══════════════════════════════════════════════════
function RungSVG({ rung, index, containerW }) {
  const ast = rung.ast || [];
  const { conditions, outputs } = splitOutputs(ast);

  const condW = conditions.reduce((s,el) => s+elW(el), 0);
  const outW  = outputs.reduce((s,el)    => s+elW(el), 0);
  const GUTTER = 36;
  const RAILS  = L_RAIL_W * 2;

  // Use container width when available, fall back to min
  const minSvgW = GUTTER + RAILS + PAD_L + condW + 80 + outW + PAD_R;
  const svgW    = Math.max(containerW || 800, minSvgW);
  const innerW  = svgW - GUTTER - RAILS;

  const maxH  = ast.length ? Math.max(...ast.map(elH)) : H_RUNG;
  const svgH  = VT + maxH + VB;
  const wy    = VT + maxH / 2;

  const wireX0  = GUTTER + L_RAIL_W;           // wire starts after left rail
  const wireX1  = GUTTER + L_RAIL_W + innerW;  // wire ends at right rail
  const condX0  = wireX0 + PAD_L;              // conditions start
  const condX1  = condX0 + condW;              // conditions end
  const outX1   = wireX1 - PAD_R;              // outputs end (flush right)
  const outX0   = outX1  - outW;               // outputs start
  const rowBg   = index % 2 === 0 ? S.rungBg : S.rungStripe;

  return (
    <svg width={svgW} height={svgH}
         style={{ display:"block", overflow:"visible", background:rowBg }}>

      {/* Gutter */}
      <rect x={0} y={0} width={GUTTER} height={svgH} fill={S.gutterBg}/>
      <line x1={GUTTER} y1={0} x2={GUTTER} y2={svgH}
            stroke={S.gutterLine} strokeWidth={1}/>
      <text x={GUTTER/2} y={wy+4} textAnchor="middle"
            fontSize={11} fontFamily="Arial,sans-serif"
            fill={S.rungNum} fontWeight="bold">
        {rung.num}
      </text>

      {/* Left rail */}
      <rect x={GUTTER}   y={VT-4} width={L_RAIL_W} height={maxH+8} fill={S.rail}/>
      {/* Right rail */}
      <rect x={wireX1}   y={VT-4} width={L_RAIL_W} height={maxH+8} fill={S.rail}/>

      {/* Wire: left stub */}
      <Wire x1={wireX0+L_RAIL_W} y1={wy} x2={condX0} y2={wy}/>
      {/* Wire: gap between conditions and outputs */}
      {condX1 < outX0 && <Wire x1={condX1} y1={wy} x2={outX0} y2={wy}/>}
      {/* Wire: if no outputs, fill to right rail */}
      {outputs.length === 0 && condX1 < wireX1 && (
        <Wire x1={condX1} y1={wy} x2={wireX1} y2={wy}/>
      )}

      {/* Conditions (left side) */}
      <Elements elements={conditions} startX={condX0} wy={wy}/>
      {/* Outputs (right side — anchored to right rail) */}
      <Elements elements={outputs} startX={outX0} wy={wy}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════
// SAMPLE L5X
// ═══════════════════════════════════════════════════
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="36.00">
<Controller Name="Demo_PLC">
<AddOnInstructionDefinitions>
<AddOnInstructionDefinition Name="cPhotoEye">
<Routines>
<Routine Name="Logic" Type="RLL">
<RLLContent>
<Rung Number="0" Type="N">
<Comment><![CDATA[AOI Photo Eye Logic]]></Comment>
<Text><![CDATA[NOP();]]></Text>
</Rung>
<Rung Number="1" Type="N">
<Text><![CDATA[XIC(HMI.Cmd_Bypass)OTE(HMI.Status_Bypassed)OTE(Bypassed);]]></Text>
</Rung>
<Rung Number="2" Type="N">
<Text><![CDATA[[XIC(Conveyor.STS.DeviceResetRequested) XIC(Jammed) XIO(Blocked) ,XIC(Bypassed) ]OTU(Jammed);]]></Text>
</Rung>
<Rung Number="3" Type="N">
<Text><![CDATA[XIO(Comm_Faulted)XIO(InClear)OTE(Blocked)OTE(CTRL.STS.Blocked)OTE(HMI.Status_Blocked);]]></Text>
</Rung>
<Rung Number="4" Type="N">
<Text><![CDATA[GT(Conveyor.STS.CurrentSpeed,0)DIV(60000,Conveyor.STS.CurrentSpeed,FPM_Ratio)MUL(FPM_Ratio,Jam_Length,JamTimer.PRE);]]></Text>
</Rung>
<Rung Number="5" Type="N">
<Text><![CDATA[XIO(Conveyor.STS.MaintMode)[[XIO(Blocked) ,XIO(Conveyor.STS.Running) ] NE(JamTimer.ACC,0) DIV(JamTimer.ACC,FPM_Ratio,CTRL.STS.FPM_Output) CPT(CTRL.STS.FPM_Output,JamTimer.ACC/FPM_Ratio+1) ,XIC(Blocked) [XIC(Conveyor.STS.Running) ,XIC(JamTimer.DN) ] XIO(Bypassed) TON(JamTimer,?,?) ,XIC(JamTimer.DN) OTL(Jammed) ];]]></Text>
</Rung>
<Rung Number="6" Type="N">
<Text><![CDATA[XIC(Jammed)OTL(Conveyor.CMD.Jam)OTE(CTRL.STS.Jammed)OTE(HMI.Fault_Jammed);]]></Text>
</Rung>
<Rung Number="7" Type="N">
<Text><![CDATA[XIC(CoastStopEnable)XIC(Conveyor.STS.Interlock)OTL(Coast_RunEnable);]]></Text>
</Rung>
<Rung Number="8" Type="N">
<Text><![CDATA[[XIC(Blocked) ,XIO(CoastStopEnable) ]OTU(Coast_RunEnable);]]></Text>
</Rung>
<Rung Number="9" Type="N">
<Text><![CDATA[XIC(Coast_RunEnable)OTL(Conveyor.CMD.CoastRunEnable);]]></Text>
</Rung>
</RLLContent>
</Routine>
</Routines>
</AddOnInstructionDefinition>
</AddOnInstructionDefinitions>
<Programs>
<Program Name="MainProgram">
<Routines>
<Routine Name="R050_cPhotoEye" Type="RLL">
<RLLContent>
<Rung Number="0" Type="N">
<Comment><![CDATA[This routine contains AOI Photo Eye control]]></Comment>
<Text><![CDATA[NOP();]]></Text>
</Rung>
<Rung Number="1" Type="N">
<Text><![CDATA[cPhotoEye(PE1_DAF_1.AOI,PE1_DAF_1.HMI,PE1_DAF_1.CTRL,Conv_DAF_1.CTRL,DAF_1_APF1:I.ConnectionFaulted,DAF_1_APF1:I.In_1,On);]]></Text>
</Rung>
<Rung Number="12" Type="N">
<Text><![CDATA[[cPhotoEye(PE1_PS1_1.AOI,PE1_PS1_1.HMI,PE1_PS1_1.CTRL,Conv_PS1_1.CTRL,PS1_1_APF1:I.ConnectionFaulted,PS1_1_APF1:I.IO_0,PE1_PS1_1.AOI.CoastStopEnable) ,XIO(HMI_PS1_1_Direction_Command) OTE(PE1_PS1_1.AOI.CoastStopEnable) ];]]></Text>
</Rung>
<Rung Number="44" Type="N">
<Text><![CDATA[XIC(Data_From_PS1.Data[0].8)OTU(PE1_DAF_1.HMI.Cmd_Bypass)OTU(PE1_DAF_1A.HMI.Cmd_Bypass)OTU(PE1_DAF_2.HMI.Cmd_Bypass)OTU(PE1_DAR_1.HMI.Cmd_Bypass)OTU(PE1_DAR_2.HMI.Cmd_Bypass);]]></Text>
</Rung>
</RLLContent>
</Routine>
</Routines>
</Program>
</Programs>
</Controller>
</RSLogix5000Content>`;

// ═══════════════════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════════════════
export default function App() {
  const [groups,     setGroups]     = useState(() => parseL5X(SAMPLE)||[]);
  const [sel,        setSel]        = useState({ g:0, r:0 });
  const [xmlInput,   setXmlInput]   = useState("");
  const [showPaste,  setShowPaste]  = useState(false);
  const [error,      setError]      = useState(null);
  const fileRef   = useRef();
  const ladderRef = useRef();
  const ladderW   = useContainerWidth(ladderRef);

  const loadXml = useCallback((xml) => {
    const parsed = parseL5X(xml.trim());
    if (parsed) {
      setGroups(parsed); setSel({g:0,r:0});
      setShowPaste(false); setError(null);
    } else {
      setError('No RLL rungs found. Check that the file contains <Routine Type="RLL"> elements.');
    }
  }, []);

  const handleFile = useCallback((e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => loadXml(ev.target.result);
    r.readAsText(f);
    e.target.value = "";
  }, [loadXml]);

  const curGroup   = groups[sel.g];
  const curRoutine = curGroup?.routines[sel.r];
  const totalRungs = groups.reduce((s,g)=>g.routines.reduce((r,rt)=>r+rt.rungs.length,0)+s, 0);

  // Chrome button style
  const chromeBtn = (active=false) => ({
    background: active ? "#555" : "#3c3c3c",
    border: "1px solid #666",
    color: "#ddd",
    padding: "3px 10px",
    borderRadius: 3,
    cursor: "pointer",
    fontSize: 11,
    fontFamily: "Arial,sans-serif",
  });

  return (
    <div style={{
      fontFamily: "Arial,sans-serif",
      background: S.appBg,
      color: "#e0e0e0",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Title bar ── */}
      <div style={{
        background: "#1e1e1e",
        borderBottom: "1px solid #111",
        padding: "5px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}>
        {/* Studio-style icon */}
        <svg width={18} height={18} viewBox="0 0 18 18">
          <rect x={0} y={3} width={4} height={12} fill="#c8c8c8"/>
          <rect x={14} y={3} width={4} height={12} fill="#c8c8c8"/>
          <line x1={4} y1={9} x2={14} y2={9} stroke="#4fc3f7" strokeWidth={2}/>
          <rect x={7} y={6.5} width={4} height={5} fill="none" stroke="#ffd54f" strokeWidth={1.5}/>
        </svg>
        <span style={{ color:"#e0e0e0", fontWeight:"bold", fontSize:13, letterSpacing:"0.02em" }}>
          Logix Ladder Viewer
        </span>
        <span style={{ color:"#555", fontSize:12 }}>—</span>
        <span style={{ color:"#888", fontSize:11 }}>
          {curGroup ? `${curGroup.name} › ${curRoutine?.name}` : "No file loaded"}
        </span>
        <div style={{ flex:1 }}/>
        <input ref={fileRef} type="file" accept=".l5x,.L5X,.xml"
               onChange={handleFile} style={{ display:"none" }}/>
        <button onClick={() => fileRef.current.click()} style={chromeBtn()}>
          📂 Open L5X
        </button>
        <button onClick={() => { setShowPaste(v=>!v); setError(null); }}
                style={chromeBtn(showPaste)}>
          ⎘ Paste XML
        </button>
      </div>

      {/* ── Paste panel ── */}
      {showPaste && (
        <div style={{ background:"#2b2b2b", borderBottom:"1px solid #111", padding:"10px 14px", flexShrink:0 }}>
          <textarea value={xmlInput} onChange={e=>setXmlInput(e.target.value)}
            placeholder='<?xml version="1.0"?><RSLogix5000Content>…'
            style={{
              width:"100%", height:110, background:"#1e1e1e", color:"#ccc",
              border:"1px solid #555", borderRadius:3, padding:7,
              fontFamily:"Consolas,monospace", fontSize:10,
              resize:"vertical", boxSizing:"border-box", outline:"none",
            }}/>
          {error && <div style={{ color:"#ff7070", fontSize:10, marginTop:4 }}>{error}</div>}
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button onClick={() => loadXml(xmlInput)} style={{ ...chromeBtn(), background:"#0078d4", borderColor:"#0063b1", color:"#fff" }}>
              Parse &amp; Load
            </button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: 200,
          background: S.sidebarBg,
          borderRight: "1px solid #222",
          overflowY: "auto",
          flexShrink: 0,
          fontSize: 12,
        }}>
          {/* Sidebar header */}
          <div style={{
            padding: "6px 10px",
            background: "#2b2b2b",
            borderBottom: "1px solid #222",
            fontSize: 10,
            color: "#888",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>Controller Organizer</div>

          {groups.map((group, gi) => (
            <div key={gi}>
              {/* Group row */}
              <div style={{
                padding: "5px 8px",
                display: "flex",
                alignItems: "center",
                gap: 5,
                borderBottom: "1px solid #333",
                background: "#363636",
              }}>
                <span style={{ color: group.kind==="aoi" ? "#a78bfa" : "#4fc3f7", fontSize:10 }}>
                  {group.kind==="aoi" ? "⬡" : "▦"}
                </span>
                <span style={{ color:"#ccc", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                  {group.name}
                </span>
                <span style={{
                  fontSize:8, padding:"1px 4px", borderRadius:2,
                  background: group.kind==="aoi" ? "#3d1f6e" : "#003d6e",
                  color: group.kind==="aoi" ? "#c4b5fd" : "#7dd3fc",
                }}>
                  {group.kind==="aoi" ? "AOI" : "PRG"}
                </span>
              </div>

              {/* Routines */}
              {group.routines.map((rt, ri) => {
                const active = sel.g===gi && sel.r===ri;
                return (
                  <div key={ri}
                    onClick={() => setSel({g:gi, r:ri})}
                    style={{
                      padding: "4px 8px 4px 20px",
                      cursor: "pointer",
                      background: active ? S.sidebarAct : "transparent",
                      color: active ? "#fff" : "#bbb",
                      borderBottom: "1px solid #333",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}>
                    <span style={{ fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {rt.name}
                    </span>
                    <span style={{ fontSize:9, color: active ? "#cce8ff" : "#666", marginLeft:4, flexShrink:0 }}>
                      {rt.rungs.length}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Ladder canvas ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:S.bg }}>

          {/* Routine breadcrumb bar */}
          {curRoutine && (
            <div style={{
              padding: "4px 12px",
              background: "#e0e0e0",
              borderBottom: "2px solid #bbb",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              flexShrink: 0,
            }}>
              <span style={{ color:"#555" }}>Routine:</span>
              <span style={{ color:"#003366", fontWeight:"bold" }}>
                {curGroup?.name}
              </span>
              <span style={{ color:"#999" }}>›</span>
              <span style={{ color:"#003366" }}>{curRoutine.name}</span>
              <span style={{ marginLeft:"auto", color:"#888", fontSize:10 }}>
                {curRoutine.rungs.length} rungs
              </span>
            </div>
          )}

          {/* Rungs */}
          <div ref={ladderRef} style={{ flex:1, overflowY:"auto", overflowX:"auto" }}>
            {curRoutine ? curRoutine.rungs.map((rung, i) => (
              <div key={i} style={{ borderBottom:"1px solid #ddd" }}>
                {/* Comment strip */}
                {rung.comment && (
                  <div style={{
                    background: S.commentBg,
                    borderBottom: "1px solid #e8e090",
                    padding: "2px 14px 2px 48px",
                    fontSize: 10,
                    color: S.commentTxt,
                    fontStyle: "italic",
                  }}>
                    {rung.comment.split("\n")[0]}
                  </div>
                )}
                {/* SVG rung */}
                <RungSVG rung={rung} index={i} containerW={ladderW}/>
              </div>
            )) : (
              <div style={{
                padding: 60,
                textAlign: "center",
                color: "#aaa",
                fontSize: 13,
              }}>
                Open an L5X file or select a routine from the sidebar
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        background: "#1e1e1e",
        borderTop: "1px solid #111",
        padding: "3px 12px",
        display: "flex",
        gap: 16,
        fontSize: 10,
        color: "#666",
        flexShrink: 0,
        alignItems: "center",
      }}>
        <span style={{ color:"#4caf50" }}>● Offline</span>
        <span>{groups.length} group{groups.length!==1?"s":""}</span>
        <span>{groups.reduce((s,g)=>s+g.routines.length,0)} routines</span>
        <span>{totalRungs} rungs</span>
        <span style={{ marginLeft:"auto", color:"#444" }}>
          Logix Ladder Viewer · Rockwell Allen-Bradley L5X · v0.4
        </span>
      </div>
    </div>
  );
}
