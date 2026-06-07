import { z } from "zod";

export const attachmentInputSchema = z.union([
  z.string(),
  z.object({
    path: z.string(),
    inline: z.boolean().optional(),
    cid: z.string().optional(),
  }),
]);
