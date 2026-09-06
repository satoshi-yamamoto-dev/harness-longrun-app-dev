# Calibration examples

These are human-authored provisional anchors, not measured human/model agreement.
Always evaluate the actual app; do not copy these scores without matching evidence.

| Observation | Expected scoring direction | Verdict |
| --- | --- | --- |
| Primary Complete control never changes task state after repeated clicks; live snapshot confirms unchanged state | functionality 0–3; UI functionality 0–3; report reproducible issue | FAIL |
| New task appears, but reload loses it and localStorage remains empty despite a persistence requirement | functionality 4–7 or lower; productDepth below 8 if stored task history is core | FAIL |
| All required workflows work, but narrow viewport clips the only submit control | craft below 8; UI functionality below 8; screenshot and interaction evidence required | FAIL |
| Coherent UI and verified required flows, all eight applicable scores >= configured thresholds, no unresolved issue and complete evidence | Each dimension justified independently with observed evidence | PASS |
| Browser cannot start or primary flow was not tested | Do not fabricate a score or screenshot; blocked execution or not-tested and FAIL | No PASS |

These examples do not describe the current target's expected defects. Determine
whether any example applies from current observations; do not assume faults exist.
