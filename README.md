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
