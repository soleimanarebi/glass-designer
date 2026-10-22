/** Reference documents (calc-spec §9). */
export const DOCUMENTS = {
  EN16612: {
    title: "BS EN 16612:2019 Glass in building — Determination of the lateral load resistance of glass panes by calculation",
  },
  ISE: { title: "IStructE, Structural use of glass in buildings, 2nd edition, February 2014" },
  BS6180: { title: "BS 6180:2011 Barriers in and about buildings — Code of practice" },
  "BS6262-4": { title: "BS 6262-4:2018 Glazing for buildings — Part 4: Code of practice for safety related to human impact" },
  REPORT: { title: "Example report: glass structural calculation report (project details withheld)" },
  SHEET: { title: "Glass to PR EN 16612 / IStructE Glass in Buildings 2014 spreadsheet, v4.0" },
  "MEPLA-DG": { title: "Mepla Software GmbH, MEPLA help: Double Glazing" },
  "MEPLA-VER": { title: "RWTH Aachen, Lehrstuhl für Stahlbau: verification calculations for SJ MEPLA" },
  "MEPLA-NL": { title: "Mepla Software GmbH, MEPLA help: Non-Linearity" },
} as const;

export type DocId = keyof typeof DOCUMENTS;

export interface Source {
  doc: DocId;
  /** Clause, table, equation or figure. */
  ref: string;
  /** Printed page number, or a section/cell reference where the document has no pages. */
  page: string;
}

export interface Sourced<T> {
  value: T;
  source: Source;
}

export const src = (doc: DocId, ref: string, page: string | number): Source => ({ doc, ref, page: String(page) });

/** Marks a value the documents do not give (see docs/open-questions.md). */
export const TODO_VALUE = Symbol("TODO_VALUE");
