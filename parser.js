// Client-side resume parser. Runs entirely in the browser — nothing is
// uploaded anywhere. Text extraction uses pdf.js (PDF) and mammoth (DOCX);
// the section-splitting/regex logic below is plain JS with no dependencies.

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const SECTION_PATTERNS = [
  { key: "summary", re: /^(executive\s+summary|professional\s+summary|summary|profile)\s*:?$/i },
  { key: "experience", re: /^(experience|work\s+experience|professional\s+experience|employment\s+history)\s*:?$/i },
  { key: "education", re: /^education\s*:?$/i },
  { key: "certifications", re: /^(certifications?|licenses?)\s*:?$/i },
  { key: "skills", re: /^(technical\s+skills|core\s+skills|core\s+competencies|skills)\s*:?$/i },
  { key: "achievements", re: /^(key\s+achievements|achievements|accomplishments)\s*:?$/i },
];

const MONTH_YEAR = "[A-Za-z]{3,9}\\.?\\s?\\d{4}";
const YEAR_ONLY = "\\d{4}";
const END_TERM = "until now|present|current";
const INLINE_DATE_RE = new RegExp(
  `\\((${MONTH_YEAR}|${YEAR_ONLY})\\s*[-–—]\\s*(${END_TERM}|${MONTH_YEAR}|${YEAR_ONLY})\\)`,
  "i"
);
const STANDALONE_DATE_RE = new RegExp(
  `^(${MONTH_YEAR}|${YEAR_ONLY})\\s*[-–—]\\s*(${END_TERM}|${MONTH_YEAR}|${YEAR_ONLY})$`,
  "i"
);
const BULLET_RE = /^[•‣◦⁃∙\-\*]\s*/;

async function extractTextFromFile(file) {
  const lower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = {};
      content.items.forEach((item) => {
        const y = Math.round(item.transform[5]);
        if (!lines[y]) lines[y] = [];
        lines[y].push(item.str);
      });
      const sortedY = Object.keys(lines).sort((a, b) => b - a);
      text += sortedY.map((y) => lines[y].join(" ")).join("\n") + "\n";
    }
    return text;
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  if (file.type === "application/msword" || lower.endsWith(".doc")) {
    // Legacy binary .doc (pre-2007 Word format, OLE compound-file based) is
    // a much more involved format than DOCX's ZIP+XML, and every pure-JS
    // library for it assumes a full Node.js runtime. Loading one through a
    // browser shim (esm.sh) was tried and tested: it hung indefinitely deep
    // inside the library's own OLE parser in a real browser (a Node
    // stream/event-loop assumption the shim can't faithfully emulate), so
    // it isn't a safe base to build on. Fail fast with a clear next step
    // instead of leaving the UI stuck on "Parsing…" forever.
    throw new Error(
      "Old .doc files (pre-2007 Word format) can't be parsed in the browser. Please re-save it as .docx in Word (File > Save As > Word Document (.docx)) and re-upload, or use \"Fill in manually\" instead."
    );
  }

  return new TextDecoder("utf-8").decode(buffer);
}

function splitSections(lines) {
  const sections = {};
  let current = "header";
  sections[current] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = SECTION_PATTERNS.find((p) => p.re.test(line));
    if (match) {
      current = match.key;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line);
  }
  return sections;
}

function parseHeader(headerLines) {
  const name = headerLines[0] || "";
  const title = headerLines[1] || "";
  const contactLine = headerLines.slice(2).join(" ");

  const emailMatch = contactLine.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneMatch = contactLine.match(/(\+?\d[\d\s\-()]{7,}\d)/);
  const email = emailMatch ? emailMatch[0].trim() : "";
  const phone = phoneMatch ? phoneMatch[0].trim() : "";

  let location = contactLine;
  if (email) location = location.replace(email, "");
  if (phone) location = location.replace(phone, "");
  location = location
    .replace(/[|✉■●•]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { name, title, email, phone, location };
}

// Splits a raw job-header string into a displayable role and an internal-only
// employer name. "Role | Employer | Location" -> role="Role", employer="Employer, Location".
// A header with no "|" separator (e.g. "Acme Corp, Germany") has no distinct role,
// so the whole string is treated as the employer (hidden from client-facing output).
function splitHeaderLine(headerText) {
  const segments = headerText
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    return { role: segments[0], employer: segments.slice(1).join(", ") };
  }
  return { role: "", employer: headerText };
}

