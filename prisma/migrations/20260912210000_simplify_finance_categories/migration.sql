-- AlterEnum
ALTER TYPE "FinanceCategory" RENAME TO "FinanceCategory_old";

CREATE TYPE "FinanceCategory" AS ENUM ('MAINTENANCE', 'SALARY', 'OTHER');

ALTER TABLE "finance_entries"
  ALTER COLUMN "category" TYPE "FinanceCategory"
  USING (
    CASE
      WHEN "category"::text = 'MAINTENANCE' THEN 'MAINTENANCE'::"FinanceCategory"
      WHEN "category"::text = 'SALARY' THEN 'SALARY'::"FinanceCategory"
      ELSE 'OTHER'::"FinanceCategory"
    END
  );

DROP TYPE "FinanceCategory_old";
