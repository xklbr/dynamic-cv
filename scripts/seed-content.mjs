#!/usr/bin/env node
/**
 * Siembra desde cero el contenido del CV (ES + EN) en Sanity.
 *
 * Contexto: el proyecto Sanity anterior se perdió. El dataset actual solo
 * tiene documentos huérfanos de tipos obsoletos (items, experienceType, links,
 * contactInfo, skills) y ningún documento utilizable de los tipos vigentes.
 * Este script NO toca esos huérfanos: solo opera sobre los tipos vigentes
 * (aboutMe, workExperience, volunteering, education, uiStrings).
 *
 * Fuente (autoritativa, ES y EN de primera mano, sin traducir nada aquí):
 *   los dos PDF finales del CV (texto extraído a cv_es.txt / cv_en.txt).
 *   Los textos van copiados literal de cada PDF.
 *
 * Esquema: se usa la versión del working tree. `workExperience.modality` fue
 * reemplazado por `location` / `locationEs` (texto libre), así que se siembra
 * location/locationEs con el mapeo de scripts/migrate-location.mjs
 * (on-site -> On-site/Presencial, hybrid -> Hybrid/Híbrido,
 * remote -> Remote/Remoto) y nunca `modality`.
 *
 * Idempotente: cada documento se busca por su clave (companyName,
 * institutionOrSchool, organization; los singletons por _type). Si existe se
 * parchea solo lo que cambió; si falta se crea. Correrlo dos veces no
 * duplica nada.
 *
 * Dry-run por defecto: imprime el diff por documento y NO escribe nada.
 * Pasa --commit para escribir de verdad (requiere SANITY_API_WRITE_TOKEN o
 * SANITY_API_TOKEN en .env.local).
 *
 * --self-check valida (sin red) que los payloads construidos estén bien
 * formados: campos requeridos, sin `modality`, todo localizedString con en+es.
 *
 * Uso:
 *   pnpm content:seed                  # dry-run
 *   pnpm content:seed -- --commit
 *   pnpm content:seed -- --self-check
 */

import { createClient } from "@sanity/client";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const COMMIT = process.argv.includes("--commit");
const SELF_CHECK = process.argv.includes("--self-check");

// ---------------------------------------------------------------------------
// Carga de variables de entorno (.env y .env.local, sin dependencias externas)
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  const env = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const envFromDotenv = {
  ...loadEnvFile(path.join(rootDir, ".env")),
  ...loadEnvFile(path.join(rootDir, ".env.local")),
};

function getEnv(key) {
  return process.env[key] ?? envFromDotenv[key] ?? "";
}

const projectId = getEnv("PUBLIC_SANITY_PROJECT_ID");
const dataset = getEnv("PUBLIC_SANITY_DATASET");
const readToken = getEnv("SANITY_API_READ_TOKEN");
const writeToken =
  getEnv("SANITY_API_WRITE_TOKEN") || getEnv("SANITY_API_TOKEN");

// ---------------------------------------------------------------------------
// Utilidades de Portable Text (keys determinísticas: re-correr no genera
// diferencias espurias)
// ---------------------------------------------------------------------------

let keyCounter = 0;
function key(seed) {
  keyCounter += 1;
  return createHash("sha1")
    .update(`${keyCounter}:${seed}`)
    .digest("hex")
    .slice(0, 12);
}

/**
 * Bloque de párrafo/viñeta. `parts` es un string (sin negrita) o un array de
 * { text, strong? } para alternar spans normales y en negrita.
 */
function block(parts, { list = false } = {}) {
  const merged = [];
  for (const p of Array.isArray(parts) ? parts : [{ text: parts }]) {
    const last = merged[merged.length - 1];
    if (last && !!last.strong === !!p.strong) last.text += p.text;
    else merged.push({ ...p });
  }
  const children = merged.map((p) => ({
    _key: key(p.text),
    _type: "span",
    text: p.text,
    marks: p.strong ? ["strong"] : [],
  }));
  return {
    _key: key(children.map((c) => c.text).join("")),
    _type: "block",
    style: "normal",
    markDefs: [],
    ...(list ? { level: 1, listItem: "bullet" } : {}),
    children,
  };
}

function bulletList(items) {
  return items.map((item) => block(item, { list: true }));
}

/** Atajos para armar partes con negrita: t("texto") normal, b("texto") negrita. */
const t = (text) => ({ text });
const b = (text) => ({ text, strong: true });

