import Leangame.Defs

/-!
# First results (Axler 1.26–1.32)

Each result has a proof that follows the book's. These are the moves a player unlocks by proving them:
`neg_one_smul` (`(-1) • v = -v`, 1.32) is the planned challenge level.

Everything here is `protected`, so it's always written qualified (`VectorSpace.zero_smul`), never just
`zero_smul`, which is Mathlib's.
-/

universe u v

namespace Axler

namespace AddLaws

variable {V : Type v} [Add V] [Zero V] [Neg V] [AddLaws V]

/-- `0 + v = v`: the additive identity works on the left too (commutativity). -/
protected theorem zero_add (v : V) : 0 + v = v := by
  rw [AddLaws.add_comm, AddLaws.add_zero]

/-- `-v + v = 0`: the inverse works on the left too. -/
protected theorem neg_add_cancel (v : V) : -v + v = 0 := by
  rw [AddLaws.add_comm, AddLaws.add_neg_cancel]

/-- The book's wording of the additive inverse law (1.20): every vector has one. -/
protected theorem exists_add_eq_zero (v : V) : ∃ w : V, v + w = 0 :=
  ⟨-v, AddLaws.add_neg_cancel v⟩

/-- Axler 1.26: a vector space has a unique additive identity.
Proof as in the book: `0' = 0' + 0 = 0 + 0' = 0`. -/
protected theorem zero_unique (z : V) (h : ∀ v : V, v + z = v) : z = 0 :=
  calc z = z + 0 := (AddLaws.add_zero z).symm
    _ = 0 + z := AddLaws.add_comm z 0
    _ = 0 := h 0

/-- Axler 1.27: every vector has a unique additive inverse. If `v + w = 0` then `w` is `-v`.
Proof as in the book: `w = w + 0 = w + (v + -v) = (w + v) + -v = 0 + -v = -v`. -/
protected theorem neg_unique {v w : V} (h : v + w = 0) : w = -v :=
  calc w = w + 0 := (AddLaws.add_zero w).symm
    _ = w + (v + -v) := by rw [AddLaws.add_neg_cancel v]
    _ = (w + v) + -v := (AddLaws.add_assoc w v (-v)).symm
    _ = (v + w) + -v := by rw [AddLaws.add_comm w v]
    _ = 0 + -v := by rw [h]
    _ = -v := AddLaws.zero_add (-v)

/-- `-(-v) = v` (Axler, exercise 1B.1). -/
protected theorem neg_neg (v : V) : -(-v) = v :=
  (AddLaws.neg_unique (AddLaws.neg_add_cancel v)).symm

/-- The cancellation step that 1.30 and 1.31 share: a vector equal to its own double is `0`.
`x = x + 0 = x + (x + -x) = (x + x) + -x = x + -x = 0`. -/
protected theorem eq_zero_of_add_self {x : V} (h : x + x = x) : x = 0 :=
  calc x = x + 0 := (AddLaws.add_zero x).symm
    _ = x + (x + -x) := by rw [AddLaws.add_neg_cancel x]
    _ = (x + x) + -x := (AddLaws.add_assoc x x (-x)).symm
    _ = x + -x := by rw [h]
    _ = 0 := AddLaws.add_neg_cancel x

end AddLaws

namespace VectorSpace

variable {F : Type u} {V : Type v} [Field F] [Add V] [Zero V] [Neg V] [SMul F V] [AddLaws V] [VectorSpace F V]

/-- Axler 1.30: the number `0` times a vector is the vector `0`.
Proof as in the book: `0v = (0 + 0)v = 0v + 0v`, then cancel. -/
protected theorem zero_smul (v : V) : (0 : F) • v = 0 :=
  AddLaws.eq_zero_of_add_self <| calc
    (0 : F) • v + (0 : F) • v = ((0 : F) + 0) • v := (VectorSpace.add_smul (0 : F) 0 v).symm
    _ = (0 : F) • v := by rw [add_zero]

/-- Axler 1.31: a number times the vector `0` is `0`.
Proof as in the book: `a0 = a(0 + 0) = a0 + a0`, then cancel. -/
protected theorem smul_zero (a : F) : a • (0 : V) = 0 :=
  AddLaws.eq_zero_of_add_self <| calc
    a • (0 : V) + a • (0 : V) = a • ((0 : V) + 0) := (VectorSpace.smul_add a (0 : V) 0).symm
    _ = a • (0 : V) := by rw [AddLaws.add_zero (0 : V)]

/-- Axler 1.32: the number `-1` times `v` is the additive inverse of `v`.
Proof as in the book: `v + (-1)v = 1v + (-1)v = (1 + (-1))v = 0v = 0`, so `(-1)v` is *the* inverse (1.27). -/
protected theorem neg_one_smul (v : V) : (-1 : F) • v = -v :=
  AddLaws.neg_unique <| calc
    v + (-1 : F) • v = (1 : F) • v + (-1 : F) • v := by rw [VectorSpace.one_smul (F := F) v]
    _ = ((1 : F) + -1) • v := (VectorSpace.add_smul (1 : F) (-1) v).symm
    _ = (0 : F) • v := by rw [add_neg_cancel]
    _ = 0 := VectorSpace.zero_smul (F := F) v

/-- `(-a) • v = -(a • v)`: `a v + (-a) v = (a + -a) v = 0 v = 0`. -/
protected theorem neg_smul (a : F) (v : V) : (-a) • v = -(a • v) :=
  AddLaws.neg_unique <| calc
    a • v + (-a) • v = (a + -a) • v := (VectorSpace.add_smul a (-a) v).symm
    _ = (0 : F) • v := by rw [add_neg_cancel]
    _ = 0 := VectorSpace.zero_smul (F := F) v

/-- `a • (-v) = -(a • v)`: `a v + a (-v) = a (v + -v) = a 0 = 0`. -/
protected theorem smul_neg (a : F) (v : V) : a • (-v) = -(a • v) :=
  AddLaws.neg_unique <| calc
    a • v + a • (-v) = a • (v + -v) := (VectorSpace.smul_add a v (-v)).symm
    _ = a • (0 : V) := by rw [AddLaws.add_neg_cancel v]
    _ = 0 := VectorSpace.smul_zero a

end VectorSpace

end Axler
