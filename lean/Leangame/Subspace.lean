import Leangame.Basic

/-!
# Subspaces (Axler 1.33, 1.34)

1.33, the book's definition: a subset `U` of `V` is a *subspace* if `U` is also a vector space with the same additive
identity, addition and scalar multiplication as on `V`. `IsSubspace F U` says exactly that, law by law (1.20 for `U`):

* `V`'s addition and scalar multiplication are operations on `U`: they don't leave it
* `V`'s `0` is in `U` (the same additive identity) and is an identity there
* the other laws of 1.20 hold for elements of `U`
* every element of `U` has an additive inverse in `U`. By 1.27 an additive inverse is unique, so it has to be
  `V`'s `-u`: the law reads `-u ∈ U`

1.34 is the easy test: `U` is a subspace exactly when `0 ∈ U` and it's closed under addition and scalar
multiplication (`isSubspace_iff`). The only step with content is `-u = (-1)u ∈ U` (1.32); the laws hold in `U`
because they hold in `V`.

For working with subspaces afterwards, the three conditions are what's convenient (Mathlib's `Submodule` is the same
idea): `Subspace F V` bundles a set with them, and `Subspace.isSubspace` (1.34) says it is a subspace in the book's
sense.
-/

universe u v

namespace Axler

variable {F : Type u} {V : Type v} [Field F] [Add V] [Zero V] [Neg V] [SMul F V] [AddLaws V] [VectorSpace F V]

variable (F) in
/-- Axler 1.33: `U` is a vector space with `V`'s additive identity, addition and scalar multiplication. -/
structure IsSubspace (U : Set V) : Prop where
  /-- `V`'s addition is an addition on `U` -/
  add_mem : ∀ u w : V, u ∈ U → w ∈ U → u + w ∈ U
  /-- `V`'s scalar multiplication is a scalar multiplication on `U` -/
  smul_mem : ∀ (a : F) (u : V), u ∈ U → a • u ∈ U
  /-- the same additive identity: `V`'s `0` is in `U` -/
  zero_mem : (0 : V) ∈ U
  /-- commutativity, in `U` -/
  add_comm : ∀ u w : V, u ∈ U → w ∈ U → u + w = w + u
  /-- associativity, in `U` -/
  add_assoc : ∀ u v w : V, u ∈ U → v ∈ U → w ∈ U → (u + v) + w = u + (v + w)
  /-- additive identity, in `U` -/
  add_zero : ∀ u : V, u ∈ U → u + 0 = u
  /-- additive inverse, in `U` (unique by 1.27, so it's `-u`) -/
  neg_mem : ∀ u : V, u ∈ U → -u ∈ U
  /-- associativity of scalar multiplication, in `U` -/
  mul_smul : ∀ (a b : F) (u : V), u ∈ U → (a * b) • u = a • (b • u)
  /-- multiplicative identity, in `U` -/
  one_smul : ∀ u : V, u ∈ U → (1 : F) • u = u
  /-- distributive property, in `U` -/
  smul_add : ∀ (a : F) (u w : V), u ∈ U → w ∈ U → a • (u + w) = a • u + a • w
  /-- distributive property, in `U` -/
  add_smul : ∀ (a b : F) (u : V), u ∈ U → (a + b) • u = a • u + b • u

/-- Axler 1.34, conditions for a subspace: `U` is a subspace of `V` if and only if `0 ∈ U`, `U` is closed under
addition, and `U` is closed under scalar multiplication. -/
theorem isSubspace_iff (U : Set V) :
    IsSubspace F U ↔ ((0 : V) ∈ U ∧ (∀ u w : V, u ∈ U → w ∈ U → u + w ∈ U) ∧
      (∀ (a : F) (u : V), u ∈ U → a • u ∈ U)) := by
  constructor
  · intro h
    exact ⟨h.zero_mem, h.add_mem, h.smul_mem⟩
  · rintro ⟨h0, ha, hs⟩
    exact {
      add_mem := ha
      smul_mem := hs
      zero_mem := h0
      add_comm := fun u w _ _ => AddLaws.add_comm u w
      add_assoc := fun u v w _ _ _ => AddLaws.add_assoc u v w
      add_zero := fun u _ => AddLaws.add_zero u
      -- the one step with content: -u = (-1)u (1.32), and (-1)u ∈ U because U is closed under scalars
      neg_mem := fun u hu => by rw [← VectorSpace.neg_one_smul (F := F) u]; exact hs (-1) u hu
      mul_smul := fun a b u _ => VectorSpace.mul_smul a b u
      one_smul := fun u _ => VectorSpace.one_smul u
      smul_add := fun a u w _ _ => VectorSpace.smul_add a u w
      add_smul := fun a b u _ => VectorSpace.add_smul a b u }

variable (F V) in
/-- A subspace, the convenient way: a set of vectors with `0` in it, closed under addition and scalar
multiplication (like Mathlib's `Submodule`). By 1.34 it is a subspace in the book's sense (`Subspace.isSubspace`). -/
structure Subspace where
  /-- the vectors in the subspace -/
  carrier : Set V
  zero_mem : (0 : V) ∈ carrier
  add_mem : ∀ u w : V, u ∈ carrier → w ∈ carrier → u + w ∈ carrier
  smul_mem : ∀ (a : F) (u : V), u ∈ carrier → a • u ∈ carrier

namespace Subspace

/-- 1.34: a `Subspace` is a subspace in the book's sense (1.33). -/
theorem isSubspace (S : Subspace F V) : IsSubspace F S.carrier :=
  (isSubspace_iff S.carrier).2 ⟨S.zero_mem, S.add_mem, S.smul_mem⟩

/-- A subspace has the additive inverses of its elements. -/
theorem neg_mem (S : Subspace F V) {u : V} (hu : u ∈ S.carrier) : -u ∈ S.carrier :=
  S.isSubspace.neg_mem u hu

end Subspace

end Axler
