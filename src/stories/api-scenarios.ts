/** Story-only synthetic responses. No production transport or records are used. */
export interface StoryApiRoute {
  path: string;
  method?: string;
  status?: number;
  response: unknown;
  delayMs?: number;
}
