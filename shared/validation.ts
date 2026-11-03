import { z } from "zod";

export const idSchema = z.union([
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^(?:[1-9]\d*|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i),
]).transform(String);
export const phoneSchema = z.string().trim().max(20);
export const moneySchema = z.number().int().min(0).max(2_147_483_647);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date");
export const instantSchema = z.string().datetime({ offset: true });
export const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
