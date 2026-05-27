const { z } = require("zod");

const createTaskCategorySchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1).default("#84cc16"),
  icon: z.string().min(1).default("cursor"),
  status: z.enum(["active", "archived"]).default("active"),
});

const updateTaskCategorySchema = createTaskCategorySchema.partial();

module.exports = { createTaskCategorySchema, updateTaskCategorySchema };
