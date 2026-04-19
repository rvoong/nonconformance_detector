import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const dateShortOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
};
const timeShortOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
};
const dateLongOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
};

/** Format ISO date string or Date for short display (e.g. "Mar 3, 2025"). */
export function formatDateShort(isoOrDate: string | Date): string {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    return d.toLocaleDateString("en-US", dateShortOpts);
}

/** Format ISO date string or Date for time only (e.g. "2:30 PM"). */
export function formatTimeShort(isoOrDate: string | Date): string {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    return d.toLocaleTimeString("en-US", timeShortOpts);
}

/** Format ISO date string or Date for long display (e.g. "March 3, 2025"). */
export function formatDateLong(isoOrDate: string | Date): string {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    return d.toLocaleDateString("en-US", dateLongOpts);
}
