import Leangame.Defs
import Mathlib.Algebra.Module.Defs

/-!
# Agreement with Mathlib

Every Mathlib module over a field is a vector space in Axler's sense. This is a check that the definition in
`Leangame.Defs` says what Mathlib says. It also brings in Mathlib's examples: `Fin n → F` (`Fⁿ`), `ℕ → F` (`F^∞`),
and so on.

The instances have low priority, so a type with its own `AddLaws`/`VectorSpace` instance (like `Vec2`) keeps it.
-/

universe u v

namespace Axler

instance (priority := 100) AddLaws.ofAddCommGroup {V : Type v} [AddCommGroup V] : AddLaws V where
  add_comm := _root_.add_comm
  add_assoc := _root_.add_assoc
  add_zero := _root_.add_zero
  add_neg_cancel := _root_.add_neg_cancel

instance (priority := 100) VectorSpace.ofModule {F : Type u} {V : Type v} [Field F] [AddCommGroup V] [Module F V] :
    VectorSpace F V where
  mul_smul a b v := by rw [SemigroupAction.mul_smul]
  one_smul v := by rw [_root_.one_smul]
  smul_add a u v := by rw [_root_.smul_add]
  add_smul a b v := by rw [_root_.add_smul]

end Axler
