INSERT INTO "property_settings" (
    "id",
    "propertyId",
    "late_fee_enabled",
    "late_fee_type",
    "late_fee_amount",
    "late_fee_grace_days",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    "id",
    false,
    'FIXED',
    0,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "properties"
WHERE "id" NOT IN (
    SELECT "propertyId" FROM "property_settings"
);
