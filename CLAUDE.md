# CLAUDE.md: Leangame handoff notes

Context for a new Claude Code session. The owner is James (GitHub `roboticminstrel`), a data engineer with a game-programming background who is working through Axler's *Linear Algebra Done Right* (4th ed., CC BY-NC 4.0). He works mostly from his phone, so keep reports short and lead with what he needs to do.

## What this is

**The Range** is a mobile-first, drag-and-dock playground for vector-space algebra. Scalars and vectors are physical tiles, and every legal move corresponds to a field or vector-space axiom. Long term, each gesture maps to a Lean/Mathlib rewrite (`add_smul`, `smul_add`, `mul_comm`, `one_smul`, …). A Lean REPL backend would first referee moves and later drive the board, so the board and a real Lean proof state stay in sync. Levels come from the book; solving one unlocks its result as a new move. A planned challenge level is `-v = (-1)v`. **No Lean backend exists yet.** The current work is the front end.

The Range started as one tab of a larger design-canvas prototype: a chapter 1–3 concept graph of the book, with a detail sheet showing the formal text. That prototype lives as a claude.ai artifact, not in this repo. This repo is only the Range.

## Visual and interaction spec (agreed with James; keep it)

- **Scalar**: a gold hexagon. The type band (ℝ/ℂ) is on top and the element is below.
- **Vector**: a blue arrow with a type band (𝑉, 𝑈 ⊂ ℝ³) and the element. Its left **field edge** (gold band plus cream body) shows a sunken 𝐅 when abstract, or a raised ℝ/ℂ parallelogram strip. Holding the strip removes it. A docked scalar fully covers the edge.
- **Products**: scalars overlap tip to tip with a · badge. Dragging a vector drags its docked scalars along.
- **Sums** are brackets:
  - gold, thick, for scalar sums, with an ℝ tag on the right at band level
  - blue for vector sums: a notch and field tag on the left (the tag fades when a scalar docks there), and the 𝑉 tag on the right
- **Plus signs** sit at the midpoint between the nearest edges of neighboring terms, placed along the shortest path. Double-tapping a plus lines the terms up in one row.
- **No mixing types in a sum.** Nested sums are always flattened (`(a+b)+c` becomes `a+b+c`); see `normTops`, `normalize`.
- **Rules mode** allows only axiom-justified moves:
  - reorder by dragging sideways (dragging a vector moves its whole block)
  - **distribute**: drag the adjacent scalar into a bracket; ghosts preview the left and right neighbors
  - **factor**: drop a chain's last scalar on a matching scalar, with a glow pulse
  - **vector factor**: drop 𝑣 on 𝑣
  - **expand `(a+b)v`**: pull the scalar bracket off 𝑣. Dragging 𝑣 left isn't available because that gesture moves the block.
- Pan by dragging empty board; pinch to zoom.
- The readout always shows the evaluated value (the start position evaluates to `= 4𝑣`).

## Code

No build step. Preact 10.29.8 and htm 3.1.1 are vendored in `vendor/` as ES modules, with their MIT licenses.

- `index.html`, `styles.css`: page shell (Inter and STIX Two Text from Google Fonts). The board is capped at 560px wide and centered.
- `src/main.js`: mounts `<Range/>`. `src/html.js`: `htm.bind(h)`.
- `src/range/Range.js` (~1080 lines): one class component, mechanically converted from the canvas prototype.
  - **Model**: tiles are `s` (scalar: field, el, val) and `v` (vector: type, el, key, field). `prod` is `{factors, vec}`. `sum` is `{terms}`. `tops` holds the root expressions. Constructors: `mkS`, `mkV`, `mkProd`, `mkSum`. Helpers: `locate`, `setRef`, `walk`, `cloneFresh`.
  - **Typing and evaluation**: `typeOf`; `evalN` uses complex arithmetic (`mulC`, `addC`); formatting via `fmtVal`.
  - **Layout**: `measure` → `layout` → `place`. Plus signs come from `plusesFor`, `gapMid` and `bestPath`. Overlap constants: `ovFF`, `ovFV`.
  - **Gestures**: `begin` / `move` / `end` (tiles) and `pieceDown` / `pmove` / `pend` (field strips). Previews come from `findPreview` and `findVecPreview`, are applied by `applyPreview`, and sandbox drops go through `dropSand`. Also `longPress`, `tapPlus`, `arrange`.
  - **Scaling**: world units are 560 wide. `fitScale() = boardWidth / 560`, and `scaleNow(z)` multiplies that by zoom. Don't name a method `base`: Preact uses `this.base` for the DOM node.
