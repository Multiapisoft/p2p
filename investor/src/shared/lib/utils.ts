import axios from 'axios';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'INR') {
  const code = (currency || 'INR').toUpperCase();
  if (code === 'USDT') {
    return `${Number(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })} USDT`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export function apiErrorMessage(error: unknown, fallback = 'Something went wrong') {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (!error.response || status === 502 || status === 503 || status === 504) {
      return 'Server temporarily unavailable. Please try again in a moment.';
    }
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) return msg.join(', ');
    if (status === 413) return 'Upload is too large. Use a smaller file.';
  }
  if (error instanceof Error && error.message) {
    if (/status code 50[234]/i.test(error.message) || /network error/i.test(error.message)) {
      return 'Server temporarily unavailable. Please try again in a moment.';
    }
    return error.message;
  }
  return fallback;
}
