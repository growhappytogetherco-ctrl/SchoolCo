/**
 * Airtable API client — future direct-sync compatibility.
 *
 * Today the importer uses CSV exports. This module provides the
 * same data shape via Airtable's REST API so we can later replace
 * the CSV upload step with a live connection.
 *
 * Usage (Phase 6+):
 *   const client = new AirtableClient({ apiKey, baseId, tables })
 *   const rows = await client.fetchStudents()
 *   // rows is RawRow[] — identical to what parseCSV() returns
 */

import type { AirtableConfig, RawRow } from "./types";

export class AirtableClient {
  private readonly apiKey: string;
  private readonly baseId: string;
  private readonly tables: AirtableConfig["tables"];

  constructor(config: AirtableConfig) {
    this.apiKey  = config.apiKey;
    this.baseId  = config.baseId;
    this.tables  = config.tables;
  }

  /** Fetch all records from a table and normalize to RawRow[] */
  async fetchTable(tableId: string): Promise<RawRow[]> {
    const rows: RawRow[] = [];
    let offset: string | undefined;

    do {
      const url = new URL(`https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(tableId)}`);
      if (offset) url.searchParams.set("offset", offset);
      url.searchParams.set("pageSize", "100");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        next: { revalidate: 0 }, // always fresh in Next.js
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Airtable API error ${res.status}: ${body}`);
      }

      const data = await res.json() as { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string };

      for (const record of data.records) {
        const row: RawRow = { _airtable_id: record.id };
        for (const [key, val] of Object.entries(record.fields)) {
          if (Array.isArray(val)) {
            row[key] = val.join(", ");
          } else if (val !== null && val !== undefined) {
            row[key] = String(val);
          } else {
            row[key] = "";
          }
        }
        rows.push(row);
      }

      offset = data.offset;
    } while (offset);

    return rows;
  }

  async fetchStudents(): Promise<RawRow[]> {
    return this.fetchTable(this.tables.students);
  }

  async fetchFamilies(): Promise<RawRow[]> {
    if (!this.tables.families) return [];
    return this.fetchTable(this.tables.families);
  }

  async fetchMedical(): Promise<RawRow[]> {
    if (!this.tables.medical) return [];
    return this.fetchTable(this.tables.medical);
  }
}