- `tests/range.test.mjs`: 13 `node:test` tests. They drive the component directly with a synchronous `setState` stub (`make()`); `ev(x,y)` scales by 390/560 and `dragTo(c,id,tx,ty,role)` simulates drags. They cover evaluation, multiply, type refusal, reorder, distribute both sides, vector-sum expand, collect, partial collect, leftover becomes 1, collectV then pull-off expandV, short pull doesn't expand, plus position, and flattening.

```sh
npm test            # node --test tests/*.test.mjs (a bare directory arg doesn't work)
npm run serve       # python3 -m http.server 8000
```

For browser checks, headless Chrome through Python Playwright worked (`/usr/bin/google-chrome`). Font and favicon load errors are expected offline.

## Deploy (lean.interlinea.io)

Leangame is hosted the same way as James's other project, Interlinea (`roboticminstrel/Interlinea-proto`): S3 + CloudFront, signed in to AWS with GitHub OIDC and no stored keys.

- **Infra**: Interlinea-proto, `infra/terraform/lean.tf` (PR #18). It creates:
  - bucket `lean-interlinea-io-site`, a us-east-1 ACM cert, a CloudFront distribution and Route53 A/AAAA records
  - role `interlinea-lean-deploy`, which only Leangame's `main` can assume. It carries the `interlinea-workload-boundary`, and its only permissions are writing that bucket, invalidating that distribution and reading one SSM parameter.
  - SSM `/interlinea/lean/distribution-id` in **us-east-1**
- **Applying it**: the Infrastructure workflow in Interlinea-proto. James must start it from main and comment "approve" on the issue it opens. Don't try to bypass that gate.
- **Leangame side**: `.github/workflows/deploy.yml` runs on pushes to main that touch site files, or by hand. It runs the tests, assumes `arn:aws:iam::589305835200:role/interlinea-lean-deploy` (region us-east-2), then runs `scripts/deploy.sh`. The script syncs to S3 (index.html no-cache, everything else max-age 300) and invalidates CloudFront, reading the distribution ID from SSM. No repo variables are needed; `vars.*` can override.
- `test.yml` runs `npm test` on pushes and PRs.

### Status at handoff (2026-11-25)

- Leangame PR #1 (`range-standalone`): the port, tests, CI, deploy workflow and this file. **Not merged.**
- Interlinea-proto PR #18 (`lean-subdomain`): the Terraform. James started the Infrastructure run around 00:30 PT. **Whether it was approved and applied is unknown; ask him or check the site.** It has never been through `terraform validate` (Terraform wasn't installable in that session), so if the plan fails, fix lean.tf on that branch. It references existing `aws.us_east_1`, `data.aws_route53_zone.main`, `data.aws_cloudfront_cache_policy.optimized`, `aws_cloudfront_response_headers_policy.security`, `local.github_oidc_arn` and `local.workload_boundary`.
- After the apply succeeds, merging PR #1 deploys.
- Leftover: the throwaway branch `claude/lean-probe` in Interlinea-proto, which read the account ID. Branch deletes were blocked from the session; James can delete it.

## Working conventions

- Don't commit to main; use a branch and open a PR. Commit or push only when James asks.
- Push with `git -c push.negotiate=true push -u origin BRANCH`.
- Open PRs through REST, not GraphQL: `gh api repos/OWNER/REPO/pulls -f title=… -f head=… -f base=main -F body=@file`.
- From the Claude session proxy, the GitHub Actions API (variables, dispatch) and ref deletes were blocked. Design around that: James can run workflows and click buttons.
- Interlinea-proto's IAM rules: every role or policy is named `interlinea-*` and carries `permissions_boundary = local.workload_boundary`. The boundary allows only listed services; for example, `cloudfront:ListDistributions` isn't allowed, which is why the distribution ID goes through SSM.
- Commit messages end with a `Co-Authored-By:` line naming the model, and PR bodies end with a Claude Code attribution line.

## Ideas discussed but not built

- Lean REPL server, "referee vs engine": start as a referee that checks each move through REPL `proofState`. Candidates were a small EC2 CPU instance or Lambda (cold starts with Mathlib are heavy).
- Lean-style statements for linear independence (Mathlib `LinearIndependent`, `Fintype.linearIndependent_iff`) and concrete vector space examples as future levels.
