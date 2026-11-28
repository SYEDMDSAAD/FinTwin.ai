/** Joins class names, skipping falsy ones. */
export const cx = (...parts) => parts.filter(Boolean).join(" ");
