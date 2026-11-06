import { DailyReport } from "../../types/DailyReport";
import { WeeklyReport } from "../../types/WeeklyReport";
import { MonthlyReport } from "../../types/MonthlyReport";
import { YearlyReport } from "../../types/YearlyReport";
import { WorkSession } from "../../types/WorkSession";
import { Vacation } from "../../types/Vacation";
import { getHolidaysForYear } from "../../utils/holidays";

class ReportService {
  /**
   * ==============================
   * Alle Sessions laden
   * ==============================
   */
  private async getSessions(userId?: string): Promise<WorkSession[]> {
    if (userId) {
      return window.database.getWorkSessionsByUser(userId);
    }

    return window.database.getWorkSessions();
  }

  /**
   * ==============================
   * Urlaub laden
   * ==============================
   */
  private async getVacations(userId: string): Promise<Vacation[]> {
    const vacations = (await window.database.getVacations(
      userId,
    )) as Vacation[];

    console.log("REPORT VACATIONS:", vacations);

    return vacations;
  }

  private getDateOfISOWeek(week: number, year: number): Date {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);

    const dayOfWeek = simple.getDay();

    const isoWeekStart = new Date(simple);

    if (dayOfWeek <= 4) {
      isoWeekStart.setDate(simple.getDate() - dayOfWeek + 1);
    } else {
      isoWeekStart.setDate(simple.getDate() + 8 - dayOfWeek);
    }