// ---------------------------------------------------------------------------
// uiStrings (singleton) — todos los campos que declara el schema, en EN y ES
// ---------------------------------------------------------------------------

const uiStringsContent = {
  title: "UI Strings",
  sectionTitles: {
    professionalProfile: {
      en: "Professional profile",
      es: "Perfil profesional",
    },
    skills: { en: "Skills", es: "Habilidades" },
    workExperience: { en: "Work experience", es: "Experiencia laboral" },
    volunteering: { en: "Volunteering", es: "Voluntariado" },
    education: { en: "Education", es: "Educación" },
  },
  present: { en: "Present", es: "Presente" },
};

// ---------------------------------------------------------------------------
// aboutMe (singleton)
// ---------------------------------------------------------------------------

const JOB_TITLE = "Full-Stack Software Engineer";

const aboutMeContent = {
  title: "About Me",
  firstName: "Arturo",
  surname: "Dangond",
  jobTitle: JOB_TITLE,
  jobTitleEs: JOB_TITLE,
  email: "arturo.olivella@gmail.com",
  defaultContactInfo: {
    _type: "object",
    isActive: true,
    phone: "+34610297534",
    city: "Zaragoza",
    cityEs: "Zaragoza",
    country: "Spain",
    countryEs: "España",
  },
  links: [
    {
      _key: key("GitHub"),
      platformName: "github.com/xklbr",
      link: "https://github.com/xklbr",
    },
    {
      _key: key("LinkedIn"),
      platformName: "linkedin.com/in/arturodangond",
      link: "https://www.linkedin.com/in/arturodangond",
    },
  ],

  // Campo `text` plano: no admite negrita. Si el PDF resalta algo en negrita,
  // ese énfasis no puede representarse en un campo de texto plano.
  bioEs:
    "Ingeniero de software Full-Stack con más de 6 años de experiencia en desarrollo web, especializado en TypeScript, React, Next.js, Node.js y NestJS. Experiencia construyendo y evolucionando aplicaciones web modernas, escalables y mantenibles, desde el diseño técnico y la arquitectura hasta la implementación, optimización y despliegue.\n\nExperiencia trabajando en entornos remotos y multidisciplinarios, transformando requisitos de negocio en soluciones técnicas robustas y priorizando calidad, rendimiento, seguridad y mantenibilidad. Experiencia práctica en ingeniería de sistemas agénticos: diseño y desarrollo de agentes que interpretan solicitudes en lenguaje natural y ejecutan operaciones reales sobre APIs, con herramientas generadas desde OpenAPI, autorización, guardrails determinísticos, confirmación humana y trazabilidad.",

  bio: "Full-Stack software engineer with 6+ years of experience in web development, specialising in TypeScript, React, Next.js, Node.js, and NestJS. Experience building and evolving modern, scalable, and maintainable web applications, from technical design and architecture through implementation, optimisation, and deployment.\n\nExperience working in remote, multidisciplinary environments, translating business requirements into robust technical solutions while prioritising quality, performance, security, and maintainability. Hands-on experience in agentic systems engineering: designing and building agents that interpret natural-language requests and execute real operations against APIs, with tools generated from OpenAPI, authorization, deterministic guardrails, human confirmation, and traceability.",

  // skills.astro renderiza solo `skills`/`skillsEs`; por eso "Idiomas" va
  // también dentro de skills (igual que en update-content-v2.mjs).
  skillsEs: [
    block([b("Lenguajes de programación")]),
    block("TypeScript · JavaScript · SQL"),
    block([b("Front-End")]),
    block(
      "React · Next.js · HTML · CSS · Sass · Tailwind CSS · Redux · Redux Saga",
    ),
    block([b("Back-End")]),
    block(
      "Node.js · NestJS · PostgreSQL · MongoDB · SQL · NoSQL · REST APIs · GraphQL",
    ),
    block([b("Ingeniería de software")]),
    block(
      "Arquitectura de aplicaciones · Diseño de APIs · Desarrollo Full-Stack · Optimización de rendimiento · Seguridad de aplicaciones · Git · GitHub · Metodologías ágiles",
    ),
    block([b("IA y sistemas agénticos")]),
    block(
      "LLMs · Tool / Function Calling · Agentic Workflows · LLM Orchestration · OpenAPI-based Tool Generation · Tool Routing · Context Engineering · Human-in-the-Loop · Deterministic Guardrails · Agent Authorization · Auditability · Agentic UI",
    ),
    block([b("Idiomas hablados")]),
    block("Español · Inglés"),
  ],

  skills: [
    block([b("Programming languages")]),
    block("TypeScript · JavaScript · SQL"),
    block([b("Front-End")]),
    block(
      "React · Next.js · HTML · CSS · Sass · Tailwind CSS · Redux · Redux Saga",
    ),
    block([b("Back-End")]),
    block(
      "Node.js · NestJS · PostgreSQL · MongoDB · SQL · NoSQL · REST APIs · GraphQL",
    ),
    block([b("Software engineering")]),
    block(
      "Application Architecture · API Design · Full-Stack Development · Performance Optimization · Application Security · Git · GitHub · Agile Methodologies",
    ),
    block([b("AI and agentic systems")]),
    block(
      "LLMs · Tool / Function Calling · Agentic Workflows · LLM Orchestration · OpenAPI-based Tool Generation · Tool Routing · Context Engineering · Human-in-the-Loop · Deterministic Guardrails · Agent Authorization · Auditability · Agentic UI",
    ),
    block([b("Spoken languages")]),
    block("Spanish · English"),
  ],

  // `languages` es requerido por el schema aunque el sitio no lo renderiza.
  languagesEs: [block("Español · Inglés")],
  languages: [block("Spanish · English")],
};

