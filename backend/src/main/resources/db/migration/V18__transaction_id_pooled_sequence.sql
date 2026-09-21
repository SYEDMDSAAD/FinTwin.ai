-- Transaction ids come from a pooled sequence (allocationSize = 50 in
-- Transaction.java) so Hibernate can batch inserts: a statement import went
-- from one database round trip per row to one per 50 rows.
--
-- The sequence now hands out blocks of 50. Existing ids are untouched; the
-- next block starts above the current value, so nothing can collide. The
-- column's DEFAULT nextval still works for any insert outside Hibernate.
ALTER SEQUENCE transaction_id_seq INCREMENT BY 50;