    return isoWeekStart;
  }

  /**
   * ==============================
   * Tagesbericht
   * ==============================
   */
  async getDailyReport(date: string, userId: string): Promise<DailyReport> {
    const sessions = await this.getSessions();

    const daySessions = sessions.filter(
      (session) => session.userId === userId && session.date === date,
    );

    // Genehmigte Urlaubsanträge laden
    const vacations = await this.getVacations(userId);
    console.log("DAILY VACATION CHECK:", {
      date,
      vacations,
      isVacation: this.isVacationDay(date, vacations),
    });

    const isApprovedVacation = this.isVacationDay(date, vacations);

    const totalWorkMinutes = this.sumMinutes(daySessions, "totalWorkMinutes");
    const totalPauseMinutes = this.sumMinutes(daySessions, "totalPauseMinutes");

    const officeMinutes = this.sumWorkLocation(daySessions, "office");
    const homeofficeMinutes = this.sumWorkLocation(daySessions, "homeoffice");

    const businessTripMinutes = this.sumWorkLocation(
      daySessions,
      "business_trip",
    );

    const businessTripDays = businessTripMinutes > 0 ? 1 : 0;

    const weeklyWorkMinutes =
      await window.database.getWeeklyWorkMinutes(userId);

    const dailyTargetMinutes = Math.round(weeklyWorkMinutes / 5);

    const federalState = await window.database.getFederalState(userId);
    const year = Number(date.substring(0, 4));

    const holidays = getHolidaysForYear(year, federalState);
    const isHoliday = holidays.some((holiday) => holiday.date === date);

    const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;

    const hasSickDay = daySessions.some((session) => session.status === "sick");

    // Gleiche Priorität und Sollzeitlogik wie in createDailyReports()
    const isVacation = isApprovedVacation && isWorkingDay && !isHoliday;

    const effectiveTargetMinutes =
      isWorkingDay && !isHoliday && !isVacation ? dailyTargetMinutes : 0;

    const status = isVacation
      ? "vacation"
      : hasSickDay
        ? "sick"
        : isHoliday
          ? "publicHoliday"
          : !isWorkingDay
            ? "weekend"
            : "work";

    const sickMinutes = hasSickDay && !isVacation ? effectiveTargetMinutes : 0;

    const overtimeMinutes =
      hasSickDay && !isVacation
        ? 0
        : this.calculateOvertime(totalWorkMinutes, effectiveTargetMinutes);

    const deficitMinutes =
      hasSickDay || isVacation
        ? 0
        : Math.max(0, effectiveTargetMinutes - totalWorkMinutes);

    return {
      date,
      status,
      sessions: daySessions,

      totalWorkMinutes,
      totalPauseMinutes,

      targetMinutes: effectiveTargetMinutes,
      overtimeMinutes,
      deficitMinutes,

      sickMinutes,
      isHoliday,
      isApprovedVacation,

      officeMinutes,
      homeofficeMinutes,

      businessTripMinutes,
      businessTripDays,
    };
  }

  /**
   * ==============================
   * Wochenbericht
   * ==============================
   */
  async getWeeklyReport(
    week: number,
    year: number,
    userId: string,
  ): Promise<WeeklyReport> {
    const sessions = await this.getSessions();

    const weekSessions = sessions.filter((session) => {
      const date = new Date(session.date);

      return (
        session.userId === userId &&
        this.getWeekNumber(date) === week &&
        this.getISOWeekYear(date) === year
      );
    });

    const weeklyWorkMinutes =
      await window.database.getWeeklyWorkMinutes(userId);

    const dailyTargetMinutes = weeklyWorkMinutes / 5;

    const federalState = await window.database.getFederalState(userId);

    const holidays = getHolidaysForYear(year, federalState);

    const vacations = await this.getVacations(userId);

    const firstDayOfWeek = this.getDateOfISOWeek(week, year);

    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 6);

    const vacationDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(firstDayOfWeek);
      date.setDate(date.getDate() + index);

      const dayOfWeek = date.getDay();
      const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;

      const dateString = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");

      return isWorkingDay && this.isVacationDay(dateString, vacations);
    }).filter(Boolean).length;

    const days = this.createDailyReports(
      weekSessions,
      dailyTargetMinutes,
      federalState,
      firstDayOfWeek,
      lastDayOfWeek,
      vacations,
    );

    const officeDays = days.filter((day) => day.officeMinutes > 0).length;

    const homeofficeDays = days.filter(
      (day) => day.homeofficeMinutes > 0,
    ).length;

    const businessTripDays = days.filter(
      (day) => day.businessTripMinutes > 0,
    ).length;

    const totalWorkMinutes = this.sumMinutes(weekSessions, "totalWorkMinutes");

    const totalPauseMinutes = this.sumMinutes(
      weekSessions,
      "totalPauseMinutes",
    );

    const officeMinutes = this.sumWorkLocation(weekSessions, "office");

    const homeofficeMinutes = this.sumWorkLocation(weekSessions, "homeoffice");

    const businessTripMinutes = this.sumWorkLocation(
      weekSessions,
      "business_trip",
    );

    const holidayMinutes =
      holidays
        .filter((holiday) => {
          const date = new Date(holiday.date);
          return (
            this.getWeekNumber(date) === week &&
            this.getISOWeekYear(date) === year
          );
        })
        .filter((holiday) => {
          const dayOfWeek = new Date(holiday.date).getDay();
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        }).length * Math.round(dailyTargetMinutes);

    const targetMinutes = Math.max(
      0,
      weeklyWorkMinutes -
        holidayMinutes -
        Math.round(vacationDays * dailyTargetMinutes),
    );

    const sickMinutes = days.reduce((total, day) => total + day.sickMinutes, 0);

    const overtimeMinutes = this.calculateOvertime(
      totalWorkMinutes,
      targetMinutes,
    );

    const deficitMinutes = Math.max(
      0,
      targetMinutes - totalWorkMinutes - sickMinutes,
    );

    return {
      week,
      year,
      days,

      totalWorkMinutes,
      totalPauseMinutes,

      targetMinutes,
      overtimeMinutes,
      deficitMinutes,
      sickMinutes,

      officeMinutes,
      homeofficeMinutes,
      businessTripMinutes,

      officeDays,
      homeofficeDays,
      businessTripDays,
    };
  }

  /**
   * ==============================
   * Monatsbericht
   * ==============================
   */
  async getMonthlyReport(
    month: number,
    year: number,
    userId: string,
  ): Promise<MonthlyReport> {
    const sessions = await this.getSessions();

    const monthSessions = sessions.filter((session) => {
      const date = new Date(session.date);

      return (
        session.userId === userId &&
        date.getMonth() + 1 === month &&
        date.getFullYear() === year
      );
    });

    const totalWorkMinutes = this.sumMinutes(monthSessions, "totalWorkMinutes");

    console.log(
      "MONTHLY REPORT DEBUG:",
      JSON.stringify(
        monthSessions.map((session) => ({
          date: session.date,
          userId: session.userId,
          status: session.status,
          workLocation: session.workLocation,
          totalWorkMinutes: session.totalWorkMinutes,
        })),
        null,
        2,
      ),
    );

    const totalPauseMinutes = this.sumMinutes(
      monthSessions,
      "totalPauseMinutes",
    );

    const officeMinutes = this.sumWorkLocation(monthSessions, "office");

    const homeofficeMinutes = this.sumWorkLocation(monthSessions, "homeoffice");

    const businessTripMinutes = this.sumWorkLocation(
      monthSessions,
      "business_trip",
    );

    const weeklyWorkMinutes =
      await window.database.getWeeklyWorkMinutes(userId);

    const dailyTargetMinutes = weeklyWorkMinutes / 5;

    const federalState = await window.database.getFederalState(userId);

    const holidays = getHolidaysForYear(year, federalState);

    const vacations = await this.getVacations(userId);
    console.log("VACATIONS LOADED:", vacations);

    const firstDayOfMonth = new Date(year, month - 1, 1);

    const lastDayOfMonth = new Date(year, month, 0);

    const today = new Date();

    const isCurrentMonth =
      month === today.getMonth() + 1 && year === today.getFullYear();

    const effectiveEndDate =
      isCurrentMonth && today < lastDayOfMonth ? today : lastDayOfMonth;

    const elapsedWorkingDays = this.getWorkingDaysInMonth(month, year).filter(
      (date) => new Date(`${date}T12:00:00`) <= effectiveEndDate,
    );

    const elapsedHolidayMinutes =
      holidays.filter((holiday) => {
        const date = new Date(holiday.date);

        return (
          date >= firstDayOfMonth &&
          date <= effectiveEndDate &&
          date.getDay() >= 1 &&
          date.getDay() <= 5
        );
      }).length * Math.round(dailyTargetMinutes);

    const vacationDays = elapsedWorkingDays.filter((date) =>
      this.isVacationDay(date, vacations),
    ).length;

    const targetMinutes = Math.max(
      0,
      Math.round(
        (elapsedWorkingDays.length - vacationDays) * dailyTargetMinutes,
      ) - elapsedHolidayMinutes,
    );

    const days = this.createDailyReports(
      monthSessions,
      dailyTargetMinutes,
      federalState,
      firstDayOfMonth,
      lastDayOfMonth,
      vacations,
    );

    const officeDays = days.filter((day) => day.officeMinutes > 0).length;

    const homeofficeDays = days.filter(
      (day) => day.homeofficeMinutes > 0,
    ).length;

    const businessTripDays = days.filter(
      (day) => day.businessTripMinutes > 0,
    ).length;

    const sickMinutes = days.reduce((total, day) => total + day.sickMinutes, 0);

    const deficitMinutes = Math.max(
      0,
      targetMinutes - totalWorkMinutes - sickMinutes,
    );

    const overtimeMinutes = Math.max(
      0,
      totalWorkMinutes + sickMinutes - targetMinutes,
    );

    return {
      month,
      year,
      days,

      totalWorkMinutes,
      totalPauseMinutes,

      targetMinutes,
      overtimeMinutes,
      deficitMinutes,
      sickMinutes,

      officeMinutes,
      homeofficeMinutes,
      businessTripMinutes,

      officeDays,
      homeofficeDays,
      businessTripDays,
    };
  }

  /**
   * ==============================
   * Jahresbericht
   * ==============================
   */
  async getYearlyReport(year: number, userId: string): Promise<YearlyReport> {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Bei einem laufenden Jahr nur bis zum aktuellen Monat rechnen.
    // Vergangene Jahre enthalten alle 12 Monate.
    const lastMonth = year === currentYear ? currentMonth : 12;

    const months: MonthlyReport[] = [];

    for (let month = 1; month <= 12; month++) {
      if (month <= lastMonth) {
        const monthlyReport = await this.getMonthlyReport(month, year, userId);

        months.push(monthlyReport);
      } else {
        // Zukünftige Monate werden im Jahresbericht mit 0 dargestellt.
        months.push({
          month,
          year,

          days: [],

          totalWorkMinutes: 0,
          totalPauseMinutes: 0,

          targetMinutes: 0,
          overtimeMinutes: 0,
          deficitMinutes: 0,
          sickMinutes: 0,

          officeMinutes: 0,
          homeofficeMinutes: 0,
          businessTripMinutes: 0,
          officeDays: 0,
          homeofficeDays: 0,
          businessTripDays: 0,
        });
      }
    }

    const totalWorkMinutes = months.reduce(
      (total, month) => total + month.totalWorkMinutes,
      0,
    );

    const totalPauseMinutes = months.reduce(
      (total, month) => total + month.totalPauseMinutes,
      0,
    );

    const targetMinutes = months.reduce(
      (total, month) => total + month.targetMinutes,
      0,
    );

    const overtimeMinutes = months.reduce(
      (total, month) => total + month.overtimeMinutes,
      0,
    );

    const deficitMinutes = months.reduce(
      (total, month) => total + month.deficitMinutes,
      0,
    );

    const sickMinutes = months.reduce(
      (total, month) => total + month.sickMinutes,
      0,
    );

    const officeMinutes = months.reduce(
      (total, month) => total + month.officeMinutes,
      0,
    );

    const homeofficeMinutes = months.reduce(
      (total, month) => total + month.homeofficeMinutes,
      0,
    );

    const businessTripMinutes = months.reduce(
      (total, month) => total + month.businessTripMinutes,
      0,
    );

    const officeDays = months.reduce(
      (total, month) => total + month.officeDays,
      0,
    );

    const homeofficeDays = months.reduce(
      (total, month) => total + month.homeofficeDays,
      0,
    );

    const businessTripDays = months.reduce(
      (total, month) => total + (month.businessTripDays ?? 0),
      0,
    );

    return {
      year,

      totalWorkMinutes,
      totalPauseMinutes,

      targetMinutes,
      overtimeMinutes,
      deficitMinutes,
      sickMinutes,

      officeMinutes,
      homeofficeMinutes,
      businessTripMinutes,

      officeDays,
      homeofficeDays,
      businessTripDays,

      months,
    };
  }

  /**
   * ==============================
   * Überstunden berechnen
   * ==============================
   */
  calculateOvertime(workedMinutes: number, targetMinutes: number): number {
    if (!Number.isFinite(workedMinutes) || !Number.isFinite(targetMinutes)) {
      return 0;
    }

    return Math.max(0, workedMinutes - targetMinutes);
  }

  formatMinutesAsWorkDays(minutes: number, dailyTargetMinutes: number): string {
    if (
      !Number.isFinite(minutes) ||
      !Number.isFinite(dailyTargetMinutes) ||
      dailyTargetMinutes <= 0
    ) {
      return "0h 00min";
    }

    const days = Math.floor(minutes / dailyTargetMinutes);
    const remainingMinutes = Math.round(minutes - days * dailyTargetMinutes);
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;

    if (days > 0) {
      return `${days} Tag${days !== 1 ? "e" : ""} ${hours}h ${mins
        .toString()
        .padStart(2, "0")}min`;
    }

    return `${hours}h ${mins.toString().padStart(2, "0")}min`;
  }

  /**
   * ==============================
   * Arbeitstage eines Monats
   * ==============================
   */
  private getWorkingDaysInMonth(month: number, year: number): string[] {
    const dates: string[] = [];

    const date = new Date(year, month - 1, 1);

    while (date.getMonth() === month - 1) {
      const day = date.getDay();

      if (day >= 1 && day <= 5) {
        const yearString = date.getFullYear();

        const monthString = String(date.getMonth() + 1).padStart(2, "0");

        const dayString = String(date.getDate()).padStart(2, "0");

        dates.push(`${yearString}-${monthString}-${dayString}`);
      }

      date.setDate(date.getDate() + 1);
    }

    return dates;
  }

  /**
   * ==============================
   * Minuten formatieren
   * ==============================
   */
  formatMinutes(minutes: number): string {
    if (!Number.isFinite(minutes)) {
      return "0h 00min";
    }

    const safeMinutes = Math.max(0, Math.round(minutes));

    const hours = Math.floor(safeMinutes / 60);

    const mins = safeMinutes % 60;

    return `${hours}h ${mins.toString().padStart(2, "0")}min`;
  }

  /**
   * ==============================
   * Monatsnamen
   * ==============================
   */
  formatMonth(month: number): string {
    const months = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];

    return months[month - 1] ?? "";
  }

  /**
   * ==============================
   * ISO-Kalenderwoche
   * ==============================
   */
  getWeekNumber(date: Date): number {
    const d = new Date(date);

    d.setHours(0, 0, 0, 0);

    d.setDate(d.getDate() + 4 - (d.getDay() || 7));

    const yearStart = new Date(d.getFullYear(), 0, 1);

    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * ==============================
   * ISO-Jahr
   * ==============================
   */
  getISOWeekYear(date: Date): number {
    const d = new Date(date);

    d.setHours(0, 0, 0, 0);

    d.setDate(d.getDate() + 4 - (d.getDay() || 7));

    return d.getFullYear();
  }

  /**
   * ==============================
   * Zeitraum Kalenderwoche
   * ==============================
   */
  formatWeekRange(week: number, year: number): string {
    const january4 = new Date(year, 0, 4);

    const dayOfWeek = january4.getDay() || 7;

    const mondayWeek1 = new Date(january4);

    mondayWeek1.setDate(january4.getDate() - dayOfWeek + 1);

    const monday = new Date(mondayWeek1);

    monday.setDate(mondayWeek1.getDate() + (week - 1) * 7);

    const sunday = new Date(monday);

    sunday.setDate(monday.getDate() + 6);

    const formatDate = (date: Date): string => {
      return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };

    return `${formatDate(monday)} – ${formatDate(sunday)}`;
  }

  /**
   * ==============================
   * Prüfen, ob ein Datum Urlaub ist
   * ==============================
   */
  private isVacationDay(date: string, vacations: Vacation[]): boolean {
    return vacations.some(
      (vacation) =>
        vacation.status === "approved" &&
        date >= vacation.startDate &&
        date <= vacation.endDate,
    );
  }

  /**
   * ==============================
   * DailyReports erzeugen
   * ==============================
   */
  private createDailyReports(
    sessions: WorkSession[],
    dailyTargetMinutes: number,
    federalState: string,
    startDate: Date,
    endDate: Date,
    vacations: Vacation[],
  ): DailyReport[] {
    const grouped = new Map<string, WorkSession[]>();

    for (const session of sessions) {
      const existing = grouped.get(session.date);

      if (existing) {
        existing.push(session);
      } else {
        grouped.set(session.date, [session]);
      }
    }

    const reports: DailyReport[] = [];

    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const date = [
        currentDate.getFullYear(),
        String(currentDate.getMonth() + 1).padStart(2, "0"),
        String(currentDate.getDate()).padStart(2, "0"),
      ].join("-");

      const daySessions = grouped.get(date) ?? [];

      const totalWorkMinutes = this.sumMinutes(daySessions, "totalWorkMinutes");

      const totalPauseMinutes = this.sumMinutes(
        daySessions,
        "totalPauseMinutes",
      );

      const officeMinutes = this.sumWorkLocation(daySessions, "office");

      const homeofficeMinutes = this.sumWorkLocation(daySessions, "homeoffice");

      const businessTripMinutes = this.sumWorkLocation(
        daySessions,
        "business_trip",
      );

      const businessTripDays = businessTripMinutes > 0 ? 1 : 0;

      const dateObject = new Date(date);

      const dayOfWeek = dateObject.getDay();

      const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;

      const holidays = getHolidaysForYear(
        dateObject.getFullYear(),
        federalState,
      );

      const holiday = holidays.find((holiday) => holiday.date === date);

      const isHoliday = Boolean(holiday);

      const holidayName = holiday?.name;

      const hasSickDay = daySessions.some(
        (session) => session.status === "sick",
      );

      const isVacation = this.isVacationDay(date, vacations);
      const isApprovedVacation = isVacation;

      if (isVacation) {
        console.log("VACATION DAY:", {
          date,
          vacations,
        });
      }

      const targetMinutes =
        isWorkingDay && !isHoliday && !isVacation
          ? Math.round(dailyTargetMinutes)
          : 0;

      const status =
        isVacation && isWorkingDay && !isHoliday
          ? "vacation"
          : hasSickDay
            ? "sick"
            : isHoliday
              ? "publicHoliday"
              : !isWorkingDay
                ? "weekend"
                : "work";

      const overtimeMinutes = hasSickDay
        ? 0
        : !isWorkingDay && totalWorkMinutes > 0
          ? totalWorkMinutes
          : Math.max(0, totalWorkMinutes - targetMinutes);

      console.log("DAILY REPORT DEBUG:", {
        date,
        isWorkingDay,
        isHoliday,
        hasSickDay,
        targetMinutes,
        totalWorkMinutes,
        overtimeMinutes,
      });

      const deficitMinutes =
        hasSickDay || isVacation
          ? 0
          : isWorkingDay
            ? Math.max(0, targetMinutes - totalWorkMinutes)
            : 0;

      const sickMinutes = hasSickDay ? targetMinutes : 0;

      reports.push({
        date,
        status,
        sessions: daySessions,

        totalWorkMinutes,
        totalPauseMinutes,

        targetMinutes,
        overtimeMinutes,
        deficitMinutes,

        isHoliday,
        isApprovedVacation,
        holidayName,
        sickMinutes,

        officeMinutes,
        homeofficeMinutes,

        businessTripMinutes,
        businessTripDays,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return reports;
  }

  /**
   * ==============================
   * Minuten summieren
   * ==============================
   */
  private sumMinutes(
    sessions: WorkSession[],
    field: "totalWorkMinutes" | "totalPauseMinutes",
  ): number {
    return sessions.reduce((sum, session) => sum + (session[field] ?? 0), 0);
  }

  /**
   * ==============================
   * Arbeitszeit nach Arbeitsort
   * ==============================
   */
  private sumWorkLocation(
    sessions: WorkSession[],
    location: "office" | "homeoffice" | "business_trip",
  ): number {
    return sessions
      .filter((session) => session.workLocation === location)
      .reduce((sum, session) => sum + (session.totalWorkMinutes ?? 0), 0);
  }
}

export const reportService = new ReportService();
