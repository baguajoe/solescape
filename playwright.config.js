import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Runs the built site on Flask in demo mode (no Stripe) with a throwaway database.
// Build first: npm run build
const PORT = 5055;
const DB = path.resolve('test-results/e2e.db');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // tests share one database and calendar
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `mkdir -p test-results && rm -f ${DB} && pipenv run flask --app api.app:create_app run --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_ENV: 'development',
      DATABASE_URL: `sqlite:///${DB}`,
      ADMIN_PASSWORD: 'e2e-password',
      PUBLIC_URL: `http://127.0.0.1:${PORT}`,
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      SMTP_HOST: '',
      RATELIMIT_ENABLED: 'false',
    },
  },
});
