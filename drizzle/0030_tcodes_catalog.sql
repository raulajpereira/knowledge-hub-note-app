-- New standard transaction catalogue (Basis, ABAP, HCM, MM, FI): every
-- tenant's list is cleared (also the Trash; favourites and usage go with it by
-- cascade) and is given the new catalogue the next time Transações is opened.
DELETE FROM "sap_tcodes";
