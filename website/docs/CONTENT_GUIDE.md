# Content Management Guide

The J&A Automation website uses a static content architecture (Headless/Git-based). All content is typed and managed within the codebase.

## 1. Localizations (`/content/locales/`)

UI strings and page copy are managed in JSON files:

- `en.json` (English - Canonical)
- `pt.json` (Brazilian Portuguese)
- `es.json` (Spanish)

## 2. Project Archive (`/content/projects.ts`)

To add a new project case study, append a new object to the `projects` array:

```typescript
{
  id: "unique-project-id",
  slug: "url-friendly-slug",
  title: "Project Name",
  client: "Client Name", // Optional
  displayDate: "2026",
  startYear: 2026,
  industry: "automotive", // Must match types in types.ts
  capabilities: ["robotics", "plc-hmi-scada"], // Must match types in types.ts
  technologies: ["Rockwell", "KUKA"],
  scope: "Detailed description...",
  outcome: "Results...", // Optional
}
```

## 3. Capabilities & Services (`/content/services.ts`)

Updates to core engineering capabilities are made here. The IDs map to translation keys in the locale JSONs.

## 4. Industries (`/content/industries.ts`)

Updates to industry sectors are made here. The IDs map to translation keys in the locale JSONs.