function parseExperience(lines) {
  const entries = [];
  let current = null;
  let pendingHeader = "";

  const finishCurrent = () => {
    if (current) entries.push(current);
    current = null;
  };

  const startEntry = (headerText, dates) => {
    finishCurrent();
    current = {
      ...splitHeaderLine(headerText),
      project: "",
      dates,
      bullets: [],
    };
    pendingHeader = "";
  };

  for (const line of lines) {
    const inlineMatch = line.match(INLINE_DATE_RE);
    if (inlineMatch) {
      // Header and date are usually on the same line ("Role | Employer (Mar
      // 2022 - Present)"), but DOCX extraction puts each paragraph on its
      // own line, so a resume typed with the date on its own line ends up
      // here with nothing left after stripping the date. Fall back to the
      // header text accumulated from the previous line(s) in that case.
      const headerText =
        line.replace(INLINE_DATE_RE, "").trim().replace(/[-–,]\s*$/, "") || pendingHeader;
      startEntry(headerText, inlineMatch[0].replace(/[()]/g, ""));
    } else if (STANDALONE_DATE_RE.test(line)) {
      startEntry(pendingHeader, line.trim());
    } else if (BULLET_RE.test(line)) {
      if (current) current.bullets.push(line.replace(BULLET_RE, "").trim());
    } else {
      pendingHeader = pendingHeader ? `${pendingHeader} ${line}` : line;
    }
  }
  finishCurrent();
  return entries;
}

function parseSkills(lines) {
  const categories = [];
  let currentCategory = null;
  let currentItems = [];

  const flush = () => {
    if (currentCategory) {
      categories.push({ category: currentCategory, items: currentItems.join(" ").trim() });
    }
  };

  for (const line of lines) {
    const colonMatch = line.match(/^([A-Za-z0-9 &\/\-]{2,40}):\s*(.*)$/);
    if (colonMatch) {
      flush();
      currentCategory = colonMatch[1].trim();
      currentItems = [colonMatch[2].trim()].filter(Boolean);
    } else if (currentCategory) {
      currentItems.push(line.trim());
    } else {
      currentCategory = "Skills";
      currentItems = [line.trim()];
    }
  }
  flush();
  return categories;
}

// A bullet whose sentence wraps across multiple print lines comes back from
// PDF/DOCX text extraction as several separate lines, only the first of
// which has the bullet marker. Once bullets are in use for this section, a
// following line with no marker is a continuation of the previous bullet,
// not a new one — otherwise "Delivered X using Python, FastAPI, Django, /
// React, and AWS." becomes two bogus bullets. Sections with no bullet
// markers at all (e.g. one-per-line Education/Certifications) are
// unaffected: every line still becomes its own entry.
function parseListSection(lines) {
  const items = [];
  let usingBullets = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (BULLET_RE.test(line)) {
      usingBullets = true;
      items.push(line.replace(BULLET_RE, "").trim());
    } else if (usingBullets && items.length) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    } else {
      items.push(line);
    }
  }
  return items.filter(Boolean);
}

function parseResumeText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const sections = splitSections(lines);

  const { name, title, email, phone, location } = parseHeader(sections.header || []);

  return {
    name,
    title,
    email,
    phone,
    location,
    summary: (sections.summary || []).join(" ").trim(),
    experience: parseExperience(sections.experience || []),
    education: parseListSection(sections.education || []),
    certifications: parseListSection(sections.certifications || []),
    skills: parseSkills(sections.skills || []),
    achievements: parseListSection(sections.achievements || []),
  };
}

async function parseResumeFile(file) {
  const text = await extractTextFromFile(file);
  return parseResumeText(text);
}
