AGENTS.md — ENGINEERING RULES

PURPOSE

This repository is early-stage and pre-MVP.
There are no external consumers and no compatibility guarantees.

Optimise for the simplest correct design.
Treat complexity, duplication, stale structure, and speculative abstraction as defects.

Write code when code is needed.
Do not avoid necessary implementation work by hiding behind refactoring advice.


CORE RULES

1) Complexity is a bug
Every extra line, branch, abstraction, wrapper, and module adds maintenance cost.

Prefer changes that reduce:
- moving parts
- special cases
- indirection
- abstraction depth
- mental overhead

2) Duplication is a bug
Do not keep duplicate logic, duplicate models, or near-copy implementations.

Aim for:
- one responsibility in one place
- one canonical model per concept
- one code path per behaviour

3) Legacy structure has no special status
There is no backwards-compatibility requirement.

If the current design is wrong:
- replace it
- remove the old code
- update callers
- complete the cutover

Do not:
- add shims or compatibility layers
- preserve obsolete paths
- leave old and new implementations running in parallel

4) Structural honesty is mandatory
Files, folders, modules, and namespaces must reflect real responsibilities.

If the current structure lies, fix it.

When needed:
- split mixed-responsibility files
- move code to the correct module or folder
- rename modules, types, and namespaces to match actual behaviour
- reshape folders to reflect real subsystem boundaries

Do not leave structural problems in place just because the code still works.
Do not avoid necessary moves, renames, splits, deletions, or rewrites merely to keep diffs small.

5) Write new code when that is the simplest correct solution
Do not contort existing code to avoid adding a small amount of well-placed new code.

Prefer:
- small new implementations in the correct place
- direct fixes over clever reuse
- explicit code over fragile abstraction

Do not:
- stretch an abstraction past its natural scope
- force unrelated responsibilities into an existing file
- refuse to implement required behaviour because deletion or refactoring was possible elsewhere

The goal is the simplest correct system, not the fewest added lines.

6) Prefer direct design
Do not introduce frameworks, patterns, or layers unless they clearly simplify the current system.

Avoid:
- pass-through wrappers
- helpers with no real ownership
- manager/provider/service/facade stacks that only forward calls
- configuration switches for obsolete behaviour
- speculative extension points

Prefer:
- direct ownership
- explicit control flow
- shallow call chains
- clear boundaries


DEFAULT CHANGE ORDER

When making a change, evaluate options in this order:

1. DELETE
2. CONSOLIDATE
3. SIMPLIFY
4. MOVE CODE TO THE CORRECT PLACE
5. EXTEND EXISTING CODE WHERE THE RESPONSIBILITY CLEARLY BELONGS
6. WRITE NEW CODE IN THE CORRECT PLACE WHEN NEEDED

Generalise only when:
- duplication is real
- the shared behaviour is stable
- the abstraction makes the system simpler

Do not generalise for hypothetical future reuse.


REFACTOR TRIGGERS

Refactor promptly when:
- a file has multiple unrelated reasons to change
- a file mixes different lifecycles, policies, or state models
- a folder becomes a junk drawer
- a namespace no longer matches the domain
- transport code starts owning domain assembly or view-model construction
- a test file no longer maps failures cleanly to one subsystem
- code remains in its current location only because that is where it started

When touching a file that is already structurally dishonest, do not extend it further without either:
- refactoring it in the same change, or
- explicitly stating why deferral is justified


GLOSSARY DISCIPLINE

`GLOSSARY.md` is the canonical terminology file for the repository.

Use it for stable names of:
- domain concepts
- entities
- field names
- enum values
- event names
- API/property names
- schema terms
- other repeated technical or business terms that must remain consistent

Rules:
- When introducing or renaming a canonical term, update `GLOSSARY.md` in the same change
- Code, docs, schemas, and tests must align with `GLOSSARY.md`
- Do not invent alternate names for glossary terms without updating the glossary and migrating usages

If asked to modify `GLOSSARY.md`, treat that as a terminology migration request, not a local document edit.

That means:
1. identify affected usages
2. update code, types, schemas, docs, tests, and interfaces as appropriate
3. remove old terminology
4. complete the cutover cleanly

If the requested glossary change implies a broad, risky, or architectural migration:
1. explain the impact
2. identify affected areas
3. propose the migration
4. request approval

For tasks involving domain models, contracts, schemas, or naming:
- consult `GLOSSARY.md` first
- check for terminology drift in the area being changed
- align local code to the glossary where practical

Do not perform a full-repository glossary audit for every request.
Use targeted checks in the area being changed.

If you discover glossary drift outside the immediate task area, note it explicitly; fix it only if it is low-risk and directly related to the current change.


MODULE RULES

Extend an existing module only if the behaviour is already part of that module's natural responsibility.

Create a new module only when:
- the responsibility is distinct
- the lifecycle is different
- separation reduces coupling
- ownership becomes clearer

Do not create new modules for:
- aesthetic symmetry
- speculative future use
- hiding poor boundaries
- avoiding a necessary refactor


MIGRATIONS

Prefer complete cutovers over transitional hybrids.

When replacing a design:
- keep one source of truth
- remove obsolete code promptly
- update callers directly
- avoid temporary dual-path behaviour unless absolutely necessary

If temporary coexistence is unavoidable, it must be:
- short-lived
- explicit
- contained
- removed as soon as the cutover is complete


CONSISTENCY

Follow useful existing conventions.
Do not preserve bad conventions.

If an existing convention causes confusion, duplication, or indirection:
- replace it with a simpler convention
- apply the change consistently

Use consistent terminology.
Do not invent new names for existing concepts.


MAJOR ARCHITECTURAL CHANGES

Do not immediately implement changes that would materially reshape the project, such as:
- rewriting core architecture
- replacing a major subsystem
- changing fundamental domain boundaries
- introducing a new top-level architectural pattern
- restructuring many unrelated modules in one change

For these cases:
1. explain what is wrong with the current structure
2. propose the new structure
3. explain why it is simpler
4. identify the main affected areas
5. request approval before proceeding

Do not request approval for:
- local refactors
- deleting dead code
- consolidating duplicates
- splitting files for clarity
- moving code to the correct module
- renaming namespaces or modules for correctness
- contained folder cleanup
- targeted terminology migrations aligned to `GLOSSARY.md`


REQUIRED CHECKS BEFORE CHANGING CODE

Before implementing:
1. identify the module(s) involved
2. check whether code can be deleted
3. check whether duplication can be removed
4. check whether the code is in the right file, folder, and namespace
5. if the task touches canonical terms, read `GLOSSARY.md`
6. confirm the final location is the natural owner
7. avoid adding abstraction unless it clearly reduces complexity

Do not use these checks as an excuse to avoid writing the required code.


REQUIRED CHECKS AFTER CHANGING CODE

After implementing, report:
- files modified
- files created
- files deleted
- code removed or consolidated
- structural changes made
- glossary terms added, changed, or migrated
- any new complexity introduced
- why the result is simpler


FINAL TEST

Before finalising, ask:
- Did this remove unnecessary complexity?
- Did this reduce duplication?
- Did this improve structural honesty?
- Did this place behaviour in the correct module?
- Did this keep terminology aligned with `GLOSSARY.md`?
- Did this avoid special-case creep?
- Did this make the codebase easier to understand?

If not, reconsider the change.