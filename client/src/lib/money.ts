const formatter = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });

export function money(kopecks: number) {
  return formatter.format(kopecks / 100);
}
