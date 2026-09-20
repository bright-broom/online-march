/** Operations: backups and automation health. Values here are read by src/server/services/*. */
export const opsConfig = {
  backup: {
    /** Blob prefix inside the private backup store. */
    folder: "db-backups",
    /** Older backups are deleted after each successful run. */
    keepDays: 14,
    /** A dump smaller than this means the export went wrong (empty DB, failed query). */
    minBytes: 1024,
  },
} as const;