// ---------------------------------------------------------------------------
// workExperience — clave: companyName (EN). companyNameEs cuando difiere.
// chronoIndex mayor = más reciente. Dos trabajos pueden ser `current` a la vez.
// location/locationEs salen del texto tras el nombre de la empresa en los PDF
// (mapeo de migrate-location.mjs; nunca modality).
// ---------------------------------------------------------------------------

const LOC = {
  remote: { location: "remote", locationEs: "remoto" },
  hybrid: { location: "hybrid", locationEs: "híbrido" },
  onSite: { location: "On-site", locationEs: "Presencial" },
};

const workExperienceContent = [
  {
    match: "Inditex Spain (Europe)",
    companyNameEs: "Inditex España (Europa)",
    ...LOC.remote,
    jobTitleEs: "Desarrollador Front-End",
    jobTitle: "Front-End Developer",
    startDate: "2026-03-01",
    current: true,
    chronoIndex: 5,
    jobDescriptionEs: bulletList([
      [
        t("Desarrollo Front-End con "),
        t("JavaScript y React"),
        t(", sin frameworks añadidos."),
      ],
      "Testing unitario y de componentes de UI.",
      [
        t("A11y: cumplimiento de "),
        t("WCAG"),
        t(
          ", validación con lectores de pantalla y navegación por teclado con gestión de foco.",
        ),
      ],
      [
        t("Colaboración en la estructura de skills y procesos de "),
        t("SDD (Spec-Driven Development)"),
        t(" para mejorar el uso de IA."),
      ],
    ]),
    jobDescription: bulletList([
      [
        t("Front-End development with "),
        t("JavaScript and React"),
        t(", with no added frameworks."),
      ],
      "Unit and UI component testing.",
      [
        t("A11y: "),
        t("WCAG"),
        t(
          " compliance, screen reader validation, and keyboard navigation with focus management.",
        ),
      ],
      [
        t("Collaboration on skills structure and "),
        t("SDD (Spec-Driven Development)"),
        t(" processes to improve AI usage."),
      ],
    ]),
  },
  {
    match: "Archie",
    ...LOC.remote,
    jobTitleEs: "Desarrollador Full-Stack",
    jobTitle: "Full-Stack Developer",
    startDate: "2025-06-01",
    current: true,
    chronoIndex: 4,
    jobDescriptionEs: bulletList([
      [
        t("Desarrollo Full-Stack con "),
        t("NestJS, Next.js y TypeScript"),
        t(
          ": servicios backend, APIs orientadas a negocio e interfaces web mantenibles, en un entorno remoto y ágil.",
        ),
      ],
      [
        t("Harness agéntico basado en OpenAPI con "),
        t("Agentic UI"),
        t(": "),
        t("tool-calling loop"),
        t(
          " iterativo, generación dinámica de tools desde el spec y arquitectura ",
        ),
        t("LLM-agnostic"),
        t("."),
      ],
      [
        t("Producción a escala: "),
        t("tool routing"),
        t(" sobre 140+ herramientas, "),
        t("context engineering"),
        t(", "),
        t("guardrails determinísticos"),
        t(" y flujos "),
        t("human-in-the-loop"),
        t("."),
      ],
      [
        t("Autorización con "),
        t("CASL"),
        t(" multi-tenant, "),
        t("trazabilidad"),
        t(" y seguimiento de consumo de LLM."),
      ],
    ]),
    jobDescription: bulletList([
      [
        t("Full-Stack development with "),
        t("NestJS, Next.js, and TypeScript"),
        t(
          ": backend services, business-oriented APIs, and maintainable web interfaces, in a remote, agile environment.",
        ),
      ],
      [
        t("OpenAPI-based agentic harness with "),
        t("Agentic UI"),
        t(": iterative "),
        t("tool-calling loop"),
        t(", dynamic tool generation from the spec, and "),
        t("LLM-agnostic"),
        t(" architecture."),
      ],
      [
        t("Production at scale: "),
        t("tool routing"),
        t(" across 140+ tools, "),
        t("context engineering"),
        t(", "),
        t("deterministic guardrails"),
        t(", and "),
        t("human-in-the-loop"),
        t(" flows."),
      ],
      [
        t("Authorization with "),
        t("multi-tenant CASL"),
        t(", "),
        t("traceability"),
        t(", and LLM usage tracking."),
      ],
    ]),
  },
  {
    match: "DaVinci Health Malta (Europe)",
    companyNameEs: "DaVinci Health Malta (Europa)",
    ...LOC.hybrid,
    jobTitleEs: "Desarrollador Full-Stack",
    jobTitle: "Full-Stack Developer",
    startDate: "2023-12-01",
    endDate: "2025-01-01",
    current: false,
    chronoIndex: 3,
    jobDescriptionEs: bulletList([
      "Participación en la modernización de un sistema ERP hospitalario mediante el diseño e implementación de una solución web unificada.",
      [
        t("Desarrollo Full-Stack con "),
        t("NestJS, PostgreSQL, Next.js, TypeScript y Redux Saga"),
        t("."),
      ],
      "Diseño de soluciones orientadas a escalabilidad, mantenibilidad y seguridad en un entorno con requisitos exigentes de protección de datos.",
      "Colaboración con equipos multidisciplinarios para transformar procesos y requisitos del negocio en funcionalidades de software.",
      "Aplicación de buenas prácticas de ingeniería, optimización de procesos y desarrollo iterativo mediante metodologías ágiles.",
    ]),
    jobDescription: bulletList([
      "Participated in the modernisation of a hospital ERP system by designing and implementing a unified web solution.",
      [
        t("Full-Stack development with "),
        t("NestJS, PostgreSQL, Next.js, TypeScript, and Redux Saga"),
        t("."),
      ],
      "Designed solutions focused on scalability, maintainability, and security in an environment with demanding data-protection requirements.",
      "Collaborated with multidisciplinary teams to translate business processes and requirements into software features.",
      "Applied engineering best practices, process optimisation, and iterative development through agile methodologies.",
    ]),
  },
  {
    match: "RV Dev",
    ...LOC.remote,
    jobTitleEs: "Desarrollador Full-Stack",
    jobTitle: "Full-Stack Developer",
    startDate: "2021-02-01",
    endDate: "2023-07-01",
    current: false,
    chronoIndex: 2,
    jobDescriptionEs: bulletList([
      [
        t(
          "Desarrollo de aplicaciones web modernas y sitios de alto rendimiento utilizando ",
        ),
        t("React, Gatsby.js, Sanity.io, GraphQL, Node.js, NestJS y PostgreSQL"),
        t("."),
      ],
      "Desarrollo de soluciones WordPress personalizadas a partir de diseños y requisitos funcionales proporcionados por equipos de diseño.",
      "Integración de interfaces de usuario con servicios backend y APIs para entregar experiencias web completas.",
    ]),
    jobDescription: bulletList([
      [
        t(
          "Developed modern web applications and high-performance sites using ",
        ),
        t(
          "React, Gatsby.js, Sanity.io, GraphQL, Node.js, NestJS, and PostgreSQL",
        ),
        t("."),
      ],
      "Developed custom WordPress solutions from designs and functional requirements provided by design teams.",
      "Integrated user interfaces with backend services and APIs to deliver complete web experiences.",
    ]),
  },
  {
    // Los PDF no traen descripción para O.S Group: se oculta y no se siembra.
    match: "O.S Group",
    ...LOC.remote,
    jobTitleEs: "Desarrollador Front-End",
    jobTitle: "Front-End Developer",
    startDate: "2020-06-01",
    endDate: "2020-12-01",
    current: false,
    hideDescription: true,
    chronoIndex: 1,
  },
];

