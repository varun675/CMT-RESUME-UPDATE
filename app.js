const reviewSection = document.getElementById("review-section");
const uploadStatus = document.getElementById("upload-status");
const generateStatus = document.getElementById("generate-status");

const experienceList = document.getElementById("experience-list");
const skillsList = document.getElementById("skills-list");
const experienceTemplate = document.getElementById("experience-template");
const skillTemplate = document.getElementById("skill-template");

const resumeTemplate = Handlebars.compile(RESUME_TEMPLATE_SOURCE);
const LOGO_SRC = "assets/logo.png";
const AI_KEY_STORAGE_KEY = "cmt_anthropic_api_key";

const useAiCheckbox = document.getElementById("use-ai-parsing");
const aiKeyRow = document.getElementById("ai-key-row");
const aiApiKeyInput = document.getElementById("ai-api-key");

const savedApiKey = localStorage.getItem(AI_KEY_STORAGE_KEY);
if (savedApiKey) aiApiKeyInput.value = savedApiKey;

useAiCheckbox.addEventListener("change", () => {
  aiKeyRow.classList.toggle("hidden", !useAiCheckbox.checked);
});

aiApiKeyInput.addEventListener("input", () => {
  localStorage.setItem(AI_KEY_STORAGE_KEY, aiApiKeyInput.value.trim());
});

function setStatus(el, message, type) {
  el.textContent = message;
  el.className = "status" + (type ? " " + type : "");
}

