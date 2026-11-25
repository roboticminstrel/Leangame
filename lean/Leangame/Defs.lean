import Mathlib.Algebra.Field.Defs
import Mathlib.Algebra.Group.Action.Defs

/-!
# Vector spaces, following Axler

Axler, *Linear Algebra Done Right* (4th ed.), definition 1.20: a vector space is a set `V` with an addition on `V`
and a scalar multiplication on `V` such that eight properties hold.

The Lean version keeps that shape. The *operations* are separate instances on the carrier type `V`:

* `Add V` (`u + v`), `Zero V` (`0`), `Neg V` (`-v`), and `SMul F V` (`a • v`)

The *properties* are two classes. Both are propositions, so all they record is that the laws hold:

* `AddLaws V`: the four laws about addition alone (they don't mention the field)
* `VectorSpace F V`: the four laws that involve scalars

The split is there for a Lean reason. A law that doesn't mention `F`, like `u + v = v + u`, can't be part of a
class indexed by `F`: Lean would have no way to work out which field is meant when you use it.

One difference from the book: 1.20 says each `v` *has* an additive inverse (`∃ w, v + w = 0`). Here `-v` is part
of the data, and the law is `v + -v = 0`. The book proves the inverse is unique (1.27) and only then writes `-v`
(1.28). The same result is `AddLaws.neg_unique` in `Leangame.Basic`, and `AddLaws.exists_add_eq_zero` recovers the
book's wording.

To work in an abstract vector space, take this list of variables:

```
variable {F V : Type*} [Field F] [Add V] [Zero V] [Neg V] [SMul F V] [AddLaws V] [VectorSpace F V]
```

The scalars `F` are any Mathlib `Field` (Axler: `F` is `ℝ` or `ℂ`). The field axioms (1.3) are Mathlib's.

Lemma names follow Mathlib's (`add_smul`, `smul_add`, `mul_smul`, `one_smul`, …), which are also the board's move
names, but they live in the `Axler` namespace. Always write them qualified (`VectorSpace.add_smul`), because
Mathlib's versions of the same names need Mathlib's own classes.
-/

universe u v

namespace Axler

/-- Axler 1.20, the four laws about addition: commutativity, associativity, additive identity, additive inverse. -/
class AddLaws (V : Type v) [Add V] [Zero V] [Neg V] : Prop where
  /-- commutativity: `u + v = v + u` -/
  add_comm : ∀ u v : V, u + v = v + u
  /-- associativity: `(u + v) + w = u + (v + w)` -/
  add_assoc : ∀ u v w : V, (u + v) + w = u + (v + w)
  /-- additive identity: `v + 0 = v` -/
  add_zero : ∀ v : V, v + 0 = v
  /-- additive inverse: `v + (-v) = 0` -/
  add_neg_cancel : ∀ v : V, v + -v = 0

/-- Axler 1.20, the four laws that involve scalars: associativity of scalar multiplication, the multiplicative
identity, and the two distributive properties. -/
class VectorSpace (F : Type u) (V : Type v) [Field F] [Add V] [Zero V] [Neg V] [SMul F V] [AddLaws V] : Prop where
  /-- associativity: `(a * b) • v = a • (b • v)` -/
  mul_smul : ∀ (a b : F) (v : V), (a * b) • v = a • (b • v)
  /-- multiplicative identity: `1 • v = v` -/
  one_smul : ∀ v : V, (1 : F) • v = v
  /-- distributive property: `a • (u + v) = a • u + a • v` -/
  smul_add : ∀ (a : F) (u v : V), a • (u + v) = a • u + a • v
  /-- distributive property: `(a + b) • v = a • v + b • v` -/
  add_smul : ∀ (a b : F) (v : V), (a + b) • v = a • v + b • v

end Axler
