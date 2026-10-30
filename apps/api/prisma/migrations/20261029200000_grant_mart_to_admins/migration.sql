INSERT INTO "member_businesses" ("memberId", "business")
SELECT m."id", 'mart'::"Business"
FROM "members" AS m
WHERE m."role" = 'admin'::"Role"
ON CONFLICT DO NOTHING;
