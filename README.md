# Leangame

A mobile-first, game-style playground for the algebra of vector spaces, built while working through Sheldon Axler's *Linear Algebra Done Right* (4th ed.).

## The idea

- **Scalars** (gold hexagons) and **vectors** (blue arrows) are physical tiles. Each shows its type on a top band (ℝ, ℂ, 𝑉, 𝑈 ⊂ ℝ³) and its element below.
- Tiles dock to multiply: scalars overlap tip to tip with a · between them; a scalar docks onto a vector's left field edge, which shows the vector space's field (or an abstract 𝐅).
- **Sum spaces** are thick brackets — gold for sums of scalars, blue for sums of vectors — that grow to hold their terms, with plus signs drawn along the shortest path between them.
- A **Rules** mode allows only moves the axioms justify: reordering products, rearranging sums, and distributing or factoring (scalars into or out of brackets, a vector out of a sum, pulling a bracket off a vector).

## Where this is headed

Each move maps to a Lean/Mathlib rewrite (`add_smul`, `smul_add`, `mul_comm`, `one_smul`, …). The plan is a Lean REPL backend that checks each step (Lean as referee) and later drives the board directly, so the visual state and a real Lean proof state stay in sync. Levels come from the book's results; solving one unlocks its result as a new move.

## Status

Front-end prototype stage.

## Running it

No build step: Preact and htm are vendored in `vendor/` as ES modules.

```sh
npm run serve      # python3 -m http.server 8000, then open http://localhost:8000
npm test           # node --test: gesture and evaluation tests for the Range
```

## Layout

- `index.html`, `styles.css`: the page shell
- `src/range/Range.js`: the Range board (tiles, brackets, docking, Rules mode, pan and pinch zoom)
- `src/main.js`, `src/html.js`: mounting and the `html` template tag
- `vendor/`: Preact 10 and htm 3 (MIT, licenses alongside)
- `tests/`: `node:test` suites that drive the component directly
- `lean/`: the Lean project: vector spaces as Axler defines them (1.20) and the first results (1.26–1.32), on Mathlib
- `server/`: the referee on the Lean machine: board moves in, Lean's verdict out (`python3 -m unittest discover -s server`)
- `src/lean/`: the Play button, which wakes the Lean machine (it sleeps after 10 idle minutes)

## Deploying

`main` deploys to **https://lean.interlinea.io** through `.github/workflows/deploy.yml` (S3 + CloudFront, signed in to AWS with GitHub OIDC; no stored keys). The infrastructure is in `roboticminstrel/Interlinea-proto` (`infra/terraform/lean.tf`). Once that's applied, merging to `main` deploys; no repository variables are needed (the deploy role is fixed and the distribution id comes from SSM).

`scripts/deploy.sh` also works by hand with an AWS login: `BUCKET=lean-interlinea-io-site scripts/deploy.sh`.
