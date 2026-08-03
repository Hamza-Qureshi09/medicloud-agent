import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}



export function duration(ms: number) {
  const minutes = ms / 60_000 // 60 sec = 1 min
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`
}