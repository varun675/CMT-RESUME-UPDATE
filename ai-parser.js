// Optional AI-assisted resume parsing. Calls the Anthropic API directly from
// the browser using a key the user supplies themselves (stored only in this
// browser's localStorage — see index.html). This is only safe because the
// key never leaves the user's own browser except to Anthropic; it is never
// committed to the repo or sent anywhere else.

const ANTHROPIC_MODEL = "claude-sonnet-5";

const RESUME_EXTRACTION_TOOL = {
  name: "extract_resume",
  description: "Extract structured resume data from raw resume text.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Full name of the candidate" },
      title: { type: "string", description: "Headline / professional title" },
      email: { type: "string" },
      phone: { type: "string" },
      location: { type: "string", description: "City/region, no street address" },
      summary: { type: "string", description: "Professional summary paragraph" },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", description: "Job title only — never the employer name" },
            employer: { type: "string", description: "Company or client name" },
            project: { type: "string", description: "Named project, if the text mentions one; empty string otherwise" },
            dates: { type: "string", description: "e.g. 'Mar 2022 - Present'" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["role", "employer", "dates", "bullets"],
        },
      },
      education: { type: "array", items: { type: "string" } },
      certifications: { type: "array", items: { type: "string" } },
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            items: { type: "string" },
          },
          required: ["category", "items"],
        },
      },
      achievements: { type: "array", items: { type: "string" } },
    },
    required: ["name", "title", "experience", "education", "certifications", "skills", "achievements"],
  },
};

async function parseResumeWithAI(text, apiKey) {
  if (!apiKey) throw new Error("No Anthropic API key set.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      tools: [RESUME_EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "extract_resume" },
      messages: [
        {
          role: "user",
          content: `Extract structured resume data from the following resume text. Use an empty string or empty array for any field that isn't present — do not invent information.\n\n---\n${text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const toolUse = (data.content || []).find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return structured data.");

  const result = toolUse.input;
  return {
    name: result.name || "",
    title: result.title || "",
    email: result.email || "",
    phone: result.phone || "",
    location: result.location || "",
    summary: result.summary || "",
    experience: (result.experience || []).map((e) => ({
      role: e.role || "",
      employer: e.employer || "",
      project: e.project || "",
      dates: e.dates || "",
      bullets: e.bullets || [],
    })),
    education: result.education || [],
    certifications: result.certifications || [],
    skills: (result.skills || []).map((s) => ({ category: s.category || "", items: s.items || "" })),
    achievements: result.achievements || [],
  };
}
