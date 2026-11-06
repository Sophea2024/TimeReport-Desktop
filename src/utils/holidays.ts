export interface Holiday {
  date: string;
  name: string;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

function calculateBußUndBettag(year: number): Date {
  const november23 = new Date(year, 10, 23);
  const dayOfWeek = november23.getDay();

  const daysToWednesday = (dayOfWeek - 3 + 7) % 7;

  return addDays(november23, -daysToWednesday);
}

export const getHolidaysForYear = (
  year: number,
  federalState: string,
): Holiday[] => {
  const holidays: Holiday[] = [
    {
      date: `${year}-01-01`,
      name: "Neujahr",
    },
    {
      date: `${year}-05-01`,
      name: "Tag der Arbeit",
    },
    {
      date: `${year}-10-03`,
      name: "Tag der Deutschen Einheit",
    },
    {
      date: `${year}-12-25`,
      name: "1. Weihnachtstag",
    },
    {
      date: `${year}-12-26`,
      name: "2. Weihnachtstag",
    },
  ];

  const easterSunday = calculateEasterSunday(year);

  holidays.push(
    {
      date: formatDate(addDays(easterSunday, -2)),
      name: "Karfreitag",
    },
    {
      date: formatDate(addDays(easterSunday, 1)),
      name: "Ostermontag",
    },
    {
      date: formatDate(addDays(easterSunday, 39)),
      name: "Christi Himmelfahrt",
    },
    {
      date: formatDate(addDays(easterSunday, 50)),
      name: "Pfingstmontag",
    },
  );

  switch (federalState) {
    case "BW":
      holidays.push(
        {
          date: `${year}-01-06`,
          name: "Heilige Drei Könige",
        },
        {
          date: formatDate(addDays(easterSunday, 60)),
          name: "Fronleichnam",
        },
        {
          date: `${year}-11-01`,
          name: "Allerheiligen",
        },
      );
      break;

    case "BY":
      holidays.push(
        {
          date: `${year}-01-06`,
          name: "Heilige Drei Könige",
        },
        {
          date: formatDate(addDays(easterSunday, 60)),
          name: "Fronleichnam",
        },
        {
          date: `${year}-11-01`,
          name: "Allerheiligen",
        },
      );
      break;

    case "HE":
    case "NW":
    case "RP":
    case "SL":
      holidays.push({
        date: formatDate(addDays(easterSunday, 60)),
        name: "Fronleichnam",
      });
      break;

    case "SN":
      holidays.push({
        date: formatDate(calculateBußUndBettag(year)),
        name: "Buß- und Bettag",
      });
      break;

    case "ST":
      holidays.push({
        date: `${year}-01-06`,
        name: "Heilige Drei Könige",
      });
      break;

    case "TH":
      holidays.push({
        date: formatDate(addDays(easterSunday, 60)),
        name: "Fronleichnam",
      });
      break;

    case "BB":
    case "BE":
    case "HB":
    case "HH":
    case "MV":
    case "NI":
    case "SH":
      break;
  }

  return holidays;
};
