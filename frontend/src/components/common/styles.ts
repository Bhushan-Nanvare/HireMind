// Shared Tailwind class lists, so buttons and form fields look the same on every page

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonPrimary = `${buttonBase} bg-slate-900 text-white hover:bg-slate-700`;
export const buttonSecondary = `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
export const buttonSuccess = `${buttonBase} border border-green-200 bg-green-50 text-green-700 hover:bg-green-100`;
export const buttonDanger = `${buttonBase} border border-red-200 bg-white text-red-600 hover:bg-red-50`;

export const inputClass =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
export const labelClass = "mb-1 block text-sm font-medium text-slate-700";
