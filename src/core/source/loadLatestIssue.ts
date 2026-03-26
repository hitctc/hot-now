import { RuntimeConfig } from "../types/appConfig.js";
import { parseJuyaIssue } from "./parseJuyaIssue.js";

export async function loadLatestIssue(config: RuntimeConfig) {
  const response = await fetch(config.source.rssUrl);

  if (!response.ok) {
    throw new Error(`RSS request failed with ${response.status}`);
  }

  const xml = await response.text();
  return parseJuyaIssue(xml);
}
