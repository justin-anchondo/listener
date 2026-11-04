// Light or dark, remembered per device in a cookie so the server renders the
// right theme on the first paint (no flash). Not client data.

export const THEME_COOKIE = "listener_theme";
export type Theme = "light" | "dark";

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
}
