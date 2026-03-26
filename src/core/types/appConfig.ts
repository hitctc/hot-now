export type RuntimeConfig = {
  server: { port: number };
  schedule: { enabled: boolean; dailyTime: string; timezone: string };
  report: { topN: number; dataDir: string; allowDegraded: boolean };
  source: { rssUrl: string };
  manualRun: { enabled: boolean };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    to: string;
    baseUrl: string;
  };
};
