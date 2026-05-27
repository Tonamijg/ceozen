import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Fusionne les classes Tailwind sans conflits */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate un montant en FCFA */
export function formatCFA(amount: number, compact = false): string {
  if (compact && amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1) + ' M FCFA';
  }
  if (compact && amount >= 1_000) {
    return (amount / 1_000).toFixed(0) + ' k FCFA';
  }
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Formate une date en français */
export function formatDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }
): string {
  return new Intl.DateTimeFormat('fr-FR', options).format(
    typeof date === 'string' ? new Date(date) : date
  );
}

/** Formate une date + heure */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date);
}

/** Calcule la variation en % entre deux valeurs */
export function calcVariation(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/** Génère une couleur pour un badge selon le statut stock */
export function stockStatusColor(qty: number, min: number): string {
  if (qty === 0) return 'red';
  if (qty <= min) return 'orange';
  return 'green';
}

/**
 * Retourne la date locale au format YYYY-MM-DD (timezone-safe).
 * Contrairement à toISOString().split('T')[0] qui est en UTC,
 * cette fonction respecte le fuseau horaire du client.
 */
export function localDateStr(d: Date = new Date()): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Debounce simple */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