// A parsing step that hangs instead of failing (seen with some file
// formats/libraries) would otherwise leave the UI stuck on "Parsing…"
// forever with no way out. Cap every parsing step so a stuck promise always
// surfaces as an error the user can act on.
function withTimeout(promise, ms, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function checkImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function addExperienceEntry(entry = {}) {
  const node = experienceTemplate.content.cloneNode(true);
  node.querySelector(".exp-role").value = entry.role || "";
  node.querySelector(".exp-employer").value = entry.employer || "";
  node.querySelector(".exp-project").value = entry.project || "";
  node.querySelector(".exp-dates").value = entry.dates || "";
  node.querySelector(".exp-bullets").value = (entry.bullets || []).join("\n");
  node.querySelector(".remove-btn").addEventListener("click", (e) => {
    e.target.closest(".entry").remove();
  });
  experienceList.appendChild(node);
}

function addSkillEntry(entry = {}) {
  const node = skillTemplate.content.cloneNode(true);
  node.querySelector(".skill-category").value = entry.category || "";
  node.querySelector(".skill-items").value = entry.items || "";
  node.querySelector(".remove-btn").addEventListener("click", (e) => {
    e.target.closest(".entry").remove();
  });
  skillsList.appendChild(node);
}

document.getElementById("add-experience").addEventListener("click", () => addExperienceEntry());
document.getElementById("add-skill").addEventListener("click", () => addSkillEntry());

document.getElementById("manual-fill-btn").addEventListener("click", () => {
  document.getElementById("f-name").value = "";
  document.getElementById("f-title").value = "";
  document.getElementById("f-location").value = "";
  document.getElementById("f-phone").value = "";
  document.getElementById("f-email").value = "";
  document.getElementById("f-summary").value = "";
  document.getElementById("f-education").value = "";
  document.getElementById("f-certifications").value = "";
  document.getElementById("f-achievements").value = "";

  experienceList.innerHTML = "";
  addExperienceEntry();

  skillsList.innerHTML = "";
  addSkillEntry();

  setStatus(uploadStatus, "Blank form ready — fill in the fields below.", "success");
  reviewSection.classList.remove("hidden");
  reviewSection.scrollIntoView({ behavior: "smooth" });
});

document.getElementById("parse-btn").addEventListener("click", async () => {
  const fileInput = document.getElementById("resume-file");
  if (!fileInput.files.length) {
    setStatus(uploadStatus, "Choose a PDF or DOCX file first.", "error");
    return;
  }

  const file = fileInput.files[0];
  const useAI = useAiCheckbox.checked;
  const apiKey = aiApiKeyInput.value.trim();

  setStatus(uploadStatus, useAI && apiKey ? "Parsing with Claude…" : "Parsing…", "");
  let fallbackNotice = "";
  try {
    const PARSE_TIMEOUT_MS = 20000;
    const timeoutMsg = "Parsing timed out. Try a different file, or use \"Fill in manually\" instead.";

    let data;
    if (useAI && apiKey) {
      try {
        const text = await withTimeout(extractTextFromFile(file), PARSE_TIMEOUT_MS, timeoutMsg);
        data = await withTimeout(parseResumeWithAI(text, apiKey), PARSE_TIMEOUT_MS, timeoutMsg);
      } catch (aiErr) {
        console.error("AI parsing failed, falling back to heuristic parser:", aiErr);
        fallbackNotice = ` (AI parsing failed: ${aiErr.message} — used basic parsing instead)`;
        data = await withTimeout(parseResumeFile(file), PARSE_TIMEOUT_MS, timeoutMsg);
      }
    } else {
      data = await withTimeout(parseResumeFile(file), PARSE_TIMEOUT_MS, timeoutMsg);
    }

    document.getElementById("f-name").value = data.name || "";
    document.getElementById("f-title").value = data.title || "";
    document.getElementById("f-location").value = data.location || "";
    document.getElementById("f-phone").value = data.phone || "";
    document.getElementById("f-email").value = data.email || "";
    document.getElementById("f-summary").value = data.summary || "";
    document.getElementById("f-education").value = (data.education || []).join("\n");
    document.getElementById("f-certifications").value = (data.certifications || []).join("\n");
    document.getElementById("f-achievements").value = (data.achievements || []).join("\n");

    experienceList.innerHTML = "";
    (data.experience || []).forEach(addExperienceEntry);
    if (!data.experience || !data.experience.length) addExperienceEntry();

    skillsList.innerHTML = "";
    (data.skills || []).forEach(addSkillEntry);
    if (!data.skills || !data.skills.length) addSkillEntry();

    reviewSection.classList.remove("hidden");
    setStatus(uploadStatus, `Parsed. Review the fields below.${fallbackNotice}`, fallbackNotice ? "error" : "success");
    reviewSection.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
    setStatus(uploadStatus, `Failed to parse: ${err.message}`, "error");
  }
});

document.getElementById("generate-btn").addEventListener("click", async () => {
  const resumeData = {
    name: document.getElementById("f-name").value.trim(),
    title: document.getElementById("f-title").value.trim(),
    location: document.getElementById("f-location").value.trim(),
    phone: document.getElementById("f-phone").value.trim(),
    email: document.getElementById("f-email").value.trim(),
    summary: document.getElementById("f-summary").value.trim(),
    education: document.getElementById("f-education").value.split("\n").map((s) => s.trim()).filter(Boolean),
    certifications: document.getElementById("f-certifications").value.split("\n").map((s) => s.trim()).filter(Boolean),
    achievements: document.getElementById("f-achievements").value.split("\n").map((s) => s.trim()).filter(Boolean),
    experience: Array.from(experienceList.querySelectorAll(".entry")).map((entry) => ({
      role: entry.querySelector(".exp-role").value.trim(),
      employer: entry.querySelector(".exp-employer").value.trim(),
      project: entry.querySelector(".exp-project").value.trim(),
      dates: entry.querySelector(".exp-dates").value.trim(),
      bullets: entry.querySelector(".exp-bullets").value.split("\n").map((s) => s.trim()).filter(Boolean),
    })),
    skills: Array.from(skillsList.querySelectorAll(".entry")).map((entry) => ({
      category: entry.querySelector(".skill-category").value.trim(),
      items: entry.querySelector(".skill-items").value.trim(),
    })),
  };

  setStatus(generateStatus, "Rendering…", "");
  try {
    // Client-facing redaction policy: phone, email, surname, and employer
    // names never appear in the generated PDF — only first name, role, and
    // project-level detail.
    const skillRows = resumeData.skills.filter((s) => s && (s.category || s.items));
    const contactLine = resumeData.location || "";
    const displayName = (resumeData.name || "").trim().split(/\s+/)[0] || "";
    const experience = resumeData.experience.map((entry) => ({
      ...entry,
      displayTitle: [entry.role, entry.project].filter(Boolean).join(" — ") || "Confidential Engagement",
    }));
    const includeLogo = document.getElementById("include-logo").checked;
    const logoSrc = includeLogo && (await checkImageExists(LOGO_SRC)) ? LOGO_SRC : null;

    const html = resumeTemplate({ ...resumeData, skillRows, contactLine, displayName, experience, logoSrc, includeLogo });

    const host = document.getElementById("resume-render-host");
    host.innerHTML = html;

    const img = host.querySelector("img.logo");
    if (img && !img.complete) {
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }

    setStatus(generateStatus, "Generating PDF…", "");
    const safeName = (resumeData.name || "resume").replace(/[^a-z0-9]+/gi, "_");

    // html2canvas captures relative to the current scroll position. Clicking
    // "Generate" from partway down this long form leaves the page scrolled,
    // which makes the capture come back blank — reset to the top first.
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const pdfBlob = await html2pdf()
      .set({
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
        // "avoid-all" refuses to slice through *any* block element, so a
        // list that doesn't fully fit on the current page gets pushed whole
        // to the next one — leaving its heading stranded with blank space
        // under it. Plain "css" mode only respects the explicit
        // page-break-inside/after rules in styles.css, which mark just the
        // small units (bullets, job entries, headings) that must stay
        // intact, without dragging whole sections along with them.
        pagebreak: { mode: ["css"] },
      })
      .from(host.firstElementChild)
      .outputPdf("blob");

    host.innerHTML = "";

    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}_CMT.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(generateStatus, "Done — PDF downloaded.", "success");
  } catch (err) {
    console.error(err);
    setStatus(generateStatus, `Failed to generate: ${err.message}`, "error");
  }
});
