export function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE");
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}