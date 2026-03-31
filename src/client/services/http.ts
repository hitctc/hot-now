export class HttpError extends Error {
  public readonly status: number;

  public readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

// 统一把响应体整理成 JSON、纯文本或 null，方便上层在报错和空响应时共用一套分支。
async function readResponseBody(response: Response): Promise<unknown> {
  const textBody = await response.text();

  if (!textBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(textBody) as unknown;
  } catch {
    return textBody;
  }
}

// 统一处理同源 JSON 请求，默认带上 cookie，并在非 2xx 时抛出带状态码的错误。
export async function requestJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new HttpError(`Request failed for ${input}`, response.status, body);
  }

  return body as T;
}
