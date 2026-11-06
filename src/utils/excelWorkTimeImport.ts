import * as XLSX from "xlsx";

export interface ExcelWorkInterval {
  start: string;
  end: string;
}

export interface ExcelWorkTimeRow {
  excelRow: number;
  date: string;
  intervals: ExcelWorkInterval[];
  istMinutes: number | null;
  sollMinutes: number | null;
  saldoMinutes: number | null;
  warnings: string[];
}

export interface ExcelMonthlySummary {
  month: string;
  istMinutes: number | null;
  sollMinutes: number | null;
  pauseMinutes: number;
  saldoMinutes: number | null;
  excelRow: number;
}

export interface ExcelImportResult {
  sheetNames: string[];
  selectedSheet: string;
  rows: ExcelWorkTimeRow[];
  monthlySummaries: ExcelMonthlySummary[];
}

interface TableColumns {
  date: number;
  ist: number;
  soll: number;
  saldo: number;
  intervals: Array<{ from: number; to: number }>;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isEmptyRow(row: unknown[]): boolean {
  return row.every(
    (value) => value === null || value === undefined || value === "",
  );
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) return null;

    return [
      parsed.y,
      String(parsed.m).padStart(2, "0"),
      String(parsed.d).padStart(2, "0"),
    ].join("-");
  }

  const text = String(value ?? "").trim();

  const germanDate = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

  if (germanDate) {
    return `${germanDate[3]}-${germanDate[2].padStart(2, "0")}-${germanDate[1].padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return null;
}

function parseTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    if (value >= 0 && value < 1) {
      const minutes = Math.round(value * 1440) % 1440;

      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }

    return null;
  }

  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseDecimalHours(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(",", "."));

  if (!Number.isFinite(normalized)) {
    return null;
  }

  return Math.round(normalized * 60);
}

function findColumns(row: unknown[]): TableColumns | null {
  const headers = row.map(normalizeHeader);

  const date = headers.indexOf("datum");
  const ist = headers.indexOf("ist");
  const soll = headers.indexOf("soll");
  const saldo = headers.indexOf("saldo");

  if (date < 0 || ist < 0 || soll < 0 || saldo < 0) {
    return null;
  }

  const fromColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /^von\d*$/.test(header));

  const intervals: Array<{ from: number; to: number }> = [];

  for (const fromColumn of fromColumns) {
    const nextFromColumn =
      fromColumns.find((column) => column.index > fromColumn.index)?.index ??
      Infinity;

    const toColumn = headers.findIndex(
      (header, index) =>
        /^bis\d*$/.test(header) &&
        index > fromColumn.index &&
        index < nextFromColumn,
    );

    if (toColumn >= 0) {
      intervals.push({
        from: fromColumn.index,
        to: toColumn,
      });
    }
  }

  if (intervals.length === 0) {
    return null;
  }

  return { date, ist, soll, saldo, intervals };
}

function getIntervalMinutes(intervals: ExcelWorkInterval[]): number {
  let totalPauseMinutes = 0;
  let previousEnd: number | null = null;

  for (const interval of intervals) {
    const [startHours, startMinutes] = interval.start.split(":").map(Number);
    const [endHours, endMinutes] = interval.end.split(":").map(Number);

    let start = startHours * 60 + startMinutes;
    let end = endHours * 60 + endMinutes;

    if (end <= start) {
      end += 1440;
    }

    if (previousEnd !== null) {
      while (start < previousEnd) {
        start += 1440;
        end += 1440;
      }

      totalPauseMinutes += Math.max(0, start - previousEnd);
    }

    previousEnd = end;
  }

  return totalPauseMinutes;
}

function getWorkMinutes(intervals: ExcelWorkInterval[]): number {
  let totalWorkMinutes = 0;

  for (const interval of intervals) {
    const [startHours, startMinutes] = interval.start.split(":").map(Number);
    const [endHours, endMinutes] = interval.end.split(":").map(Number);

    const start = startHours * 60 + startMinutes;
    let end = endHours * 60 + endMinutes;

    // Falls ein Arbeitsintervall über Mitternacht geht.
    if (end <= start) {
      end += 1440;
    }

    totalWorkMinutes += end - start;
  }

  return totalWorkMinutes;
}

function parseSheet(worksheet: XLSX.WorkSheet): {
  rows: ExcelWorkTimeRow[];
  monthlySummaries: ExcelMonthlySummary[];
} {
  const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const rows: ExcelWorkTimeRow[] = [];
  const monthlySummaries: ExcelMonthlySummary[] = [];

  let columns: TableColumns | null = null;
  let lastMonth: string | null = null;

  const monthlyPauseTotals = new Map<string, number>();

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const values = data[rowIndex];

    if (!values || isEmptyRow(values)) {
      continue;
    }

    // Jede neue Tabellenkopfzeile aktualisiert die Spaltenzuordnung.
    const detectedColumns = findColumns(values);

    if (detectedColumns) {
      columns = detectedColumns;
      continue;
    }

    if (!columns) {
      continue;
    }

    const firstCell = String(values[0] ?? "")
      .trim()
      .toLowerCase();

    // Monatssumme erkennen und separat speichern.
    if (firstCell === "monatssumme") {
      if (!lastMonth) {
        continue;
      }

      // Die drei letzten numerischen Werte sind Ist, Soll und Saldo.
      // Dadurch funktionieren auch Summenzeilen mit leeren Zwischenzellen.
      const summaryValues = values
        .map(parseDecimalHours)
        .filter((value): value is number => value !== null);

      const summary = summaryValues.slice(-3);

      monthlySummaries.push({
        month: lastMonth,
        istMinutes: summary.length === 3 ? summary[0] : null,
        sollMinutes: summary.length === 3 ? summary[1] : null,
        pauseMinutes: monthlyPauseTotals.get(lastMonth) ?? 0,
        saldoMinutes: summary.length === 3 ? summary[2] : null,
        excelRow: rowIndex + 1,
      });

      continue;
    }

    // Berichtsmonat-Zeilen und sonstige Textzeilen ignorieren.
    const date = parseDate(values[columns.date]);

    if (!date) {
      continue;
    }

    const month = date.substring(0, 7);
    lastMonth = month;

    const warnings: string[] = [];
    const intervals: ExcelWorkInterval[] = [];

    for (const intervalColumns of columns.intervals) {
      const fromValue = values[intervalColumns.from];
      const toValue = values[intervalColumns.to];

      const fromEmpty =
        fromValue === null ||
        fromValue === undefined ||
        fromValue === "" ||
        String(fromValue).trim() === "–" ||
        String(fromValue).trim() === "-";

      const toEmpty =
        toValue === null ||
        toValue === undefined ||
        toValue === "" ||
        String(toValue).trim() === "–" ||
        String(toValue).trim() === "-";

      if (fromEmpty && toEmpty) {
        continue;
      }

      const start = parseTime(fromValue);
      const end = parseTime(toValue);

      if (!start || !end) {
        warnings.push(
          `Ungültiges oder unvollständiges Intervall in Excel-Zeile ${rowIndex + 1}.`,
        );
        continue;
      }

      intervals.push({ start, end });
    }

    if (intervals.length === 0) {
      warnings.push("Keine gültigen Arbeitsintervalle gefunden.");
    }

    const pauseMinutes = getIntervalMinutes(intervals);

    const istMinutes = parseDecimalHours(values[columns.ist]);
    const intervalWorkMinutes = getWorkMinutes(intervals);

    // Ist-Wert aus Excel mit den Arbeitsintervallen vergleichen.
    // Eine Abweichung von maximal einer Minute wird toleriert.
    if (
      istMinutes !== null &&
      intervals.length > 0 &&
      Math.abs(istMinutes - intervalWorkMinutes) > 1
    ) {
      const difference = istMinutes - intervalWorkMinutes;

      warnings.push(
        `Ist-Wert stimmt nicht mit den Arbeitsintervallen überein. ` +
          `Excel: ${istMinutes} Min., Intervalle: ${intervalWorkMinutes} Min., ` +
          `Abweichung: ${difference > 0 ? "+" : ""}${difference} Min.`,
      );
    }

    monthlyPauseTotals.set(
      month,
      (monthlyPauseTotals.get(month) ?? 0) + pauseMinutes,
    );

    rows.push({
      excelRow: rowIndex + 1,
      date,
      intervals,
      istMinutes,
      sollMinutes: parseDecimalHours(values[columns.soll]),
      saldoMinutes: parseDecimalHours(values[columns.saldo]),
      warnings,
    });
  }

  return { rows, monthlySummaries };
}

export async function readExcelWorkTimeFile(
  file: File,
  sheetName?: string,
): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("Die Excel-Datei enthält keine Tabellenblätter.");
  }

  const selectedSheet = sheetName ?? workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];

  if (!worksheet) {
    throw new Error("Das ausgewählte Tabellenblatt wurde nicht gefunden.");
  }

  const result = parseSheet(worksheet);

  return {
    sheetNames: workbook.SheetNames,
    selectedSheet,
    rows: result.rows,
    monthlySummaries: result.monthlySummaries,
  };
}
