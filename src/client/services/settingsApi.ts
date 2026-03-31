import { HttpError, requestJson } from "./http";

export type SettingsProfile = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
  loggedIn: boolean;
};

export type SettingsProfileResponse = {
  profile: SettingsProfile | null;
};

export type SettingsViewRulesResponse = Record<string, unknown>;
export type SettingsSourcesResponse = Record<string, unknown>;

// 读取当前登录用户摘要，401 代表匿名访问或会话失效，调用方可以把它当作“未登录”。
export async function readSettingsProfile(): Promise<SettingsProfile | null> {
  try {
    const response = await requestJson<SettingsProfileResponse>("/api/settings/profile");
    return response.profile;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

// 预留给后续系统页工作区的数据读取接口，当前只做最小签名，不提前绑定业务视图。
export function readSettingsViewRules(): Promise<SettingsViewRulesResponse> {
  return requestJson<SettingsViewRulesResponse>("/api/settings/view-rules");
}

// 预留给后续系统页工作区的数据读取接口，当前只做最小签名，不提前绑定业务视图。
export function readSettingsSources(): Promise<SettingsSourcesResponse> {
  return requestJson<SettingsSourcesResponse>("/api/settings/sources");
}
