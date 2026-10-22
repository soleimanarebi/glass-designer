/** Reference documents (calc-spec §10). */
export const DOCUMENTS = {
  EN: { title: "BS EN 1991-1-4:2005+A1:2010 Eurocode 1: Actions on structures — Part 1-4: General actions — Wind actions" },
  NA: { title: "NA to BS EN 1991-1-4:2005+A1:2010 UK National Annex to Eurocode 1: Actions on structures — Part 1-4: Wind actions" },
  PD: { title: "PD 6688-1-4:2015 Background information to the National Annex to BS EN 1991-1-4 and additional guidance" },
  CWCT: { title: "CWCT Standard for systemised building envelopes, Part 2: Loads, fixings and movement" },
  RA: { title: "Report A: confidential project wind load report (validation only)" },
  RB: { title: "Report B: confidential project wind load report and spreadsheet (validation only)" },
} as const;

export type DocId = keyof typeof DOCUMENTS;

export interface Source {
  doc: DocId;
  /** Clause, table, equation or figure. */
  ref: string;
  /** Printed page number. */
  page: string;
}

export interface Sourced<T> {
  value: T;
  source: Source;
}

export const src = (doc: DocId, ref: string, page: string | number): Source => ({ doc, ref, page: String(page) });

/** Marks a value the documents do not give (see docs/open-questions.md). */
export const TODO_VALUE = Symbol("TODO_VALUE");
