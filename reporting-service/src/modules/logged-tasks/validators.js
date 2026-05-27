const { z } = require("zod");

const createLoggedTaskSchema = z.object({
  category_id: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  impact_level: z.enum(["low", "medium", "high"]).default("medium"),
  tags: z.array(z.string()).default([]),
  task_date: z.coerce.date(),
  author_name: z.string().default(""),
  source: z.enum(["manual", "import"]).default("manual"),
  metadata: z.record(z.any()).default({}),
});

const updateLoggedTaskSchema = createLoggedTaskSchema.partial();

const listLoggedTaskQuerySchema = z.object({
  start_at: z.coerce.date().optional(),
  end_at: z.coerce.date().optional(),
  category_id: z.string().optional(),
});

module.exports = { createLoggedTaskSchema, updateLoggedTaskSchema, listLoggedTaskQuerySchema };
