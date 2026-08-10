# YOB Frontend Change Workflow

## Purpose

This document defines how future AI-assisted changes should be made after the master application exists.

The goal is fast change without architectural drift.

## 1. Classify the change before editing

Use the smallest category that fits:

```text
visual/style change
shell/layout change
reusable design change
reusable widget change
domain page/part change
domain behavior change
new domain
API contract change
foundation/session/network change
```

Do not turn a simple source edit into a new abstraction.

## 2. Where changes belong

### Visual/style change

Examples:

- colors
- spacing
- typography
- card appearance
- responsive arrangement

Change HTML/Tailwind/CSS directly in the owner.
Do not add a configuration property.

### Shell/layout change

Examples:

- navigation under logo
- sidebar instead of horizontal nav
- different footer arrangement

Edit `shells/` composition and reusable shell pieces.
Do not build a layout selector unless the same copied project genuinely needs multiple live layouts.

### Reusable design change

Examples:

- button interaction
- autocomplete keyboard behavior
- dialog focus handling

Change `design/` and test all known consumers.

### Reusable functional change

Examples:

- customer search behavior
- country selector
- reusable address picker

Change `widgets/` and test consumers.

### Domain change

Examples:

- new cart display
- catalog filter
- order detail change

Change the relevant domain page/part/state/data.

### New domain

Examples:

- documents
- events
- support requests

Create a new domain with only the structure it actually needs.
Follow an existing mature domain such as Catalog rather than inventing a parallel architecture.

### API contract change

First update/reference the contract, then types/data code, then state/pages, then mocks/tests.
Never update only the mock and forget the real API path.

### Foundation change

Treat session/network/error changes as high-impact.
Run broader regression because every domain can be affected.

## 3. Reuse decision

Before creating something new, ask:

```text
Does design/ already provide the generic control?
Does widgets/ already provide the reusable behavior?
Does the current domain already have a reusable part?
Can an existing item be extended cleanly without becoming confusing?
```

Reuse is preferred when responsibilities remain clear.
Duplication may be temporarily better than forcing two genuinely different behaviors into one impossible abstraction.

## 4. Promotion rule

Start specific, then promote when reuse is proven.

Example:

```text
catalog item-specific fragment
-> domains/catalog/parts
```

If later used broadly and still business-aware:

```text
-> widgets/
```

If it becomes purely visual/general:

```text
-> design/
```

Do not predict reuse years in advance.

## 5. API-backed widget rule

A reusable widget such as customer search may own a small focused data/API file if that lookup belongs to the widget.

Do not make a page pass raw HttpClient/network logic into the widget.

If the same underlying business data API becomes widely useful outside UI widgets, refactor deliberately at that time rather than creating a global data framework upfront.

## 6. AI pre-change checklist

Before Claude edits a meaningful feature, ask it to report:

```text
CONFIRMED
- facts from code/docs/API/user request

ASSUMPTIONS
- inferences required to proceed

OPEN
- unknowns that materially affect correctness

SCOPE
- files/areas expected to change

OUT OF SCOPE
- nearby work intentionally not being changed
```

Do not require this ceremony for tiny obvious CSS/text edits.

## 7. AI implementation rule

Prompt Claude to:

1. inspect existing similar code
2. reuse established patterns
3. avoid unrelated refactoring
4. implement the requested change
5. add/update tests
6. run relevant tests
7. run production build
8. run relevant E2E
9. summarize changes and risks

## 8. Minor change prompt template

```text
Read CLAUDE.md and inspect the existing implementation related to this request.

Request:
<describe the change>

Make the smallest clean change that follows the existing architecture.
Do not introduce configuration or abstractions unless the current code clearly needs them.
Reuse existing design/widgets/domain parts before creating new ones.

After editing:
- run affected tests
- run the production build
- report files changed and any risk/regression area
```

## 9. New widget prompt template

```text
We need reusable functional UI for:
<behavior>

First inspect design/, widgets/, and related domain code to confirm it does not already exist.

If a new widget is justified:
- place it under widgets/
- reuse generic controls from design/
- keep its public API small and typed
- keep API/data behavior focused
- support loading/empty/error/disabled states where relevant
- make it responsive and keyboard accessible
- add tests

Do not add client-specific styling configuration. Styling remains directly editable in HTML/Tailwind/CSS.
Run tests and build when complete.
```

## 10. New domain prompt template

```text
Read CLAUDE.md, docs/ARCHITECTURE.md, and inspect the Catalog domain as the reference pattern.

Add a new domain for:
<business capability>

Before implementation, state:
- confirmed requirements
- API endpoints/contracts available
- assumptions/open API gaps
- proposed pages, parts, state, and data files

Create only the folders/files actually needed.
Lazy-load the domain route when appropriate.
Reuse design/ and widgets/.
Do not duplicate foundation network/session logic.
Add realistic mock handlers/fixtures that match the real API contract.
Add tests and relevant E2E coverage.
Run tests/build and stop after this domain is complete.
```

## 11. API change prompt template

```text
The YOB API contract changed:
<describe or attach updated OpenAPI/Postman/sample>

Before changing UI code:
1. compare the new contract with reference/api
2. list breaking and non-breaking changes
3. update docs/API-CONTRACT.md and typed data/network code
4. update mocks to match exactly
5. update affected state/pages/widgets
6. update tests

Do not preserve an old frontend shape by inventing compatibility behavior unless requested.
Run affected tests, broader network/session tests when relevant, E2E, and production build.
```

## 12. Shell redesign prompt template

```text
Change the secure/public shell layout as follows:
<describe arrangement>

Keep domain pages independent of shell markup.
Reuse existing header/navigation/account/cart/footer pieces where they still fit.
Directly edit shell HTML/Tailwind/CSS; do not create a layout configuration engine.

Verify phone, tablet, laptop, and wide desktop behavior.
Run affected tests and build.
```

## 13. Definition of done for a change

A change is done when:

- behavior matches the request
- architecture remains understandable
- no duplicate reusable behavior was introduced without reason
- API behavior matches verified contract
- mock behavior still matches real contract
- loading/error/empty states remain valid
- responsive behavior is checked when UI changed
- tests pass
- production build passes
- relevant E2E passes
- docs are updated only when a durable project rule/contract changed
