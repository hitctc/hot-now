import { RuntimeConfig } from "../types/appConfig.js";
import { parseJuyaIssue } from "./parseJuyaIssue.js";

export async function loadLatestIssue(config: RuntimeConfig) {
  const response = await fetch(config.source.rssUrl);

  // The feed loader only accepts a full 200 response so partial/empty bodies fail fast.
  if (response.status !== 200) {
    throw new Error(`RSS request failed with ${response.status}`);
  }

  const xml = await response.text();
  return parseJuyaIssue(xml);
}