// ---------------------------------------------------------------------------
// volunteering — clave: organization.
// ---------------------------------------------------------------------------

const volunteeringContent = [
  {
    match: "BeeSoft Labs",
    roleEs: "Consultor de Educación Técnica",
    role: "Technical Education Consultant",
    startDate: "2020-02-01",
    endDate: "2022-10-01",
    current: false,
    chronoIndex: 1,
    descriptionEs: bulletList([
      "Diseño e implementación de rutas de aprendizaje para estudiantes de tecnología.",
      "Mentoría y acompañamiento técnico durante el proceso formativo.",
      [
        t("Gestión de alianzas con "),
        t("JetBrains"),
        t(" y "),
        t("Blisk.io"),
        t(" para obtener patrocinios y recursos tecnológicos."),
      ],
    ]),
    description: bulletList([
      "Designed and implemented learning paths for technology students.",
      "Provided mentorship and technical guidance throughout the training process.",
      [
        t("Managed partnerships with "),
        t("JetBrains"),
        t(" and "),
        t("Blisk.io"),
        t(" to secure sponsorships and technology resources."),
      ],
    ]),
  },
];

// ---------------------------------------------------------------------------
// education — clave: institutionOrSchool (nombre exacto de los PDF).
// ---------------------------------------------------------------------------

