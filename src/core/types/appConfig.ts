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
};
