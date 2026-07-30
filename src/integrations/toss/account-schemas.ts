import { z } from "zod";

export const tossAccountSchema = z.looseObject({
  accountNo: z.string().regex(/^\d{11}$/),
  accountSeq: z.number().int().safe().positive(),
  accountType: z.string().min(1).max(128),
});

export const tossAccountListSchema = z.array(tossAccountSchema);

export type TossAccount = z.infer<typeof tossAccountSchema>;