const educationContent = [
  {
    match: "Servicio Nacional de Aprendizaje (SENA)",
    degreeEs: "Análisis y Desarrollo de Software",
    degree: "Software Analysis and Development",
    startDate: "2022-11-01",
    current: true,
    chronoIndex: 3,
    // Sin descripción en los PDF: no se siembra ninguna.
  },
  {
    match: "IELS Malta - Institute of English Language Studies",
    degreeEs: "Inglés",
    degree: "English",
    startDate: "2023-11-01",
    endDate: "2024-02-01",
    current: false,
    chronoIndex: 2,
    descriptionEs: [
      block(
        "Programa de Inglés General orientado al desarrollo de competencias de lectura, escritura, expresión oral y comprensión auditiva para contextos cotidianos y profesionales.",
      ),
    ],
    description: [
      block(
        "General English program focused on developing reading, writing, speaking, and listening skills for everyday and professional contexts.",
      ),
    ],
  },
  {
    match: "Code Your Future CO",
    degreeEs: "Desarrollador Full-Stack JavaScript",
    degree: "Full-Stack JavaScript Developer",
    startDate: "2019-02-01",
    endDate: "2019-11-01",
    current: false,
    chronoIndex: 1,
    descriptionEs: [
      block(
        "Bootcamp intensivo de desarrollo Full-Stack enfocado en JavaScript, React, Node.js, Express.js, MongoDB y PostgreSQL, con formación práctica en Git, GitHub, metodologías ágiles, debugging, optimización y despliegue.",
      ),
    ],
    description: [
      block(
        "Intensive Full-Stack development bootcamp focused on JavaScript, React, Node.js, Express.js, MongoDB, and PostgreSQL, with hands-on training in Git, GitHub, agile methodologies, debugging, optimization, and deployment.",
      ),
    ],
  },
];

// ---------------------------------------------------------------------------
// Especificación de documentos a sembrar
//   - singleton: se busca por _type
//   - colección: se busca por matchField === match
// `data` excluye _id/_type; los campos `title` salen de la clave.
// ---------------------------------------------------------------------------

function stripMatch({ match, ...rest }) {
  return rest;
}

function buildSpecs() {
  const specs = [];

  specs.push({
    type: "aboutMe",
    label: "About Me",
    singleton: true,
    id: "aboutMe",
    data: aboutMeContent,
  });

  for (const w of workExperienceContent) {
    specs.push({
      type: "workExperience",
      label: `Work Experience — ${w.match}`,
      matchField: "companyName",
      match: w.match,
      id: `workExperience-${slug(w.match)}`,
      data: { title: w.match, companyName: w.match, ...stripMatch(w) },
    });
  }

  for (const v of volunteeringContent) {
    specs.push({
      type: "volunteering",
      label: `Volunteering — ${v.match}`,
      matchField: "organization",
      match: v.match,
      id: `volunteering-${slug(v.match)}`,
      data: { title: v.match, organization: v.match, ...stripMatch(v) },
    });
  }

  for (const e of educationContent) {
    specs.push({
      type: "education",
      label: `Education — ${e.match}`,
      matchField: "institutionOrSchool",
      match: e.match,
      id: `education-${slug(e.match)}`,
      data: { title: e.match, institutionOrSchool: e.match, ...stripMatch(e) },
    });
  }

  specs.push({
    type: "uiStrings",
    label: "UI Strings",
    singleton: true,
    id: "uiStrings",
    data: uiStringsContent,
  });

  return specs;
}

