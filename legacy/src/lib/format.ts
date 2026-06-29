export function fmt(n: number): string {
  const neg = n < 0;
  const v = Math.round(Math.abs(n));
  return (neg ? "-" : "") + v.toLocaleString("is-IS") + " kr.";
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm)]} ${y}`;
}
