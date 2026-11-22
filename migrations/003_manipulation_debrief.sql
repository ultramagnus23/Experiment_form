-- Manipulation checks (3 x 4-point Likert + attention check) and the debrief, shown after the trial decision.
-- Additive only: existing rows keep NULLs (they were completed before these pages existed).
ALTER TABLE participants
  ADD COLUMN manip_distraction smallint CHECK (manip_distraction BETWEEN 1 AND 4),
  ADD COLUMN manip_talking     smallint CHECK (manip_talking BETWEEN 1 AND 4),
  ADD COLUMN manip_positive    smallint CHECK (manip_positive BETWEEN 1 AND 4),
  ADD COLUMN attention_answer  text CHECK (attention_answer IN ('a','b','c','d')),
  ADD COLUMN manip_at          timestamptz,
  ADD COLUMN debrief_at        timestamptz;