function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// --self-check: valida los payloads sin tocar la red
// ---------------------------------------------------------------------------

const REQUIRED = {
  aboutMe: [
    "firstName",
    "surname",
    "jobTitle",
    "email",
    "skills",
    "languages",
    "bio",
  ],
  workExperience: [
    "jobTitle",
    "startDate",
    "companyName",
    "location",
    "chronoIndex",
  ],
  volunteering: ["role", "startDate", "organization", "chronoIndex"],
  education: ["degree", "startDate", "institutionOrSchool", "chronoIndex"],
  uiStrings: ["sectionTitles", "present"],
};

const UI_SECTION_FIELDS = [
  "professionalProfile",
  "skills",
  "workExperience",
  "volunteering",
  "education",
];

// Pares EN/ES que deben existir juntos cuando uno de los dos está presente.
const PAIRS = {
  aboutMe: [
    ["jobTitle", "jobTitleEs"],
    ["skills", "skillsEs"],
    ["languages", "languagesEs"],
    ["bio", "bioEs"],
  ],
  workExperience: [
    ["jobTitle", "jobTitleEs"],
    ["location", "locationEs"],
    ["jobDescription", "jobDescriptionEs"],
  ],
  volunteering: [
    ["role", "roleEs"],
    ["description", "descriptionEs"],
  ],
  education: [
    ["degree", "degreeEs"],
    ["description", "descriptionEs"],
  ],
};

