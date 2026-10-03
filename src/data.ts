import content from "../content/archives.json" with { type: "json" };
import directory from "../content/personnel.json" with { type: "json" };
import type { ReaderSection } from "./reader";

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
  /** Optional long-form chapters; only the reading stage renders these. */
  sections?: ReaderSection[];
  /** Optional per-document artwork for the information substrate, under public/. */
  substrate?: string;
}

export const records: ArchiveRecord[] = content.records;
export const categories = ["全部档案", ...content.categories];
export const archiveColumns = content.columns;
/** Headcount shown in the navigation badge; the roster itself is read by the
 *  directory overlay so both views share one content file. */
export const directorySize = directory.personnel.length;

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
