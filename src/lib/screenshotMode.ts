/** Alleen aan tijdens lokale schermfoto's (`EXPO_PUBLIC_SCREENSHOTS=1`). Staat uit in een gewone build. */
export const screenshotMode = process.env.EXPO_PUBLIC_SCREENSHOTS === '1';
