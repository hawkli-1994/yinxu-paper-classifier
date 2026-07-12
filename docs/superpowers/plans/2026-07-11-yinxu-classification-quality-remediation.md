# Yinxu Classification Quality Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Turn the current runnable skeleton into an evidence-preserving, deterministically validated, human-correctable Yinxu paper classification workflow.

**Architecture:** Pi produces an evidence-rich draft from all page chunks and the bundled methodology Skill. Electron main validates and normalizes that draft, computes confidence, persists results atomically, and exposes a review workflow that can correct classifications and evidence before export.

**Tech Stack:** Electron, React, TypeScript, Ant Design, Pi Coding Agent SDK, PDF.js, `@pdfme/pdf-lib`, Ajv, ExcelJS, Vitest, Playwright.

## Global Constraints

- Windows remains the supported packaged platform; macOS remains usable for development preview.
- Node.js is provided by Electron; users install neither Node.js nor Python.
- The first version remains single-user and does not add Agent permission approval UI.
- The 4/16/72 taxonomy and A-Z 26 paper fields remain source-compatible with the supplied workbook.
- Unknown visual reconstruction fields stay blank and low-confidence rather than being inferred.

---

### Task 1: Rebuild the methodology Skill

**Files:**
- Modify: `resources/yinxu-classifier/SKILL.md`
- Modify: `resources/yinxu-classifier/special-rules.json`
- Modify: `resources/yinxu-classifier/paper-schema.json`
- Create: `resources/yinxu-classifier/references/classification-rules.md`
- Create: `resources/yinxu-classifier/references/field-guidance.md`
- Create: `resources/yinxu-classifier/references/classification-examples.md`
- Create: `tests/unit/knowledge-package.test.ts`

**Interfaces:**
- Produces a complete draft JSON contract and references explicitly routed from `SKILL.md`.
- Produces machine-readable rule IDs used by validation and audit output.

- [x] Write tests that require all six conflict pairs, all source special rules, all 26 field schemas, and explicit reference routing.
- [x] Run the focused tests and confirm failures for missing rules and schema definitions.
- [x] Rewrite the Skill resources to satisfy those tests.
- [x] Run the focused tests and confirm they pass.

### Task 2: Preserve all pages through extraction and OCR

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/pdf-service.ts`
- Modify: `src/main/ocr-service.ts`
- Modify: `src/main/ipc.ts`
- Modify: `tests/unit/pdf-service.test.ts`
- Modify: `tests/unit/ocr-service.test.ts`
- Create: `tests/unit/text-preparation.test.ts`

**Interfaces:**
- Produces `extractSinglePagePdf(bytes, pageIndex): Promise<Uint8Array>`.
- Produces `writeExtractedText(root, pages, report)` with complete 20k-character chunks.
- Produces deterministic `TextPreparationReport` and `OcrQuality`.

- [x] Write tests proving single-page PDF extraction, per-page OCR mapping, complete chunk coverage, and computed quality.
- [x] Run focused tests and confirm the old whole-document behavior fails them.
- [x] Implement single-page OCR and chunk/report generation.
- [x] Run focused tests and confirm they pass.

### Task 3: Add runtime draft validation and deterministic normalization

**Files:**
- Create: `src/shared/result-schema.ts`
- Create: `src/shared/result-normalizer.ts`
- Modify: `src/shared/validation.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/agent-service.ts`
- Modify: `src/main/project-service.ts`
- Create: `tests/unit/result-schema.test.ts`
- Create: `tests/unit/result-normalizer.test.ts`
- Modify: `tests/unit/validation.test.ts`
- Modify: `tests/unit/agent-service.test.ts`

**Interfaces:**
- Produces `parseAgentDraft(value: unknown): AgentPaperDraft` backed by Ajv.
- Produces `normalizePaperResult(draft, pages, context): PaperResult`.
- Guarantees category path, source path, evidence validity, computed confidence, field assessments, and review status.

- [x] Write failing tests for malformed drafts, mismatched category fields, model-supplied confidence, invalid candidates, and unverifiable evidence.
- [x] Run focused tests and confirm expected failures.
- [x] Implement Schema parsing and normalization.
- [x] Run focused tests and confirm they pass.

### Task 4: Isolate the Skill and unify knowledge versioning

**Files:**
- Modify: `src/main/resource-service.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/project-service.ts`
- Modify: `src/main/agent-service.ts`
- Modify: `tests/unit/agent-service.test.ts`
- Modify: `tests/unit/project-service.test.ts`
- Create: `tests/unit/resource-service.test.ts`

**Interfaces:**
- Produces `KnowledgePackage { path: string; version: string }`.
- Passes the actual package to project creation and every Agent run.
- Configures Pi with `noSkills: true` and the one additional knowledge Skill.

- [x] Write failing tests for non-1.0.0 versions and loaded Skill count.
- [x] Run focused tests and confirm failures.
- [x] Thread the package object through startup and IPC, and isolate Pi skills.
- [x] Run focused tests and confirm they pass.

### Task 5: Complete the human review loop

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/features/review/ReviewPage.tsx`
- Create: `src/renderer/features/review/PdfEvidencePreview.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `playwright/app.spec.ts`
- Create: `tests/unit/review-model.test.ts`

**Interfaces:**
- Adds `getSourcePdf(projectId): Promise<Uint8Array>`.
- Saves a reviewed result only after re-normalization and validation.
- Supports editing primary category, cross references, fields, and evidence.

- [x] Write failing model and Electron UI tests for classification/evidence editing and PDF page preview.
- [x] Run focused tests and confirm failures.
- [x] Implement review editing, field bands, preview, and save-time validation.
- [x] Run focused tests and Electron UI tests and confirm they pass.

### Task 6: Restore complete export audit data

**Files:**
- Modify: `src/main/export-service.ts`
- Modify: `tests/unit/export-service.test.ts`

**Interfaces:**
- Preserves A-Z fields.
- Exports full audit information and all 18 image library columns including `备注`.

- [x] Write failing tests for image headers and audit rows.
- [x] Run the focused tests and confirm failures.
- [x] Extend export output.
- [x] Run focused tests and confirm they pass.

### Task 7: Add an evaluation harness and complete verification

**Files:**
- Create: `tests/quality/README.md`
- Create: `tests/quality/cases.schema.json`
- Create: `tests/quality/evaluate.ts`
- Modify: `package.json`

**Interfaces:**
- Adds `npm run evaluate:quality -- <gold-set.json>`.
- Reports top-1, hierarchical, evidence-validity, field-completeness, and abstention metrics without inventing an accuracy claim.

- [x] Write a failing evaluator test with a tiny synthetic fixture.
- [x] Implement the evaluator and make the focused test pass.
- [x] Run `npm run test:run`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`.
- [x] Audit each design requirement against source and test evidence.
