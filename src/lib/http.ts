export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export interface ErrorBody {
  error: string;
}
