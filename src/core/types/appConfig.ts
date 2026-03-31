export type CollectionScheduleConfig = {
  enabled: boolean;
  intervalMinutes: number;
};

export type MailScheduleConfig = {
  enabled: boolean;
  dailyTime: string;
  timezone: string;
};

export type ManualActionsConfig = {
  collectEnabled: boolean;
  sendLatestEmailEnabled: boolean;
};

export type RuntimeConfig = {
  server: { port: number };
  collectionSchedule: CollectionScheduleConfig;
  mailSchedule: MailScheduleConfig;
  manualActions: ManualActionsConfig;
  report: { topN: number; dataDir: string; allowDegraded: boolean };
  source: { rssUrl: string };
  database: { file: string };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    to: string;
    baseUrl: string;
  };
  auth: {
    username: string;
    password: string;
    sessionSecret: string;
  };
  llm?: {
    // The workbench can persist provider API keys only when a local master key is available,
    // so runtime config keeps this value nullable instead of making startup depend on it.
    settingsMasterKey: string | null;
  };
};