function runSelfCheck() {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const specs = buildSpecs();

  const isPT = (v) =>
    Array.isArray(v) && v.length > 0 && v.every((x) => x?._type === "block");
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function checkPT(label, field, arr) {
    const keys = new Set();
    for (const blk of arr) {
      if (!blk._key) fail(`${label}.${field}: bloque sin _key`);
      if (keys.has(blk._key))
        fail(`${label}.${field}: _key duplicada ${blk._key}`);
      keys.add(blk._key);
      if (blk.style !== "normal") fail(`${label}.${field}: style inesperado`);
      if (!Array.isArray(blk.markDefs))
        fail(`${label}.${field}: bloque sin markDefs`);
      if (!Array.isArray(blk.children) || blk.children.length === 0)
        fail(`${label}.${field}: bloque sin children`);
      const childKeys = new Set();
      for (const c of blk.children ?? []) {
        if (c._type !== "span" || typeof c.text !== "string" || !c.text)
          fail(`${label}.${field}: span inválido`);
        if (!c._key || childKeys.has(c._key))
          fail(`${label}.${field}: span sin _key o duplicada`);
        childKeys.add(c._key);
        if (!Array.isArray(c.marks)) fail(`${label}.${field}: span sin marks`);
      }
    }
  }

  const seenIds = new Set();
  const seenMatch = new Set();
  const chrono = {};

  for (const spec of specs) {
    const { type, label, data } = spec;
    if (seenIds.has(spec.id)) fail(`${label}: _id duplicado ${spec.id}`);
    seenIds.add(spec.id);
    if (!spec.singleton) {
      const k = `${type}:${spec.match}`;
      if (seenMatch.has(k)) fail(`${label}: clave duplicada ${spec.match}`);
      seenMatch.add(k);
    }

    if ("modality" in data)
      fail(`${label}: contiene el campo obsoleto modality`);
    if (JSON.stringify(data).includes('"modality"'))
      fail(`${label}: aparece "modality" en algún nivel del payload`);

    for (const f of REQUIRED[type] ?? []) {
      const v = data[f];
      if (
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && !v.length)
      )
        fail(`${label}: falta el campo requerido ${f}`);
    }

    for (const [en, es] of PAIRS[type] ?? []) {
      if ((data[en] !== undefined) !== (data[es] !== undefined))
        fail(`${label}: ${en}/${es} deben venir juntos (EN+ES)`);
    }

    for (const [f, v] of Object.entries(data)) {
      if (Array.isArray(v) && v.length && v[0]?._type === "block") {
        if (!isPT(v)) fail(`${label}.${f}: Portable Text mal formado`);
        else checkPT(label, f, v);
      }
      if ((f === "startDate" || f === "endDate") && !DATE_RE.test(v))
        fail(`${label}.${f}: fecha inválida ${v}`);
    }

    if (
      type === "workExperience" ||
      type === "volunteering" ||
      type === "education"
    ) {
      if (data.current === true && data.endDate)
        fail(`${label}: current=true no debe llevar endDate`);
      if (data.current === false && !data.endDate)
        fail(`${label}: current=false requiere endDate`);
      if (data.endDate && data.endDate < data.startDate)
        fail(`${label}: endDate anterior a startDate`);
      if (![1, 2, 3, 4, 5].includes(data.chronoIndex))
        fail(`${label}: chronoIndex fuera de 1..5`);
      chrono[type] ??= new Set();
      if (chrono[type].has(data.chronoIndex))
        fail(`${label}: chronoIndex repetido (${data.chronoIndex})`);
      chrono[type].add(data.chronoIndex);
    }

    // Los PDF no llevan negrita en cuerpos de viñetas/descripciones: las
    // etiquetas de habilidades (aboutMe.skills*) son lo único que la usa.
    for (const f of [
      "jobDescription",
      "jobDescriptionEs",
      "description",
      "descriptionEs",
    ]) {
      for (const blk of data[f] ?? []) {
        for (const c of blk.children ?? []) {
          if ((c.marks ?? []).length > 0)
            fail(
              `${label}.${f}: span con marks ${JSON.stringify(c.marks)} (debe ser texto plano)`,
            );
        }
      }
    }

    if (type === "workExperience") {
      if (!data.location || !data.locationEs)
        fail(`${label}: location y locationEs son obligatorios`);
      if (data.hideDescription === true) {
        if (data.jobDescription || data.jobDescriptionEs)
          fail(`${label}: hideDescription=true no debe llevar descripción`);
      } else if (!isPT(data.jobDescription) || !isPT(data.jobDescriptionEs))
        fail(`${label}: falta jobDescription/jobDescriptionEs`);
    }

    if (type === "aboutMe") {
      const c = data.defaultContactInfo;
      if (!c || c.isActive !== true || !c.phone || !c.city || !c.country)
        fail(`${label}: defaultContactInfo incompleto`);
      for (const l of data.links ?? []) {
        if (!l._key || !l.platformName || !/^https:\/\//.test(l.link))
          fail(`${label}: link inválido ${JSON.stringify(l)}`);
      }
    }

    if (type === "uiStrings") {
      const loc = (name, v) => {
        if (!v || typeof v.en !== "string" || !v.en.trim())
          fail(`${label}: ${name}.en vacío o ausente`);
        if (!v || typeof v.es !== "string" || !v.es.trim())
          fail(`${label}: ${name}.es vacío o ausente`);
      };
      loc("present", data.present);
      for (const f of UI_SECTION_FIELDS)
        loc(`sectionTitles.${f}`, data.sectionTitles?.[f]);
      const extra = Object.keys(data.sectionTitles ?? {}).filter(
        (k) => !UI_SECTION_FIELDS.includes(k),
      );
      if (extra.length)
        fail(`${label}: campos no declarados en el schema: ${extra}`);
    }
  }

  const counts = specs.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});

  if (errors.length > 0) {
    console.error("SELF-CHECK FALLÓ:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `SELF-CHECK OK: ${specs.length} documentos bien formados (${Object.entries(
      counts,
    )
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}). Sin red, sin modality, localizedString con en+es.`,
  );
}

if (SELF_CHECK) {
  runSelfCheck();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Validación de entorno (solo para dry-run / commit)
// ---------------------------------------------------------------------------

if (!projectId || !dataset) {
  console.error(
    "Faltan PUBLIC_SANITY_PROJECT_ID y/o PUBLIC_SANITY_DATASET en .env",
  );
  process.exit(1);
}

if (COMMIT && !writeToken) {
  console.error(
    [
      "",
      "No se encontró SANITY_API_WRITE_TOKEN ni SANITY_API_TOKEN — no se puede escribir en Sanity.",
      "",
      "Cómo generarlo:",
      `  1. Ve a https://www.sanity.io/manage/project/${projectId}/api#tokens`,
      "  2. Crea un token nuevo con permisos de escritura (Editor o Write).",
      "  3. Copia el token.",
      "",
      "Dónde ponerlo:",
      "  Añade esta línea a .env.local (en la raíz del proyecto, NO a .env — .env.local no se versiona):",
      "    SANITY_API_WRITE_TOKEN=<tu-token>",
      "  (o usa SANITY_API_TOKEN como alternativa)",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-07-24",
  token: COMMIT ? writeToken : readToken,
  useCdn: false,
  perspective: "raw",
});

