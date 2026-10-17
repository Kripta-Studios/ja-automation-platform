/** Launch the repository Playwright browser, with an optional pinned system Chromium. */
export function launchManualChromium(chromium, overrides = {}) {
  const executablePath = process.env.JA_MANUAL_CHROMIUM_EXECUTABLE_PATH;
  const defaultArgs = process.getuid?.() === 0 ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
  return chromium.launch({
    headless: true,
    ...overrides,
    ...(executablePath ? { executablePath } : {}),
    args: [...defaultArgs, ...(overrides.args ?? [])],
  });
}
