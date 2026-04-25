-- Cleanup: any rows that got saved with permit_certainty = 'confirmed' from
-- the old admin dropdown should be normalized to 'verified' so they render
-- correctly on the public explore detail panel. PERMIT_CFG only knows how
-- to display verified / likely / unknown.

update public.locations
   set permit_certainty = 'verified'
 where permit_certainty = 'confirmed';