// ---------------------------------------------------------------------------
// Comparación y reporte
// ---------------------------------------------------------------------------

/**
 * Normaliza para comparar contenido, no identidad ni orden de claves:
 * quita las _key de Portable Text y ordena las claves de los objetos
 * (Sanity las devuelve alfabéticas). El orden de los arrays SÍ cuenta.
 */
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (k === "_key") continue;
      out[k] = normalize(v[k]);
    }
    return out;
  }
  return v;
}

function sameValue(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function ptToPlainText(blocks) {
  return blocks
    .map((blk) =>
      (blk.children ?? [])
        .map((c) => (c.marks?.includes("strong") ? `**${c.text}**` : c.text))
        .join(""),
    )
    .join("\n");
}

function show(v) {
  if (v === undefined || v === null) return "(vacío)";
  if (Array.isArray(v) && v.length && v[0]?._type === "block")
    return JSON.stringify(ptToPlainText(v));
  return JSON.stringify(v);
}

/** Busca el documento existente (prefiere el publicado sobre el borrador). */
async function findExisting(spec) {
  const filter = spec.singleton
    ? `_type == $type`
    : `_type == $type && ${spec.matchField} == $match`;
  const params = spec.singleton
    ? { type: spec.type }
    : { type: spec.type, match: spec.match };
  const docs = await client.fetch(`*[${filter}]`, params);
  if (docs.length === 0) return null;
  const published = docs.filter((d) => !d._id.startsWith("drafts."));
  const pool = published.length > 0 ? published : docs;
  if (pool.length > 1) {
    throw new Error(
      `Se esperaba un único documento ${spec.type}${spec.singleton ? "" : ` con ${spec.matchField}="${spec.match}"`}, pero se encontraron ${pool.length}: ${pool.map((d) => d._id).join(", ")}. Resuélvelo a mano antes de sembrar.`,
    );
  }
  return pool[0];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `Sanity project=${projectId} dataset=${dataset} modo=${COMMIT ? "COMMIT (escribe)" : "DRY-RUN (solo lectura)"}`,
  );

  const specs = buildSpecs();
  const ops = []; // { kind: "create"|"patch", ... }
  const summary = {}; // type -> { create, patch, same }

  for (const spec of specs) {
    const bucket = (summary[spec.type] ??= { create: 0, patch: 0, same: 0 });
    console.log(`\n--- ${spec.label} ---`);
    const existing = await findExisting(spec);

    if (!existing) {
      bucket.create += 1;
      console.log(`  CREAR (_id=${spec.id}) — no existe todavía.`);
      for (const [f, v] of Object.entries(spec.data)) {
        console.log(`  ${f} -> ${show(v)}`);
      }
      ops.push({
        kind: "create",
        doc: { _id: spec.id, _type: spec.type, ...spec.data },
      });
      continue;
    }

    console.log(`  Existe: ${existing._id}`);
    const patch = {};
    for (const [f, v] of Object.entries(spec.data)) {
      if (sameValue(existing[f], v)) continue;
      patch[f] = v;
      console.log(`  ${f}:`);
      console.log(`    actual -> ${show(existing[f])}`);
      console.log(`    nuevo  -> ${show(v)}`);
    }
    if (Object.keys(patch).length === 0) {
      bucket.same += 1;
      console.log("  Sin cambios.");
    } else {
      bucket.patch += 1;
      ops.push({ kind: "patch", _id: existing._id, patch });
    }
  }

  console.log("\n===================================");
  console.log("Resumen por tipo (crear / parchear / sin cambios):");
  for (const [type, s] of Object.entries(summary)) {
    console.log(
      `  ${type}: crear=${s.create} parchear=${s.patch} sin-cambios=${s.same}`,
    );
  }
  console.log(`Total de documentos a escribir: ${ops.length}`);

  if (!COMMIT) {
    console.log(
      "DRY-RUN: no se escribió nada. Corre con --commit para aplicar estos cambios.",
    );
    return;
  }

  if (ops.length === 0) {
    console.log("Nada que escribir.");
    return;
  }

  console.log(`Escribiendo ${ops.length} documento(s) en Sanity...`);
  const tx = client.transaction();
  for (const op of ops) {
    if (op.kind === "create") tx.create(op.doc);
    else tx.patch(op._id, (p) => p.set(op.patch));
  }
  await tx.commit();
  console.log("Listo.");
}

main().catch((err) => {
  console.error("\nERROR:", err.message);
  process.exit(1);
});
